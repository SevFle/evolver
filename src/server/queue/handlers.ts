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
  getUserById,
  getLastErrorForEndpoint,
} from "@/server/db/queries";
import { deliverWebhook, isSuccessfulDelivery } from "@/server/services/delivery";
import { getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import {
  getEndpointStatusAfterFailure,
  getEndpointStatusAfterSuccess,
} from "@/server/services/circuit";
import { sendFailureAlert, markSent, clearAlertRateLimit } from "@/server/services/email";
import { MAX_PAYLOAD_RESPONSE_SIZE, CIRCUIT_BREAKER_THRESHOLD } from "@/lib/constants";

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
      const failureMessage = `HTTP ${result.statusCode}`;
      await handleFailedDelivery(
        event.id,
        endpoint,
        data.attemptNumber,
        failureMessage,
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
      endpoint,
      data.attemptNumber,
      errorMessage,
    );
  }
}

async function handleFailedDelivery(
  eventId: string,
  endpoint: { id: string; userId: string; url: string; name: string },
  attemptNumber: number,
  lastErrorMessage?: string | null,
): Promise<void> {
  const nextAttempt = attemptNumber + 1;

  if (hasRetriesRemaining(nextAttempt)) {
    const nextRetryAt = getNextRetryAt(attemptNumber);
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
    await updateEventStatus(eventId, "failed");
  }

  const consecutiveFailures = await getConsecutiveFailures(endpoint.id);
  const newStatus = getEndpointStatusAfterFailure(consecutiveFailures);
  if (newStatus !== "active") {
    await updateEndpoint(endpoint.id, { status: newStatus });
  }

  if (consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
    const markResult = await markSent(endpoint.id);
    if (markResult === "OK") {
      console.warn(
        `Endpoint ${endpoint.id} has ${consecutiveFailures} consecutive failures. Status: ${newStatus}. Sending alert.`,
      );

      try {
        const user = await getUserById(endpoint.userId);
        if (!user) {
          console.error(`User ${endpoint.userId} not found for endpoint ${endpoint.id}`);
          await clearAlertRateLimit(endpoint.id);
          return;
        }

        const error = lastErrorMessage ?? await getLastErrorForEndpoint(endpoint.id);
        const dashboardBase = process.env.DASHBOARD_URL ?? "http://localhost:3000";

        const result = await sendFailureAlert({
          endpointId: endpoint.id,
          endpointName: endpoint.name,
          endpointUrl: endpoint.url,
          failureCount: consecutiveFailures,
          lastErrorMessage: error,
          dashboardUrl: `${dashboardBase}/dashboard/endpoints/${endpoint.id}`,
          userEmail: user.email,
        });
        if (!result.success) {
          await clearAlertRateLimit(endpoint.id);
          console.error(`Failed to send failure alert for endpoint ${endpoint.id}: ${result.error}`);
        }
      } catch (err) {
        try {
          await clearAlertRateLimit(endpoint.id);
        } catch {
          // best-effort: don't let clearAlertRateLimit failure mask the original error
        }
        console.error(`Failed to send failure alert for endpoint ${endpoint.id}:`, err);
      }
    }
  }
}
