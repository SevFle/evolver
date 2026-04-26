import { describe, it, expect } from "vitest";
import {
  shouldBreakCircuit,
  getEndpointStatusAfterFailure,
  getEndpointStatusAfterSuccess,
} from "@/server/services/circuit";

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
});
