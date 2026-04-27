import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createHash } from "node:crypto";

describe("password hashing", () => {
  describe("hashPassword", () => {
    it("produces a hash with the scrypt prefix", async () => {
      const hash = await hashPassword("mypassword");
      expect(hash).toMatch(/^scrypt:[a-f0-9]+:[a-f0-9]+$/);
    });

    it("produces different hashes for the same password (random salt)", async () => {
      const hash1 = await hashPassword("samepassword");
      const hash2 = await hashPassword("samepassword");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for different passwords", async () => {
      const hash1 = await hashPassword("password_a");
      const hash2 = await hashPassword("password_b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("verifies a correct password against a scrypt hash", async () => {
      const hash = await hashPassword("correctpassword");
      expect(await verifyPassword("correctpassword", hash)).toBe(true);
    });

    it("rejects an incorrect password against a scrypt hash", async () => {
      const hash = await hashPassword("correctpassword");
      expect(await verifyPassword("wrongpassword", hash)).toBe(false);
    });

    it("provides backward compatibility with legacy SHA-256 hashes", async () => {
      const password = "legacypassword";
      const legacyHash = createHash("sha256").update(password).digest("hex");
      expect(await verifyPassword(password, legacyHash)).toBe(true);
      expect(await verifyPassword("wrongpassword", legacyHash)).toBe(false);
    });

    it("rejects a malformed scrypt hash", async () => {
      expect(await verifyPassword("test", "scrypt:invalid")).toBe(false);
      expect(await verifyPassword("test", "scrypt::")).toBe(false);
    });

    it("rejects a scrypt hash with invalid hex characters", async () => {
      expect(await verifyPassword("test", "scrypt:ZZZZ:aaaa")).toBe(false);
      expect(await verifyPassword("test", "scrypt:aaaa:ZZZZ")).toBe(false);
    });
  });
});
