import { NextRequest, NextResponse } from "next/server";
import { authenticateApiKey } from "@/server/auth/middleware";
import { getEventById, getDeliveriesByEventId, getEventsByEndpointId } from "@/server/db/queries";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const event = await getEventById(id, auth.userId);

  if (!event) {
    return NextResponse.json({ error: "Event not found" }, { status: 404 });
  }

  const deliveryAttempts = await getDeliveriesByEventId(id, auth.userId);

  return NextResponse.json({
    id: event.id,
    endpointId: event.endpointId,
    payload: event.payload,
    eventType: event.eventType,
    status: event.status,
    createdAt: event.createdAt,
    deliveries: deliveryAttempts.map((d) => ({
      id: d.id,
      attemptNumber: d.attemptNumber,
      statusCode: d.responseStatusCode,
      status: d.status,
      durationMs: d.durationMs,
      createdAt: d.createdAt,
    })),
  });
}
