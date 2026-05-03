import { describe, it, expect } from "vitest";
import { sanitizeUrl } from "../src/lib/url-sanitizer";

describe("sanitizeUrl", () => {
  it("returns https URL unchanged", () => {
    expect(sanitizeUrl("https://example.com/logo.png")).toBe(
      "https://example.com/logo.png"
    );
  });

  it("returns https URL with path unchanged", () => {
    expect(sanitizeUrl("https://cdn.example.com/assets/img/logo.svg")).toBe(
      "https://cdn.example.com/assets/img/logo.svg"
    );
  });

  it("returns null for http URL", () => {
    expect(sanitizeUrl("http://example.com")).toBeNull();
  });

  it("returns null for javascript: URL", () => {
    expect(sanitizeUrl("javascript:alert('xss')")).toBeNull();
  });

  it("returns null for data: URL", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("returns null for vbscript: URL", () => {
    expect(sanitizeUrl("vbscript:msgbox")).toBeNull();
  });

  it("returns null for null input", () => {
    expect(sanitizeUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(sanitizeUrl("")).toBeNull();
  });

  it("returns null for relative URL", () => {
    expect(sanitizeUrl("/logo.png")).toBeNull();
  });

  it("returns null for protocol-relative URL", () => {
    expect(sanitizeUrl("//example.com/logo.png")).toBeNull();
  });

  it("returns null for ftp URL", () => {
    expect(sanitizeUrl("ftp://example.com")).toBeNull();
  });

  it("returns null for mailto URL", () => {
    expect(sanitizeUrl("mailto:test@example.com")).toBeNull();
  });

  it("is case-insensitive for javascript scheme", () => {
    expect(sanitizeUrl("JavaScript:alert(1)")).toBeNull();
    expect(sanitizeUrl("JAVASCRIPT:alert(1)")).toBeNull();
  });

  it("is case-insensitive for data scheme", () => {
    expect(sanitizeUrl("Data:image/png;base64,abc")).toBeNull();
    expect(sanitizeUrl("DATA:text/html,<script>")).toBeNull();
  });

  it("returns null for javascript: with spaces", () => {
    expect(sanitizeUrl("  javascript:alert(1)")).toBeNull();
  });

  it("returns null for data: with leading spaces", () => {
    expect(sanitizeUrl("  data:text/html,<h1>test</h1>")).toBeNull();
  });

  it("handles https URL with query params", () => {
    expect(sanitizeUrl("https://example.com/logo.png?v=1")).toBe(
      "https://example.com/logo.png?v=1"
    );
  });

  it("handles https URL with hash", () => {
    expect(sanitizeUrl("https://example.com/page#section")).toBe(
      "https://example.com/page#section"
    );
  });

  it("returns null for blob: URL", () => {
    expect(sanitizeUrl("blob:https://example.com/abc")).toBeNull();
  });
});
