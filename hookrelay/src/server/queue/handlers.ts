import type { DeliveryJobData } from "./queues";
import { enqueueDelivery } from "./producer";
import {
  getEndpointById,
  getEventById,
  createDelivery,
  updateEventStatus,
  getConsecutiveFailures,
  updateEndpoint,
} from "@/server/db/queries";
import { deliverWebhook, isSuccessfulDelivery } from "@/server/services/delivery";
import { getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import { getEndpointStatusAfterFailure, getEndpointStatusAfterSuccess, shouldBreakCircuit } from "@/server/services/circuit";

export async function handleDelivery(data: DeliveryJobData): Promise<void> {
  const event = await getEventById(data.eventId);
  if (!event) {
    console.error(`Event ${data.eventId} not found`);
    return;
  }

  const endpoint = await getEndpointById(data.endpointId);
  if (!endpoint || endpoint.status === "disabled") {
    await updateEventStatus(event.id, "failed");
    return;
  }

  await updateEventStatus(event.id, "delivering");

  try {
    const result = await deliverWebhook(
      endpoint.url,
      event.payload as Record<string, unknown>,
      endpoint.signingSecret,
      event.id,
      endpoint.customHeaders,
    );

    const success = isSuccessfulDelivery(result.statusCode);

    await createDelivery({
      eventId: event.id,
      endpointId: endpoint.id,
      attemptNumber: data.attemptNumber,
      statusCode: result.statusCode,
      responseBody: result.responseBody,
      responseHeaders: result.responseHeaders,
      durationMs: result.durationMs,
      status: success ? "success" : "failed",
    });

    if (success) {
      await updateEventStatus(event.id, "delivered");
      if (endpoint.status === "degraded") {
        await updateEndpoint(endpoint.id, {
          status: getEndpointStatusAfterSuccess(),
        });
      }
    } else {
      await handleFailedDelivery(event.id, endpoint.id, data.attemptNumber);
    }
  } catch (error) {
    await createDelivery({
      eventId: event.id,
      endpointId: endpoint.id,
      attemptNumber: data.attemptNumber,
      status: "failed",
    });

    await handleFailedDelivery(event.id, endpoint.id, data.attemptNumber);
  }
}

async function handleFailedDelivery(
  eventId: string,
  endpointId: string,
  attemptNumber: number,
): Promise<void> {
  if (hasRetriesRemaining(attemptNumber + 1)) {
    const nextRetryAt = getNextRetryAt(attemptNumber);
    await enqueueDelivery(
      { eventId, endpointId, attemptNumber: attemptNumber + 1 },
      nextRetryAt.getTime() - Date.now(),
    );
  } else {
    await updateEventStatus(eventId, "failed");
  }

  const consecutiveFailures = await getConsecutiveFailures(endpointId);
  const newStatus = getEndpointStatusAfterFailure(consecutiveFailures);
  if (newStatus !== "active") {
    await updateEndpoint(endpointId, { status: newStatus });
  }

  if (shouldBreakCircuit(consecutiveFailures)) {
    console.warn(
      `Endpoint ${endpointId} has ${consecutiveFailures} consecutive failures. Status: ${newStatus}. Owner should be alerted.`,
    );
  }
}
