import { describe, it, expect } from "vitest";
import {
  sanitizeSupportUrl,
  validateContactEmail,
  validateLogoUrl,
} from "../src/lib/url-sanitizer";

describe("sanitizeSupportUrl", () => {
  it("returns null for null input", () => {
    expect(sanitizeSupportUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeSupportUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(sanitizeSupportUrl("")).toBeNull();
  });

  it("returns valid HTTPS URL", () => {
    expect(sanitizeSupportUrl("https://help.example.com")).toBe(
      "https://help.example.com"
    );
  });

  it("returns valid HTTP URL", () => {
    expect(sanitizeSupportUrl("http://help.example.com")).toBe(
      "http://help.example.com"
    );
  });

  it("rejects javascript: protocol", () => {
    expect(sanitizeSupportUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: protocol", () => {
    expect(sanitizeSupportUrl("data:text/html,<h1>test</h1>")).toBeNull();
  });

  it("rejects vbscript: protocol", () => {
    expect(sanitizeSupportUrl("vbscript:msgbox")).toBeNull();
  });
});

describe("validateContactEmail", () => {
  it("returns null for null input", () => {
    expect(validateContactEmail(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(validateContactEmail(undefined)).toBeNull();
  });

  it("returns valid email", () => {
    expect(validateContactEmail("user@example.com")).toBe("user@example.com");
  });

  it("rejects email without @", () => {
    expect(validateContactEmail("userexample.com")).toBeNull();
  });

  it("rejects email with spaces", () => {
    expect(validateContactEmail("user @example.com")).toBeNull();
  });

  it("accepts email with plus sign", () => {
    expect(validateContactEmail("user+tag@example.com")).toBe(
      "user+tag@example.com"
    );
  });
});

describe("validateLogoUrl", () => {
  it("returns null for null input", () => {
    expect(validateLogoUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(validateLogoUrl(undefined)).toBeNull();
  });

  it("returns valid HTTPS URL", () => {
    expect(validateLogoUrl("https://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("rejects HTTP URL", () => {
    expect(validateLogoUrl("http://cdn.example.com/logo.png")).toBeNull();
  });

  it("rejects relative URL", () => {
    expect(validateLogoUrl("/logo.png")).toBeNull();
  });

  it("rejects javascript: URL", () => {
    expect(validateLogoUrl("javascript:alert(1)")).toBeNull();
  });
});
