import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/server/auth/middleware";
import {
  createEvent,
  getEndpointById,
  resolveFanoutEndpoints,
  resolveSubscribedEndpoints,
} from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { MAX_PAYLOAD_SIZE_BYTES } from "@/lib/constants";

const ingestEventSchema = z.object({
  eventType: z.string().min(1).max(255),
  payload: z.record(z.unknown()),
  endpointId: z.string().uuid().optional(),
  endpointGroupId: z.string().uuid().optional(),
  endpointIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  subscribe: z.boolean().optional(),
  idempotencyKey: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().max(255).optional(),
});

interface IngestPayload {
  eventType: string;
  payload: Record<string, unknown>;
  endpointId?: string;
  endpointGroupId?: string;
  endpointIds?: string[];
  subscribe?: boolean;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json(
      { error: "Unauthorized", message: "Missing or invalid API key" },
      { status: 401 },
    );
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PAYLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Payload too large", message: `Maximum payload size is ${MAX_PAYLOAD_SIZE_BYTES} bytes` },
      { status: 413 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON", message: "Request body must be valid JSON" },
      { status: 400 },
    );
  }

  const parsed = ingestEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { userId } = auth;
  const data = parsed.data;

  if (data.subscribe === true) {
    return handleSubscriptionIngestion(data, userId);
  }

  if (data.endpointGroupId || data.endpointIds) {
    return handleFanoutIngestion(data, userId);
  }

  if (data.endpointId) {
    return handleDirectIngestion(data, data.endpointId, userId);
  }

  return NextResponse.json(
    { error: "Validation failed", message: "Must provide endpointId, endpointGroupId, endpointIds, or subscribe: true" },
    { status: 400 },
  );
}

async function handleDirectIngestion(
  data: IngestPayload,
  endpointId: string,
  userId: string,
) {
  const endpoint = await getEndpointById(endpointId, userId);
  if (!endpoint) {
    return NextResponse.json(
      { error: "Endpoint not found" },
      { status: 404 },
    );
  }

  if (endpoint.status === "disabled") {
    return NextResponse.json(
      { error: "Endpoint not found or disabled" },
      { status: 404 },
    );
  }

  const event = await createEvent({
    userId,
    endpointId: endpoint.id,
    payload: data.payload,
    eventType: data.eventType,
    idempotencyKey: data.idempotencyKey,
    metadata: data.metadata,
    source: data.source,
  });

  if (!event) {
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }

  await enqueueDelivery({
    eventId: event.id,
    endpointId: endpoint.id,
    attemptNumber: 1,
  });

  return NextResponse.json(
    {
      id: event.id,
      status: event.status,
      eventType: event.eventType,
      createdAt: event.createdAt,
      deliveryJobs: 1,
    },
    { status: 202 },
  );
}

async function handleFanoutIngestion(
  data: IngestPayload,
  userId: string,
) {
  const options: { endpointGroupId?: string; endpointIds?: string[] } = {};
  if (data.endpointGroupId) {
    options.endpointGroupId = data.endpointGroupId;
  }
  if (data.endpointIds) {
    options.endpointIds = data.endpointIds;
  }

  let targetEndpoints;
  try {
    targetEndpoints = await resolveFanoutEndpoints(userId, options);
  } catch (err) {
    if (err instanceof Error && "code" in err) {
      const code = (err as { code: string }).code;
      if (code === "NOT_FOUND") {
        return NextResponse.json({ error: err.message }, { status: 404 });
      }
      if (code === "BAD_REQUEST") {
        return NextResponse.json({ error: err.message }, { status: 400 });
      }
    }
    throw err;
  }

  const endpointGroupId = data.endpointGroupId ?? null;

  const event = await createEvent({
    userId,
    endpointId: undefined,
    endpointGroupId,
    payload: data.payload,
    eventType: data.eventType,
    idempotencyKey: data.idempotencyKey,
    metadata: data.metadata,
    source: data.source,
    allowNoTarget: true,
  });

  if (!event) {
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }

  const jobs = await Promise.all(
    targetEndpoints.map((ep) =>
      enqueueDelivery({
        eventId: event.id,
        endpointId: ep.id,
        attemptNumber: 1,
      }),
    ),
  );

  return NextResponse.json(
    {
      id: event.id,
      status: event.status,
      eventType: event.eventType,
      createdAt: event.createdAt,
      fanoutEndpoints: targetEndpoints.length,
      deliveryJobs: jobs.length,
    },
    { status: 202 },
  );
}

async function handleSubscriptionIngestion(
  data: IngestPayload,
  userId: string,
) {
  const subscribedEndpoints = await resolveSubscribedEndpoints(
    userId,
    data.eventType,
  );

  if (subscribedEndpoints.length === 0) {
    return NextResponse.json(
      { error: "No subscribed endpoints found for this event type" },
      { status: 404 },
    );
  }

  const event = await createEvent({
    userId,
    endpointId: undefined,
    payload: data.payload,
    eventType: data.eventType,
    idempotencyKey: data.idempotencyKey,
    metadata: { ...data.metadata, _subscriptionFanout: true },
    source: data.source,
    allowNoTarget: true,
  });

  if (!event) {
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }

  const jobs = await Promise.all(
    subscribedEndpoints.map((ep) =>
      enqueueDelivery({
        eventId: event.id,
        endpointId: ep.id,
        attemptNumber: 1,
      }),
    ),
  );

  return NextResponse.json(
    {
      id: event.id,
      status: event.status,
      eventType: event.eventType,
      createdAt: event.createdAt,
      fanoutEndpoints: subscribedEndpoints.length,
      deliveryJobs: jobs.length,
      subscriptionFanout: true,
    },
    { status: 202 },
  );
}
