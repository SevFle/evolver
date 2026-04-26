import { CIRCUIT_BREAKER_THRESHOLD } from "@/lib/constants";
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
