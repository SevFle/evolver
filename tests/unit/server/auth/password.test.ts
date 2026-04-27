import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { createHash } from "node:crypto";

describe("password hashing", () => {
  describe("hashPassword", () => {
    it("produces a hash with the scrypt prefix", () => {
      const hash = hashPassword("mypassword");
      expect(hash).toMatch(/^scrypt:[a-f0-9]+:[a-f0-9]+$/);
    });

    it("produces different hashes for the same password (random salt)", () => {
      const hash1 = hashPassword("samepassword");
      const hash2 = hashPassword("samepassword");
      expect(hash1).not.toBe(hash2);
    });

    it("produces different hashes for different passwords", () => {
      const hash1 = hashPassword("password_a");
      const hash2 = hashPassword("password_b");
      expect(hash1).not.toBe(hash2);
    });
  });

  describe("verifyPassword", () => {
    it("verifies a correct password against a scrypt hash", () => {
      const hash = hashPassword("correctpassword");
      expect(verifyPassword("correctpassword", hash)).toBe(true);
    });

    it("rejects an incorrect password against a scrypt hash", () => {
      const hash = hashPassword("correctpassword");
      expect(verifyPassword("wrongpassword", hash)).toBe(false);
    });

    it("provides backward compatibility with legacy SHA-256 hashes", () => {
      const password = "legacypassword";
      const legacyHash = createHash("sha256").update(password).digest("hex");
      expect(verifyPassword(password, legacyHash)).toBe(true);
      expect(verifyPassword("wrongpassword", legacyHash)).toBe(false);
    });

    it("rejects a malformed scrypt hash", () => {
      expect(verifyPassword("test", "scrypt:invalid")).toBe(false);
      expect(verifyPassword("test", "scrypt::")).toBe(false);
    });
  });
});
