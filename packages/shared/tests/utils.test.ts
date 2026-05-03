import { describe, it, expect } from "vitest";
import {
  generateTrackingId,
  slugify,
  formatApiResponse,
  formatApiError,
  isValidEmail,
  isValidPhone,
} from "../src/utils";

describe("generateTrackingId", () => {
  it("starts with SL- prefix", () => {
    const id = generateTrackingId();
    expect(id.startsWith("SL-")).toBe(true);
  });

  it("contains three segments separated by hyphens", () => {
    const id = generateTrackingId();
    const parts = id.split("-");
    expect(parts.length).toBe(3);
    expect(parts[0]).toBe("SL");
  });

  it("generates unique ids on successive calls", () => {
    const ids = new Set(Array.from({ length: 50 }, () => generateTrackingId()));
    expect(ids.size).toBe(50);
  });

  it("produces uppercase alphanumeric characters after prefix", () => {
    const id = generateTrackingId();
    const afterPrefix = id.slice(3);
    expect(/^[A-Z0-9\-]+$/.test(afterPrefix)).toBe(true);
  });

  it("timestamp segment is a valid base-36 string", () => {
    const id = generateTrackingId();
    const tsPart = id.split("-")[1];
    expect(/^[A-Z0-9]+$/.test(tsPart)).toBe(true);
  });

  it("random segment has length 6", () => {
    const id = generateTrackingId();
    const randomPart = id.split("-")[2];
    expect(randomPart.length).toBe(6);
  });
});

describe("slugify", () => {
  it("converts to lowercase", () => {
    expect(slugify("Hello World")).toBe("hello-world");
  });

  it("replaces spaces with hyphens", () => {
    expect(slugify("foo bar baz")).toBe("foo-bar-baz");
  });

  it("replaces multiple consecutive spaces with single hyphen", () => {
    expect(slugify("foo   bar")).toBe("foo-bar");
  });

  it("removes special characters", () => {
    expect(slugify("Hello, World! #2024")).toBe("hello-world-2024");
  });

  it("removes leading and trailing hyphens", () => {
    expect(slugify("  hello  ")).toBe("hello");
    expect(slugify("---foo---")).toBe("foo");
  });

  it("handles empty string", () => {
    expect(slugify("")).toBe("");
  });

  it("handles string with only special characters", () => {
    expect(slugify("@#$%")).toBe("");
  });

  it("handles single word", () => {
    expect(slugify("hello")).toBe("hello");
  });

  it("preserves numbers", () => {
    expect(slugify("Order 12345")).toBe("order-12345");
  });

  it("handles mixed case and special characters", () => {
    expect(slugify("ACME Corp (USA)")).toBe("acme-corp-usa");
  });

  it("handles unicode gracefully", () => {
    const result = slugify("café résumé");
    expect(result).toBe("caf-r-sum");
  });
});

describe("formatApiResponse", () => {
  it("wraps data in success response", () => {
    const result = formatApiResponse({ name: "test" });
    expect(result).toEqual({ success: true, data: { name: "test" } });
  });

  it("preserves arrays", () => {
    const result = formatApiResponse([1, 2, 3]);
    expect(result).toEqual({ success: true, data: [1, 2, 3] });
  });

  it("preserves primitive values", () => {
    expect(formatApiResponse("hello")).toEqual({ success: true, data: "hello" });
    expect(formatApiResponse(42)).toEqual({ success: true, data: 42 });
    expect(formatApiResponse(null)).toEqual({ success: true, data: null });
    expect(formatApiResponse(false)).toEqual({ success: true, data: false });
  });

  it("always has success: true", () => {
    expect(formatApiResponse({}).success).toBe(true);
  });
});

describe("formatApiError", () => {
  it("returns error response with message", () => {
    const result = formatApiError("Something went wrong");
    expect(result).toEqual({
      success: false,
      error: "Something went wrong",
      status: undefined,
    });
  });

  it("includes status when provided", () => {
    const result = formatApiError("Not found", 404);
    expect(result).toEqual({
      success: false,
      error: "Not found",
      status: 404,
    });
  });

  it("always has success: false", () => {
    expect(formatApiError("err").success).toBe(false);
  });

  it("handles empty error message", () => {
    const result = formatApiError("");
    expect(result.error).toBe("");
    expect(result.success).toBe(false);
  });
});

describe("isValidEmail", () => {
  it("accepts valid email addresses", () => {
    expect(isValidEmail("user@example.com")).toBe(true);
    expect(isValidEmail("user.name@example.com")).toBe(true);
    expect(isValidEmail("user+tag@example.com")).toBe(true);
    expect(isValidEmail("user@sub.example.com")).toBe(true);
    expect(isValidEmail("a@b.co")).toBe(true);
  });

  it("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false);
  });

  it("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false);
  });

  it("rejects missing local part", () => {
    expect(isValidEmail("@example.com")).toBe(false);
  });

  it("rejects missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false);
    expect(isValidEmail("user@ example.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false);
  });

  it("rejects multiple @ signs", () => {
    expect(isValidEmail("user@@example.com")).toBe(false);
  });
});

describe("isValidPhone", () => {
  it("accepts valid phone numbers", () => {
    expect(isValidPhone("+14155552671")).toBe(true);
    expect(isValidPhone("+442071234567")).toBe(true);
    expect(isValidPhone("14155552671")).toBe(true);
  });

  it("accepts numbers with formatting characters (strips them)", () => {
    expect(isValidPhone("+1 (415) 555-2671")).toBe(true);
    expect(isValidPhone("+1-415-555-2671")).toBe(true);
  });

  it("rejects numbers starting with 0", () => {
    expect(isValidPhone("0123456789")).toBe(false);
  });

  it("rejects too short numbers", () => {
    expect(isValidPhone("+123456")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidPhone("")).toBe(false);
  });

  it("rejects non-numeric strings", () => {
    expect(isValidPhone("abcdefg")).toBe(false);
  });

  it("rejects numbers with letters", () => {
    expect(isValidPhone("+1a4155552671")).toBe(false);
  });
});
