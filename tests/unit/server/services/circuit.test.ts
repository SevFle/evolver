import { describe, it, expect } from "vitest";
import {
  shouldBreakCircuit,
  getEndpointStatusAfterFailure,
  getEndpointStatusAfterSuccess,
  getCircuitState,
  shouldSkipDelivery,
  isRecoveryAttempt,
  type CircuitState,
} from "@/server/services/circuit";

const COOLDOWN_MS = 5 * 60 * 1000;

describe("circuit breaker", () => {
  describe("shouldBreakCircuit", () => {
    it("does not break for failures below threshold", () => {
      expect(shouldBreakCircuit(0)).toBe(false);
      expect(shouldBreakCircuit(1)).toBe(false);
      expect(shouldBreakCircuit(4)).toBe(false);
    });

    it("breaks at threshold of 5", () => {
      expect(shouldBreakCircuit(5)).toBe(true);
    });

    it("stays broken for failures above threshold", () => {
      expect(shouldBreakCircuit(10)).toBe(true);
      expect(shouldBreakCircuit(100)).toBe(true);
    });
  });

  describe("getEndpointStatusAfterFailure", () => {
    it("returns active for failures below threshold", () => {
      expect(getEndpointStatusAfterFailure(0)).toBe("active");
      expect(getEndpointStatusAfterFailure(4)).toBe("active");
    });

    it("returns degraded at threshold", () => {
      expect(getEndpointStatusAfterFailure(5)).toBe("degraded");
      expect(getEndpointStatusAfterFailure(10)).toBe("degraded");
    });
  });

  describe("getEndpointStatusAfterSuccess", () => {
    it("always returns active", () => {
      expect(getEndpointStatusAfterSuccess()).toBe("active");
    });
  });

  describe("getCircuitState", () => {
    it("returns closed for active endpoint", () => {
      expect(getCircuitState("active", null)).toBe("closed");
    });

    it("returns closed for disabled endpoint", () => {
      expect(getCircuitState("disabled", null)).toBe("closed");
    });

    it("returns half-open for degraded endpoint with no last delivery", () => {
      expect(getCircuitState("degraded", null)).toBe("half-open");
    });

    it("returns open when last delivery was recent (within cooldown)", () => {
      const now = Date.now();
      const recentDelivery = new Date(now - 60_000);
      expect(getCircuitState("degraded", recentDelivery, now)).toBe("open");
    });

    it("returns half-open when last delivery was before cooldown", () => {
      const now = Date.now();
      const oldDelivery = new Date(now - COOLDOWN_MS - 1);
      expect(getCircuitState("degraded", oldDelivery, now)).toBe("half-open");
    });

    it("returns half-open exactly at cooldown boundary", () => {
      const now = Date.now();
      const boundaryDelivery = new Date(now - COOLDOWN_MS);
      expect(getCircuitState("degraded", boundaryDelivery, now)).toBe(
        "half-open",
      );
    });

    it("returns open just before cooldown boundary", () => {
      const now = Date.now();
      const justBefore = new Date(now - COOLDOWN_MS + 1);
      expect(getCircuitState("degraded", justBefore, now)).toBe("open");
    });

    it("returns open when last delivery was very recent", () => {
      const now = Date.now();
      const justNow = new Date(now - 1000);
      expect(getCircuitState("degraded", justNow, now)).toBe("open");
    });

    it("returns half-open when last delivery was 10 minutes ago", () => {
      const now = Date.now();
      const tenMinAgo = new Date(now - 10 * 60 * 1000);
      expect(getCircuitState("degraded", tenMinAgo, now)).toBe("half-open");
    });
  });

  describe("shouldSkipDelivery", () => {
    it("returns false for active endpoint", () => {
      expect(shouldSkipDelivery("active", null)).toBe(false);
    });

    it("returns false for disabled endpoint", () => {
      expect(shouldSkipDelivery("disabled", null)).toBe(false);
    });

    it("returns false for half-open state", () => {
      const now = Date.now();
      const oldDelivery = new Date(now - COOLDOWN_MS - 1);
      expect(shouldSkipDelivery("degraded", oldDelivery, now)).toBe(false);
    });

    it("returns true for open state", () => {
      const now = Date.now();
      const recentDelivery = new Date(now - 60_000);
      expect(shouldSkipDelivery("degraded", recentDelivery, now)).toBe(true);
    });

    it("returns false when no last delivery (half-open)", () => {
      expect(shouldSkipDelivery("degraded", null)).toBe(false);
    });
  });

  describe("isRecoveryAttempt", () => {
    it("returns false for active endpoint", () => {
      expect(isRecoveryAttempt("active", null)).toBe(false);
    });

    it("returns false for disabled endpoint", () => {
      expect(isRecoveryAttempt("disabled", null)).toBe(false);
    });

    it("returns false for open state", () => {
      const now = Date.now();
      const recentDelivery = new Date(now - 60_000);
      expect(isRecoveryAttempt("degraded", recentDelivery, now)).toBe(false);
    });

    it("returns true for half-open state", () => {
      const now = Date.now();
      const oldDelivery = new Date(now - COOLDOWN_MS - 1);
      expect(isRecoveryAttempt("degraded", oldDelivery, now)).toBe(true);
    });

    it("returns true when no last delivery", () => {
      expect(isRecoveryAttempt("degraded", null)).toBe(true);
    });
  });

  describe("CircuitState type", () => {
    it("only allows valid states", () => {
      const states: CircuitState[] = ["closed", "open", "half-open"];
      expect(states).toHaveLength(3);
      expect(states).toContain("closed");
      expect(states).toContain("open");
      expect(states).toContain("half-open");
    });
  });
});
