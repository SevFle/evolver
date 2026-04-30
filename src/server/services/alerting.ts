import {
  getConsecutiveFailures,
  updateEndpoint,
  getUserById,
  getLastErrorForEndpoint,
} from "@/server/db/queries";
import {
  getEndpointStatusAfterFailure,
  getEndpointStatusAfterSuccess,
} from "@/server/services/circuit";
import {
  sendFailureAlert,
  markSent,
  clearAlertRateLimit,
} from "@/server/services/email";
import { CIRCUIT_BREAKER_THRESHOLD } from "@/lib/constants";
import type { EndpointStatus } from "@/types";

export interface AlertContext {
  endpointId: string;
  endpointName: string;
  endpointUrl: string;
  userId: string;
}

export interface FailureAlertResult {
  status: EndpointStatus;
  alertSent: boolean;
  alertSkippedReason?: string;
}

export async function processFailureAlert(
  ctx: AlertContext,
): Promise<FailureAlertResult> {
  const consecutiveFailures = await getConsecutiveFailures(ctx.endpointId);
  const newStatus = getEndpointStatusAfterFailure(consecutiveFailures);

  if (newStatus !== "active") {
    await updateEndpoint(ctx.endpointId, { status: newStatus });
  }

  if (consecutiveFailures < CIRCUIT_BREAKER_THRESHOLD) {
    return {
      status: newStatus,
      alertSent: false,
      alertSkippedReason: "below_threshold",
    };
  }

  const markResult = await markSent(ctx.endpointId);
  if (markResult !== "OK") {
    return {
      status: newStatus,
      alertSent: false,
      alertSkippedReason: "rate_limited",
    };
  }

  console.warn(
    `Endpoint ${ctx.endpointId} has ${consecutiveFailures} consecutive failures. Status: ${newStatus}. Sending alert.`,
  );

  try {
    const user = await getUserById(ctx.userId);
    if (!user) {
      console.error(
        `User ${ctx.userId} not found for endpoint ${ctx.endpointId}`,
      );
      await clearAlertRateLimit(ctx.endpointId);
      return {
        status: newStatus,
        alertSent: false,
        alertSkippedReason: "user_not_found",
      };
    }

    const lastError = await getLastErrorForEndpoint(ctx.endpointId);
    const dashboardBase = process.env.DASHBOARD_URL ?? "http://localhost:3000";

    const result = await sendFailureAlert({
      endpointId: ctx.endpointId,
      endpointName: ctx.endpointName,
      endpointUrl: ctx.endpointUrl,
      failureCount: consecutiveFailures,
      lastErrorMessage: lastError,
      dashboardUrl: `${dashboardBase}/dashboard/endpoints/${ctx.endpointId}`,
      userEmail: user.email,
    });

    if (!result.success) {
      await clearAlertRateLimit(ctx.endpointId);
      console.error(
        `Failed to send failure alert for endpoint ${ctx.endpointId}: ${result.error}`,
      );
      return {
        status: newStatus,
        alertSent: false,
        alertSkippedReason: `send_failed:${result.error}`,
      };
    }

    return {
      status: newStatus,
      alertSent: true,
    };
  } catch (err) {
    try {
      await clearAlertRateLimit(ctx.endpointId);
    } catch {
      // best-effort: don't let clearAlertRateLimit failure mask the original error
    }
    console.error(
      `Failed to send failure alert for endpoint ${ctx.endpointId}:`,
      err,
    );
    return {
      status: newStatus,
      alertSent: false,
      alertSkippedReason: "exception",
    };
  }
}

export async function resetAlertStateOnSuccess(
  endpointId: string,
  currentStatus: string,
): Promise<boolean> {
  if (currentStatus === "degraded") {
    await updateEndpoint(endpointId, {
      status: getEndpointStatusAfterSuccess(),
    });
    return true;
  }
  return false;
}
