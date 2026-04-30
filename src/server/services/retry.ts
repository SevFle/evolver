import { RETRY_SCHEDULE, MAX_RETRY_ATTEMPTS } from "@/lib/constants";

export function getRetryDelay(
  attemptNumber: number,
  schedule?: readonly number[],
): number {
  const s = schedule ?? RETRY_SCHEDULE;
  const index = Math.min(attemptNumber, s.length) - 1;
  return s[index] ?? s[s.length - 1]!;
}

export function getNextRetryAt(
  attemptNumber: number,
  schedule?: readonly number[],
): Date {
  const delay = getRetryDelay(attemptNumber, schedule);
  return new Date(Date.now() + delay);
}

export function hasRetriesRemaining(
  attemptNumber: number,
  maxRetries?: number,
): boolean {
  return attemptNumber <= (maxRetries ?? MAX_RETRY_ATTEMPTS);
}

export function getRetrySchedule(): readonly number[] {
  return RETRY_SCHEDULE;
}
