import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";
import {
  signPayload,
  verifySignature,
  generateSigningSecret,
} from "@/server/services/signing";

describe("signing — comprehensive edge cases", () => {
  describe("signPayload — format verification", () => {
    it("produces a 64-character hex v1 signature (SHA-256)", () => {
      const sig = signPayload("test", "secret", 1700000000);
      const v1 = sig.split(",").find((p) => p.startsWith("v1="))!.split("=")[1]!;
      expect(v1).toHaveLength(64);
      expect(v1).toMatch(/^[a-f0-9]{64}$/);
    });

    it("includes Unix timestamp in seconds (not milliseconds)", () => {
      const ts = 1700000000;
      const sig = signPayload("test", "secret", ts);
      expect(sig).toContain(`t=${ts}`);
    });

    it("format is exactly t=<timestamp>,v1=<hex>", () => {
      const sig = signPayload("payload", "secret", 1700000000);
      expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]+$/);
      const parts = sig.split(",");
      expect(parts).toHaveLength(2);
      expect(parts[0]).toMatch(/^t=\d+$/);
      expect(parts[1]).toMatch(/^v1=[a-f0-9]+$/);
    });
  });

  describe("signPayload — idempotency", () => {
    it("produces identical signatures for identical inputs", () => {
      for (let i = 0; i < 10; i++) {
        const sig1 = signPayload("payload", "secret", 1700000000);
        const sig2 = signPayload("payload", "secret", 1700000000);
        expect(sig1).toBe(sig2);
      }
    });

    it("produces different signatures for different payloads", () => {
      const sig1 = signPayload('{"a":1}', "secret", 1700000000);
      const sig2 = signPayload('{"a":2}', "secret", 1700000000);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different secrets", () => {
      const sig1 = signPayload("payload", "secret1", 1700000000);
      const sig2 = signPayload("payload", "secret2", 1700000000);
      expect(sig1).not.toBe(sig2);
    });

    it("produces different signatures for different timestamps", () => {
      const sig1 = signPayload("payload", "secret", 1700000000);
      const sig2 = signPayload("payload", "secret", 1700000001);
      expect(sig1).not.toBe(sig2);
    });
  });

  describe("signPayload — internal construction", () => {
    it("uses t.payload format for the signed data", () => {
      const payload = '{"event":"test"}';
      const secret = "whsec_test";
      const ts = 1700000000;

      const sig = signPayload(payload, secret, ts);

      const signedData = `${ts}.${payload}`;
      const expectedV1 = createHmac("sha256", secret)
        .update(signedData)
        .digest("hex");

      expect(sig).toBe(`t=${ts},v1=${expectedV1}`);
    });

    it("correctly handles empty string payload", () => {
      const sig = signPayload("", "secret", 1700000000);
      const v1 = sig.split(",").find((p) => p.startsWith("v1="))!.split("=")[1]!;

      const expectedV1 = createHmac("sha256", "secret")
        .update("1700000000.")
        .digest("hex");

      expect(v1).toBe(expectedV1);
    });

    it("handles unicode payload correctly", () => {
      const payload = '{"name":"日本語テスト","emoji":"🎉"}';
      const secret = "whsec_unicode";
      const ts = 1700000000;

      const sig = signPayload(payload, secret, ts);

      const expectedV1 = createHmac("sha256", secret)
        .update(`${ts}.${payload}`)
        .digest("hex");

      const v1 = sig.split(",").find((p) => p.startsWith("v1="))!.split("=")[1]!;
      expect(v1).toBe(expectedV1);
    });

    it("handles payload with special characters", () => {
      const payload = '{"path":"/a/b?c=1&d=2","special":"\n\r\t"}';
      const secret = "whsec_special";
      const ts = 1700000000;

      const sig = signPayload(payload, secret, ts);
      const v1 = sig.split(",").find((p) => p.startsWith("v1="))!.split("=")[1]!;

      const expectedV1 = createHmac("sha256", secret)
        .update(`${ts}.${payload}`)
        .digest("hex");

      expect(v1).toBe(expectedV1);
    });

    it("handles very large payload", () => {
      const largePayload = JSON.stringify({ data: "x".repeat(100_000) });
      const sig = signPayload(largePayload, "secret", 1700000000);

      expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("handles long secrets", () => {
      const longSecret = "whsec_" + "a".repeat(1000);
      const sig = signPayload("payload", longSecret, 1700000000);

      expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    });

    it("handles timestamp of 0", () => {
      const sig = signPayload("payload", "secret", 0);
      expect(sig).toContain("t=0,");
      expect(sig).toMatch(/^t=0,v1=[a-f0-9]{64}$/);
    });
  });

  describe("verifySignature — correct signature acceptance", () => {
    it("accepts a freshly generated signature", () => {
      const payload = '{"test":true}';
      const secret = "whsec_verify";
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(payload, secret, ts);

      expect(verifySignature(payload, secret, sig)).toBe(true);
    });

    it("accepts signature within the tolerance window", () => {
      const payload = '{"test":true}';
      const secret = "whsec_verify";
      const toleranceMs = 5 * 60 * 1000;
      const ts = Math.floor(Date.now() / 1000) - 60;

      const sig = signPayload(payload, secret, ts);
      expect(verifySignature(payload, secret, sig, toleranceMs)).toBe(true);
    });

    it("accepts with a custom larger tolerance", () => {
      const payload = '{"test":true}';
      const secret = "whsec_verify";
      const ts = Math.floor(Date.now() / 1000) - 600;

      const sig = signPayload(payload, secret, ts);
      expect(verifySignature(payload, secret, sig, 10 * 60 * 1000)).toBe(true);
    });
  });

  describe("verifySignature — rejection cases", () => {
    it("rejects expired timestamp (beyond default 5min tolerance)", () => {
      const payload = "test";
      const secret = "whsec_expired";
      const oldTs = Math.floor(Date.now() / 1000) - 600;

      const sig = signPayload(payload, secret, oldTs);
      expect(verifySignature(payload, secret, sig)).toBe(false);
    });

    it("rejects future timestamp far in the future", () => {
      const payload = "test";
      const secret = "whsec_future";
      const futureTs = Math.floor(Date.now() / 1000) + 3600;

      const sig = signPayload(payload, secret, futureTs);
      expect(verifySignature(payload, secret, sig)).toBe(false);
    });

    it("rejects tampered payload", () => {
      const original = '{"amount":100}';
      const tampered = '{"amount":999}';
      const secret = "whsec_tamper";
      const ts = Math.floor(Date.now() / 1000);

      const sig = signPayload(original, secret, ts);
      expect(verifySignature(tampered, secret, sig)).toBe(false);
    });

    it("rejects wrong secret", () => {
      const payload = "test";
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(payload, "correct_secret", ts);

      expect(verifySignature(payload, "wrong_secret", sig)).toBe(false);
    });

    it("rejects completely malformed signature", () => {
      expect(verifySignature("test", "secret", "garbage")).toBe(false);
    });

    it("rejects empty string signature", () => {
      expect(verifySignature("test", "secret", "")).toBe(false);
    });

    it("rejects signature missing timestamp", () => {
      expect(verifySignature("test", "secret", "v1=abc123")).toBe(false);
    });

    it("rejects signature missing v1", () => {
      expect(verifySignature("test", "secret", "t=1700000000")).toBe(false);
    });

    it("rejects signature with empty v1", () => {
      expect(verifySignature("test", "secret", "t=1700000000,v1=")).toBe(false);
    });

    it("rejects signature with wrong v1 length", () => {
      const payload = "test";
      const secret = "whsec_len";
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(payload, secret, ts);

      const tampered = sig.replace(/v1=[a-f0-9]+/, "v1=abc");
      expect(verifySignature(payload, secret, tampered)).toBe(false);
    });

    it("rejects single-character v1 change", () => {
      const payload = "test";
      const secret = "whsec_single";
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(payload, secret, ts);

      const v1 = sig.split(",").find((p) => p.startsWith("v1="))!.split("=")[1]!;
      const tamperedV1 = v1.slice(0, -1) + (v1[v1.length - 1] === "a" ? "b" : "a");
      const tampered = `t=${ts},v1=${tamperedV1}`;

      expect(verifySignature(payload, secret, tampered)).toBe(false);
    });
  });

  describe("generateSigningSecret", () => {
    it("produces secret with whsec_ prefix", () => {
      const secret = generateSigningSecret();
      expect(secret.startsWith("whsec_")).toBe(true);
    });

    it("produces a base64url encoded body after prefix", () => {
      const secret = generateSigningSecret();
      const body = secret.slice(6);
      expect(body).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it("produces a body of at least 32 bytes (43 base64url chars)", () => {
      const secret = generateSigningSecret();
      const body = secret.slice(6);
      expect(body.length).toBeGreaterThanOrEqual(43);
    });

    it("generates unique secrets across many calls", () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateSigningSecret());
      }
      expect(secrets.size).toBe(100);
    });

    it("generated secret can be used for signing and verification", () => {
      const secret = generateSigningSecret();
      const payload = '{"event":"generated_secret_test"}';
      const ts = Math.floor(Date.now() / 1000);
      const sig = signPayload(payload, secret, ts);

      expect(verifySignature(payload, secret, sig)).toBe(true);
    });
  });
});
