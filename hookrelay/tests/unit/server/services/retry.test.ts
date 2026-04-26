import { describe, it, expect } from "vitest";
import {
  getRetryDelay,
  getNextRetryAt,
  hasRetriesRemaining,
  getRetrySchedule,
} from "@/server/services/retry";

describe("retry", () => {
  describe("getRetrySchedule", () => {
    it("returns 5 delays matching the spec", () => {
      const schedule = getRetrySchedule();
      expect(schedule).toHaveLength(5);
      expect(schedule).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    });
  });

  describe("getRetryDelay", () => {
    it("returns the correct delay for each attempt", () => {
      expect(getRetryDelay(1)).toBe(60_000);
      expect(getRetryDelay(2)).toBe(300_000);
      expect(getRetryDelay(3)).toBe(1_800_000);
      expect(getRetryDelay(4)).toBe(7_200_000);
      expect(getRetryDelay(5)).toBe(43_200_000);
    });

    it("caps at the maximum delay for attempts beyond schedule", () => {
      expect(getRetryDelay(6)).toBe(43_200_000);
      expect(getRetryDelay(100)).toBe(43_200_000);
    });
  });

  describe("getNextRetryAt", () => {
    it("returns a future date", () => {
      const before = Date.now();
      const retryAt = getNextRetryAt(1);
      expect(retryAt.getTime()).toBeGreaterThan(before);
    });

    it("returns a date roughly 1 minute from now for attempt 1", () => {
      const before = Date.now();
      const retryAt = getNextRetryAt(1);
      const diff = retryAt.getTime() - before;
      expect(diff).toBeGreaterThanOrEqual(59_000);
      expect(diff).toBeLessThanOrEqual(61_000);
    });
  });

  describe("hasRetriesRemaining", () => {
    it("returns true when retries are available", () => {
      expect(hasRetriesRemaining(1)).toBe(true);
      expect(hasRetriesRemaining(3)).toBe(true);
      expect(hasRetriesRemaining(5)).toBe(true);
    });

    it("returns false when no retries remain", () => {
      expect(hasRetriesRemaining(6)).toBe(false);
      expect(hasRetriesRemaining(10)).toBe(false);
    });
  });
});
