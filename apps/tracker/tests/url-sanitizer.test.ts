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

  it("returns canonical HTTPS URL", () => {
    expect(sanitizeSupportUrl("https://help.example.com")).toBe(
      "https://help.example.com/"
    );
  });

  it("returns canonical HTTP URL", () => {
    expect(sanitizeSupportUrl("http://help.example.com")).toBe(
      "http://help.example.com/"
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

  it("returns null for malformed URL", () => {
    expect(sanitizeSupportUrl("not a url")).toBeNull();
  });

  it("returns canonical URL with path", () => {
    expect(sanitizeSupportUrl("https://help.example.com/page")).toBe(
      "https://help.example.com/page"
    );
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

  it("returns null for empty string", () => {
    expect(validateLogoUrl("")).toBeNull();
  });

  it("returns canonical HTTPS URL via parsed.href", () => {
    expect(validateLogoUrl("https://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("returns canonical href for URL without path (adds trailing slash)", () => {
    expect(validateLogoUrl("https://cdn.example.com")).toBe(
      "https://cdn.example.com/"
    );
  });

  it("normalizes uppercase protocol to canonical lowercase href", () => {
    expect(validateLogoUrl("HTTPS://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("trims leading and trailing whitespace before parsing", () => {
    expect(validateLogoUrl("  https://cdn.example.com/logo.png  ")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("trims leading whitespace before parsing", () => {
    expect(validateLogoUrl("   https://cdn.example.com/logo.png")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("trims trailing whitespace before parsing", () => {
    expect(validateLogoUrl("https://cdn.example.com/logo.png   ")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("trims tab characters before parsing", () => {
    expect(validateLogoUrl("\thttps://cdn.example.com/logo.png\t")).toBe(
      "https://cdn.example.com/logo.png"
    );
  });

  it("returns canonical href for URL with query string", () => {
    expect(
      validateLogoUrl("https://cdn.example.com/logo.png?v=2")
    ).toBe("https://cdn.example.com/logo.png?v=2");
  });

  it("returns canonical href for URL with fragment", () => {
    expect(validateLogoUrl("https://cdn.example.com/logo.png#icon")).toBe(
      "https://cdn.example.com/logo.png#icon"
    );
  });

  it("rejects HTTP URL", () => {
    expect(validateLogoUrl("http://cdn.example.com/logo.png")).toBeNull();
  });

  it("rejects ftp URL", () => {
    expect(validateLogoUrl("ftp://cdn.example.com/logo.png")).toBeNull();
  });

  it("rejects relative URL", () => {
    expect(validateLogoUrl("/logo.png")).toBeNull();
  });

  it("rejects javascript: URL", () => {
    expect(validateLogoUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URL", () => {
    expect(
      validateLogoUrl("data:image/png;base64,AAAA")
    ).toBeNull();
  });

  it("rejects whitespace-only input", () => {
    expect(validateLogoUrl("   ")).toBeNull();
  });

  it("rejects malformed URL after trim", () => {
    expect(validateLogoUrl("  not-a-url  ")).toBeNull();
  });

  it("returns canonical href preserving port number", () => {
    expect(validateLogoUrl("https://cdn.example.com:8443/logo.png")).toBe(
      "https://cdn.example.com:8443/logo.png"
    );
  });

  it("returns canonical href for deep path", () => {
    expect(
      validateLogoUrl("https://cdn.example.com/assets/img/logo.png")
    ).toBe("https://cdn.example.com/assets/img/logo.png");
  });
});
