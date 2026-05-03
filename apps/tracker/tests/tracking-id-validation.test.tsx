import { describe, it, expect } from "vitest";
import { isValidTrackingId } from "../src/lib/tracking-id-validation";

describe("isValidTrackingId", () => {
  describe("valid tracking IDs", () => {
    it("accepts standard format XX-1234", () => {
      expect(isValidTrackingId("SL-1234")).toBe(true);
    });

    it("accepts minimum length after hyphen (4 chars)", () => {
      expect(isValidTrackingId("AB-1234")).toBe(true);
    });

    it("accepts 1 char after hyphen (new minimum)", () => {
      expect(isValidTrackingId("AB-1")).toBe(true);
    });

    it("accepts 2 chars after hyphen", () => {
      expect(isValidTrackingId("AB-12")).toBe(true);
    });

    it("accepts 3 chars after hyphen", () => {
      expect(isValidTrackingId("SL-123")).toBe(true);
    });

    it("accepts maximum length after hyphen (12 chars)", () => {
      expect(isValidTrackingId("AB-123456789012")).toBe(true);
    });

    it("accepts all uppercase letters after hyphen", () => {
      expect(isValidTrackingId("SL-ABCD")).toBe(true);
    });

    it("accepts mixed alphanumeric after hyphen", () => {
      expect(isValidTrackingId("SL-AB12")).toBe(true);
    });

    it("accepts all digits after hyphen", () => {
      expect(isValidTrackingId("XX-9999")).toBe(true);
    });

    it("accepts 5 chars after hyphen", () => {
      expect(isValidTrackingId("AB-12345")).toBe(true);
    });

    it("accepts 8 chars after hyphen", () => {
      expect(isValidTrackingId("AB-12345678")).toBe(true);
    });
  });

  describe("invalid tracking IDs", () => {
    it("rejects empty string", () => {
      expect(isValidTrackingId("")).toBe(false);
    });

    it("rejects missing hyphen", () => {
      expect(isValidTrackingId("SL1234")).toBe(false);
    });

    it("rejects lowercase prefix", () => {
      expect(isValidTrackingId("sl-1234")).toBe(false);
    });

    it("rejects lowercase after hyphen", () => {
      expect(isValidTrackingId("SL-abcd")).toBe(false);
    });

    it("rejects single letter prefix", () => {
      expect(isValidTrackingId("S-1234")).toBe(false);
    });

    it("rejects three letter prefix", () => {
      expect(isValidTrackingId("SLX-1234")).toBe(false);
    });

    it("rejects 13 chars after hyphen (too long)", () => {
      expect(isValidTrackingId("SL-1234567890123")).toBe(false);
    });

    it("rejects spaces", () => {
      expect(isValidTrackingId("SL 1234")).toBe(false);
    });

    it("rejects special characters", () => {
      expect(isValidTrackingId("SL-12@4")).toBe(false);
    });

    it("rejects hyphen in wrong position", () => {
      expect(isValidTrackingId("-SL1234")).toBe(false);
    });

    it("rejects numbers in prefix", () => {
      expect(isValidTrackingId("S1-1234")).toBe(false);
    });

    it("rejects only prefix", () => {
      expect(isValidTrackingId("SL-")).toBe(false);
    });

    it("rejects double hyphen", () => {
      expect(isValidTrackingId("SL--1234")).toBe(false);
    });

    it("rejects leading whitespace", () => {
      expect(isValidTrackingId(" SL-1234")).toBe(false);
    });

    it("rejects trailing whitespace", () => {
      expect(isValidTrackingId("SL-1234 ")).toBe(false);
    });

    it("rejects dots in prefix", () => {
      expect(isValidTrackingId("S.-1234")).toBe(false);
    });

    it("rejects underscores", () => {
      expect(isValidTrackingId("SL-123_4")).toBe(false);
    });

    it("rejects unicode characters", () => {
      expect(isValidTrackingId("SL-12ä4")).toBe(false);
    });

    it("rejects null-like strings", () => {
      expect(isValidTrackingId("null")).toBe(false);
    });

    it("rejects undefined-like strings", () => {
      expect(isValidTrackingId("undefined")).toBe(false);
    });
  });
});
