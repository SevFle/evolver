import type { DeliveryJobData } from "./queues";
import { enqueueDelivery, enqueueDeadLetter } from "./producer";
import {
  getEndpointById,
  getEventById,
  createDelivery,
  updateEventStatus,
  getSuccessfulDelivery,
  updateFanoutEventStatus,
  getLastActualDeliveryTimeByEndpoint,
  atomicCircuitOpenCountAndCreate,
  updateDeliveryStatus,
  deleteDeliveryById,
} from "@/server/db/queries";
import {
  deliverWebhook,
  isSuccessfulDelivery,
} from "@/server/services/delivery";
import { getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import {
  processFailureAlert,
  resetAlertStateOnSuccess,
} from "@/server/services/alerting";
import { shouldSkipDelivery, isRecoveryAttempt } from "@/server/services/circuit";
import { MAX_PAYLOAD_RESPONSE_SIZE, CIRCUIT_RECOVERY_COOLDOWN_MS, MAX_CIRCUIT_OPEN_RETRIES } from "@/lib/constants";

function truncateResponse(body: string): string {
  if (body.length <= MAX_PAYLOAD_RESPONSE_SIZE) return body;
  return body.slice(0, MAX_PAYLOAD_RESPONSE_SIZE);
}

export async function handleDelivery(data: DeliveryJobData): Promise<void> {
  const alreadyDelivered = await getSuccessfulDelivery(
    data.eventId,
    data.endpointId,
  );
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
  const isReplay = !!event.replayedFromEventId;

  const endpoint = await getEndpointById(data.endpointId);
  if (!endpoint || endpoint.status === "disabled" || !endpoint.isActive) {
    if (isFanout) {
      await updateFanoutEventStatus(event.id);
    } else {
      await updateEventStatus(event.id, "failed");
    }
    return;
  }

  let lastDeliveryAt: Date | null = null;
  if (endpoint.status !== "active") {
    lastDeliveryAt = await getLastActualDeliveryTimeByEndpoint(endpoint.id);
  }

  if (shouldSkipDelivery(endpoint.status, lastDeliveryAt)) {
    const { count: circuitRetryCount, delivery: deliveryRecord } = await atomicCircuitOpenCountAndCreate({
      eventId: event.id,
      endpointId: endpoint.id,
      userId: event.userId,
      attemptNumber: data.attemptNumber,
      isReplay,
    });

    if (circuitRetryCount >= MAX_CIRCUIT_OPEN_RETRIES) {
      console.warn(
        `Max circuit-open retries (${MAX_CIRCUIT_OPEN_RETRIES}) reached for event=${event.id} endpoint=${endpoint.id} - dead-lettering`,
      );
      await updateDeliveryStatus(
        deliveryRecord.id,
        "dead_letter",
        `Max circuit-open retries (${MAX_CIRCUIT_OPEN_RETRIES}) exhausted`,
      );
      await enqueueDeadLetter(
        { eventId: event.id, endpointId: endpoint.id, attemptNumber: data.attemptNumber },
        `Max circuit-open retries (${MAX_CIRCUIT_OPEN_RETRIES}) exhausted`,
      );
      if (isFanout) {
        await updateFanoutEventStatus(event.id);
      } else {
        await updateEventStatus(event.id, "failed");
      }
      return;
    }

    console.log(
      `Circuit breaker open for endpoint ${endpoint.id} - scheduling delayed retry (${circuitRetryCount + 1}/${MAX_CIRCUIT_OPEN_RETRIES})`,
    );

    try {
      await enqueueDelivery(
        { eventId: event.id, endpointId: endpoint.id, attemptNumber: data.attemptNumber },
        CIRCUIT_RECOVERY_COOLDOWN_MS,
      );
    } catch (enqueueErr) {
      console.error(
        `Failed to enqueue circuit-open retry: ${enqueueErr instanceof Error ? enqueueErr.message : enqueueErr}`,
      );
      if (deliveryRecord?.id) {
        try {
          await deleteDeliveryById(deliveryRecord.id);
          console.log(`Compensated: deleted orphaned delivery ${deliveryRecord.id}`);
        } catch (compensateErr) {
          console.error(
            `Failed to compensate delivery record: ${compensateErr instanceof Error ? compensateErr.message : compensateErr}`,
          );
        }
      }
      return;
    }

    return;
  }

  const recoveryProbe = isRecoveryAttempt(endpoint.status, lastDeliveryAt);

  if (recoveryProbe) {
    console.log(
      `Circuit breaker half-open for endpoint ${endpoint.id} - attempting recovery delivery`,
    );
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

    const delivery = await createDelivery({
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
        isReplay,
        recoveryProbe,
        delivery!.id,
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

    const delivery = await createDelivery({
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
      isReplay,
      recoveryProbe,
      delivery!.id,
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
  isReplay: boolean,
  isRecoveryProbe: boolean,
  deliveryId?: string,
): Promise<void> {
  if (isRecoveryProbe) {
    console.log(
      `Recovery probe failed for endpoint ${endpoint.id} - keeping circuit open`,
    );
    await processFailureAlert({
      endpointId: endpoint.id,
      endpointName: endpoint.name,
      endpointUrl: endpoint.url,
      userId: endpoint.userId,
    });
    if (isFanout) {
      await updateFanoutEventStatus(eventId);
    } else {
      await updateEventStatus(eventId, "failed");
    }
    return;
  }

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
    if (deliveryId) {
      await updateDeliveryStatus(deliveryId, "dead_letter", `Max retries (${attemptNumber}) exhausted`);
    }
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
