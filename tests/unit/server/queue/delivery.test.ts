import { describe, it, expect, vi, beforeEach } from "vitest";
import { isSuccessfulDelivery } from "@/server/services/delivery";

describe("delivery service", () => {
  describe("isSuccessfulDelivery", () => {
    it("returns true for 2xx status codes", () => {
      expect(isSuccessfulDelivery(200)).toBe(true);
      expect(isSuccessfulDelivery(201)).toBe(true);
      expect(isSuccessfulDelivery(204)).toBe(true);
      expect(isSuccessfulDelivery(299)).toBe(true);
    });

    it("returns false for non-2xx status codes", () => {
      expect(isSuccessfulDelivery(100)).toBe(false);
      expect(isSuccessfulDelivery(301)).toBe(false);
      expect(isSuccessfulDelivery(400)).toBe(false);
      expect(isSuccessfulDelivery(404)).toBe(false);
      expect(isSuccessfulDelivery(500)).toBe(false);
      expect(isSuccessfulDelivery(502)).toBe(false);
    });
  });
});
