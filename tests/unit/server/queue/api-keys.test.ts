import { describe, it, expect } from "vitest";
import { generateApiKey, hashApiKey } from "@/server/auth/api-keys";

describe("api-keys", () => {
  describe("generateApiKey", () => {
    it("generates a key with the correct prefix", async () => {
      const { raw } = await generateApiKey();
      expect(raw).toMatch(/^hr_[A-Za-z0-9_-]+$/);
    });

    it("generates a non-empty prefix", async () => {
      const { prefix } = await generateApiKey();
      expect(prefix.length).toBe(12);
      expect(prefix).toMatch(/^hr_/);
    });

    it("generates unique keys", async () => {
      const key1 = await generateApiKey();
      const key2 = await generateApiKey();
      expect(key1.raw).not.toBe(key2.raw);
      expect(key1.hash).not.toBe(key2.hash);
    });
  });

  describe("hashApiKey", () => {
    it("produces a consistent hash", () => {
      const key = "hr_testkey123";
      const hash1 = hashApiKey(key);
      const hash2 = hashApiKey(key);
      expect(hash1).toBe(hash2);
    });

    it("produces different hashes for different keys", () => {
      const hash1 = hashApiKey("hr_key_a");
      const hash2 = hashApiKey("hr_key_b");
      expect(hash1).not.toBe(hash2);
    });

    it("produces a hex string", () => {
      const hash = hashApiKey("hr_test");
      expect(hash).toMatch(/^[a-f0-9]+$/);
    });
  });
});
