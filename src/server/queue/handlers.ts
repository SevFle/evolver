import type { DeliveryJobData } from "./queues";
import { enqueueDelivery, enqueueDeadLetter } from "./producer";
import {
  getEndpointById,
  getEventById,
  createDelivery,
  updateEventStatus,
  getConsecutiveFailures,
  updateEndpoint,
  getSuccessfulDelivery,
} from "@/server/db/queries";
import { deliverWebhook, isSuccessfulDelivery } from "@/server/services/delivery";
import { getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import {
  getEndpointStatusAfterFailure,
  getEndpointStatusAfterSuccess,
  shouldBreakCircuit,
} from "@/server/services/circuit";
import { MAX_PAYLOAD_RESPONSE_SIZE } from "@/lib/constants";

function truncateResponse(body: string): string {
  if (body.length <= MAX_PAYLOAD_RESPONSE_SIZE) return body;
  return body.slice(0, MAX_PAYLOAD_RESPONSE_SIZE);
}

export async function handleDelivery(data: DeliveryJobData): Promise<void> {
  const alreadyDelivered = await getSuccessfulDelivery(data.eventId, data.endpointId);
  if (alreadyDelivered) {
    console.log(
      `Skipping duplicate delivery: event=${data.eventId} endpoint=${data.endpointId}`,
    );
    return;
  }

  const event = await getEventById(data.eventId);
  if (!event) {
    console.error(`Event ${data.eventId} not found`);
    return;
  }

  const endpoint = await getEndpointById(data.endpointId);
  if (!endpoint || endpoint.status === "disabled" || !endpoint.isActive) {
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
      endpoint.customHeaders as Record<string, string> | null,
    );

    const success = isSuccessfulDelivery(result.statusCode);

    await createDelivery({
      eventId: event.id,
      endpointId: endpoint.id,
      userId: event.userId,
      attemptNumber: data.attemptNumber,
      responseStatusCode: result.statusCode,
      responseBody: truncateResponse(result.responseBody),
      responseHeaders: result.responseHeaders,
      requestHeaders: result.requestHeaders,
      durationMs: result.durationMs,
      status: success ? "success" : "failed",
      completedAt: success ? new Date() : null,
    });

    if (success) {
      await updateEventStatus(event.id, "delivered");
      if (endpoint.status === "degraded") {
        await updateEndpoint(endpoint.id, {
          status: getEndpointStatusAfterSuccess(),
        });
      }
    } else {
      await handleFailedDelivery(
        event.id,
        endpoint.id,
        data.attemptNumber,
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown delivery error";

    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      "X-HookRelay-Event-ID": event.id,
      ...(endpoint.customHeaders as Record<string, string> | null ?? {}),
    };

    await createDelivery({
      eventId: event.id,
      endpointId: endpoint.id,
      userId: event.userId,
      attemptNumber: data.attemptNumber,
      status: "failed",
      requestHeaders,
      errorMessage,
    });

    await handleFailedDelivery(
      event.id,
      endpoint.id,
      data.attemptNumber,
    );
  }
}

async function handleFailedDelivery(
  eventId: string,
  endpointId: string,
  attemptNumber: number,
): Promise<void> {
  const nextAttempt = attemptNumber + 1;

  if (hasRetriesRemaining(nextAttempt)) {
    const nextRetryAt = getNextRetryAt(attemptNumber);
    const delayMs = nextRetryAt.getTime() - Date.now();

    await enqueueDelivery(
      { eventId, endpointId, attemptNumber: nextAttempt },
      Math.max(delayMs, 0),
    );
  } else {
    await enqueueDeadLetter(
      { eventId, endpointId, attemptNumber },
      `Max retries (${attemptNumber}) exhausted`,
    );
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
