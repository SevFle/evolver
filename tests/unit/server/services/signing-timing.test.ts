import { describe, it, expect } from "vitest";
import { signPayload, verifySignature } from "@/server/services/signing";

describe("verifySignature timing-safe comparison", () => {
  it("accepts a valid signature", () => {
    const payload = JSON.stringify({ event: "test" });
    const secret = "whsecret_timing_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = signPayload(payload, secret, timestamp);
    expect(verifySignature(payload, secret, sig)).toBe(true);
  });

  it("rejects a signature with different length v1", () => {
    const payload = JSON.stringify({ event: "test" });
    const secret = "whsecret_timing_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const sig = signPayload(payload, secret, timestamp);
    const tamperedSig = sig.replace(/v1=[a-f0-9]+/, "v1=abc");
    expect(verifySignature(payload, secret, tamperedSig)).toBe(false);
  });

  it("handles edge case of empty v1 in signature", () => {
    expect(verifySignature("{}", "secret", "t=1700000000,v1=")).toBe(false);
  });
});
