import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authenticateApiKey } from "@/server/auth/middleware";
import { createEvent, getEndpointById } from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { MAX_PAYLOAD_SIZE_BYTES } from "@/lib/constants";

const sendEventSchema = z.object({
  endpointId: z.string().uuid("Must be a valid endpoint ID"),
  payload: z.record(z.unknown()),
  eventType: z.string().min(1).max(255),
});

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
  const parsed = sendEventSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const endpoint = await getEndpointById(parsed.data.endpointId, auth.userId);
  if (!endpoint || endpoint.status === "disabled") {
    return NextResponse.json(
      { error: "Endpoint not found or disabled" },
      { status: 404 },
    );
  }

  const event = await createEvent({ ...parsed.data, userId: auth.userId });

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
