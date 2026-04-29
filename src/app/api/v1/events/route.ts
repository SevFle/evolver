import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/server/auth/middleware";
import { createEvent, getEndpointById, resolveFanoutEndpoints } from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { MAX_PAYLOAD_SIZE_BYTES } from "@/lib/constants";

const sendEventSchema = z.object({
  endpointId: z.string().min(1),
  payload: z.record(z.unknown()),
  eventType: z.string().min(1).max(255),
  idempotencyKey: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().max(255).optional(),
});

const sendFanoutEventSchema = z.object({
  endpointGroupId: z.string().uuid().optional(),
  endpointIds: z.array(z.string().uuid()).min(1).max(50).optional(),
  payload: z.record(z.unknown()),
  eventType: z.string().min(1).max(255),
  idempotencyKey: z.string().max(255).optional(),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().max(255).optional(),
}).refine(
  (data) => data.endpointGroupId || data.endpointIds,
  "Must provide endpointGroupId or endpointIds",
);

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentLength = req.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_PAYLOAD_SIZE_BYTES) {
    return NextResponse.json(
      { error: "Payload too large" },
      { status: 413 },
    );
  }

  const body = await req.json();

  if (body.endpointGroupId || body.endpointIds) {
    return handleFanoutEvent(body, auth.userId);
  }

  return handleSingleEvent(body, auth.userId);
}

async function handleSingleEvent(body: unknown, userId: string) {
  const parsed = sendEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const endpoint = await getEndpointById(parsed.data.endpointId);
  if (!endpoint) {
    return NextResponse.json(
      { error: "Endpoint not found" },
      { status: 404 },
    );
  }

  if (endpoint.userId !== userId) {
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

  const event = await createEvent({ ...parsed.data, userId });

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
    },
    { status: 202 },
  );
}

async function handleFanoutEvent(body: unknown, userId: string) {
  const parsed = sendFanoutEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const resolveOpts: { endpointGroupId?: string; endpointIds?: string[] } = {};
  if (parsed.data.endpointGroupId) {
    resolveOpts.endpointGroupId = parsed.data.endpointGroupId;
  }
  if (parsed.data.endpointIds) {
    resolveOpts.endpointIds = parsed.data.endpointIds;
  }

  let fanoutEndpoints;
  try {
    fanoutEndpoints = await resolveFanoutEndpoints(userId, resolveOpts);
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "NOT_FOUND") {
      return NextResponse.json(
        { error: err.message },
        { status: 404 },
      );
    }
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "BAD_REQUEST") {
      return NextResponse.json(
        { error: err.message },
        { status: 400 },
      );
    }
    throw err;
  }

  const endpointGroupId = parsed.data.endpointGroupId ?? null;

  const event = await createEvent({
    userId,
    endpointId: undefined,
    endpointGroupId: endpointGroupId ?? undefined,
    payload: parsed.data.payload,
    eventType: parsed.data.eventType,
    idempotencyKey: parsed.data.idempotencyKey,
    metadata: parsed.data.metadata,
    source: parsed.data.source,
  });

  if (!event) {
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 },
    );
  }

  const jobs = await Promise.all(
    fanoutEndpoints.map((endpoint) =>
      enqueueDelivery({
        eventId: event.id,
        endpointId: endpoint.id,
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
      fanoutEndpoints: fanoutEndpoints.length,
      deliveryJobs: jobs.length,
    },
    { status: 202 },
  );
}
