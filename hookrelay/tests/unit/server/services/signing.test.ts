import { describe, it, expect } from "vitest";
import { signPayload, verifySignature, generateSigningSecret } from "@/server/services/signing";

describe("signing", () => {
  describe("generateSigningSecret", () => {
    it("generates a secret with the correct prefix", () => {
      const secret = generateSigningSecret();
      expect(secret).toMatch(/^whsec_[A-Za-z0-9_-]+$/);
    });

    it("generates unique secrets", () => {
      const s1 = generateSigningSecret();
      const s2 = generateSigningSecret();
      expect(s1).not.toBe(s2);
    });
  });

  describe("signPayload", () => {
    it("produces a signature in the correct format", () => {
      const payload = JSON.stringify({ test: true });
      const secret = "whsecret_test";
      const timestamp = 1700000000;

      const sig = signPayload(payload, secret, timestamp);

      expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
    });

    it("produces deterministic signatures for same inputs", () => {
      const payload = JSON.stringify({ hello: "world" });
      const secret = "whsecret_test";
      const timestamp = 1700000000;

      const sig1 = signPayload(payload, secret, timestamp);
      const sig2 = signPayload(payload, secret, timestamp);

      expect(sig1).toBe(sig2);
    });
  });

  describe("verifySignature", () => {
    it("verifies a valid signature", () => {
      const payload = JSON.stringify({ event: "test" });
      const secret = "whsecret_verify";
      const timestamp = Math.floor(Date.now() / 1000);

      const sig = signPayload(payload, secret, timestamp);
      expect(verifySignature(payload, secret, sig)).toBe(true);
    });

    it("rejects a tampered payload", () => {
      const payload = JSON.stringify({ event: "test" });
      const secret = "whsecret_verify";
      const timestamp = Math.floor(Date.now() / 1000);

      const sig = signPayload(payload, secret, timestamp);
      expect(verifySignature(JSON.stringify({ event: "tampered" }), secret, sig)).toBe(false);
    });

    it("rejects the wrong secret", () => {
      const payload = JSON.stringify({ event: "test" });
      const timestamp = Math.floor(Date.now() / 1000);

      const sig = signPayload(payload, "secret_a", timestamp);
      expect(verifySignature(payload, "secret_b", sig)).toBe(false);
    });

    it("rejects expired timestamps", () => {
      const payload = JSON.stringify({ event: "test" });
      const secret = "whsecret_verify";
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600;

      const sig = signPayload(payload, secret, oldTimestamp);
      expect(verifySignature(payload, secret, sig)).toBe(false);
    });

    it("rejects malformed signatures", () => {
      expect(verifySignature("{}", "secret", "invalid")).toBe(false);
      expect(verifySignature("{}", "secret", "")).toBe(false);
    });
  });
});
