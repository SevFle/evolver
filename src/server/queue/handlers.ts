import type { DeliveryJobData } from "./queues";
import { enqueueDelivery, enqueueDeadLetter } from "./producer";
import {
  getEndpointById,
  getEventById,
  createDelivery,
  updateEventStatus,
  getSuccessfulDelivery,
  updateFanoutEventStatus,
} from "@/server/db/queries";
import { deliverWebhook, isSuccessfulDelivery } from "@/server/services/delivery";
import { getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import {
  processFailureAlert,
  resetAlertStateOnSuccess,
} from "@/server/services/alerting";
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

  const isFanout = !!event.endpointGroupId;

  const endpoint = await getEndpointById(data.endpointId);
  if (!endpoint || endpoint.status === "disabled" || !endpoint.isActive) {
    if (isFanout) {
      await updateFanoutEventStatus(event.id);
    } else {
      await updateEventStatus(event.id, "failed");
    }
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

    const isReplay = !!event.replayedFromEventId;

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
      isReplay,
    });

    if (success) {
      if (isFanout) {
        await updateFanoutEventStatus(event.id);
      } else {
        await updateEventStatus(event.id, "delivered");
      }
      await resetAlertStateOnSuccess(endpoint.id, endpoint.status);
    } else {
      await handleFailedDelivery(
        event.id,
        endpoint,
        data.attemptNumber,
        isFanout,
      );
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown delivery error";

    const isReplay = !!event.replayedFromEventId;

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
      isReplay,
    });

    await handleFailedDelivery(
      event.id,
      endpoint,
      data.attemptNumber,
      isFanout,
    );
  }
}

async function handleFailedDelivery(
  eventId: string,
  endpoint: {
    id: string;
    userId: string;
    url: string;
    name: string;
    retrySchedule?: number[] | null;
    maxRetries?: number | null;
  },
  attemptNumber: number,
  isFanout: boolean,
): Promise<void> {
  const nextAttempt = attemptNumber + 1;
  const schedule = endpoint.retrySchedule ?? undefined;
  const maxRetries = endpoint.maxRetries ?? undefined;

  if (hasRetriesRemaining(nextAttempt, maxRetries)) {
    const nextRetryAt = getNextRetryAt(attemptNumber, schedule);
    const delayMs = nextRetryAt.getTime() - Date.now();

    await enqueueDelivery(
      { eventId, endpointId: endpoint.id, attemptNumber: nextAttempt },
      Math.max(delayMs, 0),
    );
  } else {
    await enqueueDeadLetter(
      { eventId, endpointId: endpoint.id, attemptNumber },
      `Max retries (${attemptNumber}) exhausted`,
    );
    if (isFanout) {
      await updateFanoutEventStatus(eventId);
    } else {
      await updateEventStatus(eventId, "failed");
    }
  }

  await processFailureAlert({
    endpointId: endpoint.id,
    endpointName: endpoint.name,
    endpointUrl: endpoint.url,
    userId: endpoint.userId,
  });
}
