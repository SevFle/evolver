import { describe, it, expect } from "vitest";
import { isValidTrackingId } from "../src/lib/tracking-id-validation";

describe("isValidTrackingId", () => {
  it("accepts valid tracking ID with minimum length", () => {
    expect(isValidTrackingId("SL-1234")).toBe(true);
  });

  it("accepts valid tracking ID with maximum length", () => {
    expect(isValidTrackingId("SL-123456789012")).toBe(true);
  });

  it("accepts uppercase letters and numbers after hyphen", () => {
    expect(isValidTrackingId("AB-CD12EF34")).toBe(true);
  });

  it("accepts lowercase letters", () => {
    expect(isValidTrackingId("ab-cd1234")).toBe(true);
  });

  it("accepts mixed case", () => {
    expect(isValidTrackingId("Ab-Cd1234")).toBe(true);
  });

  it("accepts all numeric after hyphen", () => {
    expect(isValidTrackingId("XY-987654")).toBe(true);
  });

  it("accepts all alpha after hyphen", () => {
    expect(isValidTrackingId("ZZ-ABCDEFGH")).toBe(true);
  });

  it("rejects tracking ID without hyphen", () => {
    expect(isValidTrackingId("SL1234")).toBe(false);
  });

  it("rejects tracking ID with only one letter prefix", () => {
    expect(isValidTrackingId("S-1234")).toBe(false);
  });

  it("rejects tracking ID with three letter prefix", () => {
    expect(isValidTrackingId("ABC-1234")).toBe(false);
  });

  it("rejects tracking ID with too few characters after hyphen", () => {
    expect(isValidTrackingId("SL-123")).toBe(false);
  });

  it("rejects tracking ID with too many characters after hyphen", () => {
    expect(isValidTrackingId("SL-1234567890123")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidTrackingId("")).toBe(false);
  });

  it("rejects tracking ID with special characters", () => {
    expect(isValidTrackingId("SL-12!34")).toBe(false);
  });

  it("rejects tracking ID with spaces", () => {
    expect(isValidTrackingId("SL-12 34")).toBe(false);
  });

  it("rejects tracking ID with only hyphen", () => {
    expect(isValidTrackingId("-")).toBe(false);
  });

  it("rejects tracking ID starting with hyphen", () => {
    expect(isValidTrackingId("-SL1234")).toBe(false);
  });

  it("rejects tracking ID with multiple hyphens", () => {
    expect(isValidTrackingId("SL-12-34")).toBe(false);
  });

  it("rejects tracking ID with underscores", () => {
    expect(isValidTrackingId("SL_1234")).toBe(false);
  });

  it("rejects tracking ID with dots", () => {
    expect(isValidTrackingId("SL.1234")).toBe(false);
  });

  it("rejects numeric-only prefix", () => {
    expect(isValidTrackingId("12-ABCD")).toBe(false);
  });

  it("rejects tracking ID with exactly 4 chars after hyphen", () => {
    expect(isValidTrackingId("AB-1234")).toBe(true);
  });

  it("rejects tracking ID with exactly 12 chars after hyphen boundary", () => {
    expect(isValidTrackingId("AB-123456789012")).toBe(true);
  });

  it("rejects tracking ID with 13 chars after hyphen", () => {
    expect(isValidTrackingId("AB-1234567890123")).toBe(false);
  });

  it("rejects tracking ID with 3 chars after hyphen", () => {
    expect(isValidTrackingId("AB-123")).toBe(false);
  });

  it("accepts typical real-world tracking IDs", () => {
    expect(isValidTrackingId("SL-ABC123")).toBe(true);
    expect(isValidTrackingId("MA-20240101")).toBe(true);
    expect(isValidTrackingId("XY-9Z8Y7X")).toBe(true);
  });

  it("rejects path traversal attempts", () => {
    expect(isValidTrackingId("SL-../../etc")).toBe(false);
  });

  it("rejects SQL injection attempts", () => {
    expect(isValidTrackingId("SL-1'OR'1")).toBe(false);
  });

  it("rejects XSS attempts", () => {
    expect(isValidTrackingId("SL-<script>")).toBe(false);
  });
});
