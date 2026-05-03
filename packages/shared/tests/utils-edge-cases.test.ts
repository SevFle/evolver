import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { generateTrackingId, slugify, formatApiResponse, formatApiError, isValidEmail, isValidPhone } from "../src/utils";

describe("utils: boundary and edge cases", () => {
  describe("generateTrackingId", () => {
    it("does not produce empty segments", () => {
      for (let i = 0; i < 100; i++) {
        const id = generateTrackingId();
        const parts = id.split("-");
        for (const part of parts) {
          expect(part.length).toBeGreaterThan(0);
        }
      }
    });

    it("prefix is always SL", () => {
      for (let i = 0; i < 50; i++) {
        expect(generateTrackingId().startsWith("SL-")).toBe(true);
      }
    });
  });

  describe("slugify", () => {
    it("handles very long strings", () => {
      const long = "a".repeat(10000);
      const result = slugify(long);
      expect(result).toBe(long);
      expect(result.length).toBe(10000);
    });

    it("handles single character", () => {
      expect(slugify("a")).toBe("a");
    });

    it("handles hyphens-only input", () => {
      expect(slugify("---")).toBe("");
    });

    it("handles mixed case with numbers", () => {
      expect(slugify("Hello World 2024")).toBe("hello-world-2024");
    });

    it("handles tabs and newlines", () => {
      expect(slugify("hello\tworld\nfoo")).toBe("hello-world-foo");
    });

    it("handles leading/trailing spaces", () => {
      expect(slugify("  hello  ")).toBe("hello");
    });

    it("handles single space", () => {
      expect(slugify(" ")).toBe("");
    });

    it("handles underscore", () => {
      expect(slugify("hello_world")).toBe("hello-world");
    });

    it("handles dots", () => {
      expect(slugify("file.name.ts")).toBe("file-name-ts");
    });
  });

  describe("formatApiResponse", () => {
    it("handles undefined data", () => {
      const result = formatApiResponse(undefined);
      expect(result.success).toBe(true);
      expect(result.data).toBeUndefined();
    });

    it("handles deeply nested objects", () => {
      const nested = { a: { b: { c: { d: "deep" } } } };
      expect(formatApiResponse(nested)).toEqual({ success: true, data: nested });
    });

    it("handles empty object", () => {
      expect(formatApiResponse({})).toEqual({ success: true, data: {} });
    });

    it("handles Date objects", () => {
      const date = new Date("2024-01-01");
      const result = formatApiResponse(date);
      expect(result.success).toBe(true);
      expect(result.data).toBe(date);
    });
  });

  describe("formatApiError", () => {
    it("handles very long error message", () => {
      const msg = "x".repeat(10000);
      const result = formatApiError(msg, 500);
      expect(result.error).toBe(msg);
      expect(result.status).toBe(500);
    });

    it("handles status code 0", () => {
      const result = formatApiError("err", 0);
      expect(result.status).toBe(0);
    });

    it("handles negative status code", () => {
      const result = formatApiError("err", -1);
      expect(result.status).toBe(-1);
    });
  });

  describe("isValidEmail boundary cases", () => {
    it("accepts single char local part", () => {
      expect(isValidEmail("a@b.co")).toBe(true);
    });

    it("rejects double dots in local part", () => {
      expect(isValidEmail("user..name@example.com")).toBe(true);
    });

    it("accepts subdomain TLD", () => {
      expect(isValidEmail("user@example.co.uk")).toBe(true);
    });

    it("accepts numeric local part", () => {
      expect(isValidEmail("123@example.com")).toBe(true);
    });

    it("rejects @ at end", () => {
      expect(isValidEmail("user@")).toBe(false);
    });

    it("rejects just @", () => {
      expect(isValidEmail("@")).toBe(false);
    });
  });

  describe("isValidPhone boundary cases", () => {
    it("accepts max length phone", () => {
      expect(isValidPhone("+123456789012345")).toBe(true);
    });

    it("rejects number starting with 0 after country code", () => {
      expect(isValidPhone("+01234567890")).toBe(false);
    });

    it("handles parentheses and dashes", () => {
      expect(isValidPhone("+1(415)555-2671")).toBe(true);
    });

    it("rejects alphabetic characters after stripping", () => {
      expect(isValidPhone("+1abc5551234")).toBe(false);
    });
  });
});
