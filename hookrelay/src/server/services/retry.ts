import { RETRY_SCHEDULE, MAX_RETRY_ATTEMPTS } from "@/lib/constants";

export function getRetryDelay(attemptNumber: number): number {
  const index = Math.min(attemptNumber, RETRY_SCHEDULE.length) - 1;
  return RETRY_SCHEDULE[index] ?? RETRY_SCHEDULE[RETRY_SCHEDULE.length - 1]!;
}

export function getNextRetryAt(attemptNumber: number): Date {
  const delay = getRetryDelay(attemptNumber);
  return new Date(Date.now() + delay);
}

export function hasRetriesRemaining(attemptNumber: number): boolean {
  return attemptNumber <= MAX_RETRY_ATTEMPTS;
}

export function getRetrySchedule(): readonly number[] {
  return RETRY_SCHEDULE;
}
