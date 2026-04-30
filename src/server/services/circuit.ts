import {
  CIRCUIT_BREAKER_THRESHOLD,
  CIRCUIT_RECOVERY_COOLDOWN_MS,
} from "@/lib/constants";
import type { EndpointStatus } from "@/types";

export function shouldBreakCircuit(consecutiveFailures: number): boolean {
  return consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD;
}

export function getEndpointStatusAfterFailure(
  consecutiveFailures: number,
): EndpointStatus {
  if (shouldBreakCircuit(consecutiveFailures)) {
    return "degraded";
  }
  return "active";
}

export function getEndpointStatusAfterSuccess(): EndpointStatus {
  return "active";
}

export type CircuitState = "closed" | "open" | "half-open";

export function getCircuitState(
  endpointStatus: string,
  lastDeliveryAt: Date | null,
  now: number = Date.now(),
): CircuitState {
  if (endpointStatus === "active" || endpointStatus === "disabled") {
    return "closed";
  }

  if (!lastDeliveryAt) {
    return "half-open";
  }

  const elapsed = now - lastDeliveryAt.getTime();
  if (elapsed >= CIRCUIT_RECOVERY_COOLDOWN_MS) {
    return "half-open";
  }
  return "open";
}

export function shouldSkipDelivery(
  endpointStatus: string,
  lastDeliveryAt: Date | null,
  now?: number,
): boolean {
  return getCircuitState(endpointStatus, lastDeliveryAt, now) === "open";
}

export function isRecoveryAttempt(
  endpointStatus: string,
  lastDeliveryAt: Date | null,
  now?: number,
): boolean {
  return getCircuitState(endpointStatus, lastDeliveryAt, now) === "half-open";
}
