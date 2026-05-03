import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BrandedShell, sanitizeUrl } from "../../src/components/BrandedShell";

describe("sanitizeUrl", () => {
  it("returns null for null input", () => {
    expect(sanitizeUrl(null)).toBeNull();
  });

  it("returns null for undefined input", () => {
    expect(sanitizeUrl(undefined)).toBeNull();
  });

  it("returns null for empty string", () => {
    expect(sanitizeUrl("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(sanitizeUrl("   ")).toBeNull();
  });

  it("returns https URL unchanged", () => {
    const url = "https://example.com/logo.png";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("returns relative path starting with /", () => {
    expect(sanitizeUrl("/images/logo.png")).toBe("/images/logo.png");
  });

  it("returns relative path with nested segments", () => {
    expect(sanitizeUrl("/a/b/c")).toBe("/a/b/c");
  });

  it("returns https URL with query string", () => {
    const url = "https://cdn.example.com/logo.png?v=1";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("returns https URL with hash", () => {
    const url = "https://example.com/page#section";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("returns null for javascript: scheme", () => {
    expect(sanitizeUrl("javascript:alert(1)")).toBeNull();
  });

  it("returns null for javascript: scheme with whitespace", () => {
    expect(sanitizeUrl("  javascript:alert(1)  ")).toBeNull();
  });

  it("returns null for data: scheme", () => {
    expect(sanitizeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("returns null for data: image scheme", () => {
    expect(sanitizeUrl("data:image/png;base64,abc123")).toBeNull();
  });

  it("returns null for vbscript: scheme", () => {
    expect(sanitizeUrl("vbscript:MsgBox(1)")).toBeNull();
  });

  it("returns null for http: scheme", () => {
    expect(sanitizeUrl("http://example.com")).toBeNull();
  });

  it("returns null for ftp: scheme", () => {
    expect(sanitizeUrl("ftp://files.example.com")).toBeNull();
  });

  it("returns null for random string that is not a URL", () => {
    expect(sanitizeUrl("not-a-url")).toBeNull();
  });

  it("trims whitespace before validating", () => {
    expect(sanitizeUrl("  https://example.com  ")).toBe("https://example.com");
  });

  it("returns null for schemeless string without leading slash", () => {
    expect(sanitizeUrl("example.com/path")).toBeNull();
  });

  it("handles mailto: scheme as allowed", () => {
    const url = "mailto:test@example.com";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("handles tel: scheme as allowed", () => {
    const url = "tel:+1-555-1234";
    expect(sanitizeUrl(url)).toBe(url);
  });

  it("returns null for file: scheme", () => {
    expect(sanitizeUrl("file:///etc/passwd")).toBeNull();
  });

  it("handles mixed case javascript scheme", () => {
    expect(sanitizeUrl("JaVaScRiPt:alert(1)")).toBeNull();
  });

  it("handles mixed case data scheme", () => {
    expect(sanitizeUrl("DATA:text/html,<h1>hi</h1>")).toBeNull();
  });

  it("returns just slash for root path", () => {
    expect(sanitizeUrl("/")).toBe("/");
  });
});

describe("BrandedShell", () => {
  it("renders children", () => {
    const { getByText } = render(
      <BrandedShell>
        <p>Test Content</p>
      </BrandedShell>
    );
    expect(getByText("Test Content")).toBeDefined();
  });

  it("renders default tenant name ShipLens", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    const brandName = container.querySelector(".tracking-brand-name");
    expect(brandName?.textContent).toBe("ShipLens");
  });

  it("renders custom tenant name", () => {
    const { getByText } = render(
      <BrandedShell tenantName="Acme Corp">
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("Acme Corp")).toBeDefined();
  });

  it("renders footer powered by text", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    const footer = container.querySelector(".tracking-footer-powered");
    expect(footer?.textContent).toContain("Powered by");
    expect(footer?.textContent).toContain("ShipLens");
  });

  it("renders with empty children", () => {
    const { container } = render(<BrandedShell>{""}</BrandedShell>);
    expect(container).toBeDefined();
  });

  it("renders header element", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    const header = container.querySelector("header");
    expect(header).not.toBeNull();
  });

  it("renders footer element", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    const footer = container.querySelector("footer");
    expect(footer).not.toBeNull();
  });

  it("renders logo image when valid https logoUrl provided", () => {
    const { container } = render(
      <BrandedShell logoUrl="https://example.com/logo.png">
        <span>child</span>
      </BrandedShell>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/logo.png");
  });

  it("renders logo image when relative path logoUrl provided", () => {
    const { container } = render(
      <BrandedShell logoUrl="/images/logo.png">
        <span>child</span>
      </BrandedShell>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/images/logo.png");
  });

  it("falls back to tenant name when logoUrl is javascript: scheme", () => {
    const { getByText, container } = render(
      <BrandedShell logoUrl="javascript:alert(1)" tenantName="SafeCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("SafeCo")).toBeDefined();
  });

  it("falls back to tenant name when logoUrl is data: scheme", () => {
    const { getByText, container } = render(
      <BrandedShell logoUrl="data:image/png;base64,abc" tenantName="SafeCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("SafeCo")).toBeDefined();
  });

  it("falls back to tenant name when logoUrl is http: scheme", () => {
    const { getByText, container } = render(
      <BrandedShell logoUrl="http://example.com/logo.png" tenantName="SafeCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("SafeCo")).toBeDefined();
  });

  it("falls back to tenant name when logoUrl is invalid string", () => {
    const { getByText, container } = render(
      <BrandedShell logoUrl="not-a-url" tenantName="SafeCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("SafeCo")).toBeDefined();
  });

  it("renders tenant name as text when no logoUrl", () => {
    const { getByText, container } = render(
      <BrandedShell tenantName="TestCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("TestCo")).toBeDefined();
    expect(container.querySelector("img")).toBeNull();
  });

  it("renders tagline when provided", () => {
    const { getByText } = render(
      <BrandedShell tagline="Your trusted partner">
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("Your trusted partner")).toBeDefined();
  });

  it("does not render tagline when not provided", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector(".tracking-tagline")).toBeNull();
  });

  it("renders contact email as mailto link", () => {
    const { getByText } = render(
      <BrandedShell contactEmail="support@test.com">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("support@test.com");
    expect(link.getAttribute("href")).toBe("mailto:support@test.com");
  });

  it("renders contact phone as tel link", () => {
    const { getByText } = render(
      <BrandedShell contactPhone="+1-555-1234">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("+1-555-1234");
    expect(link.getAttribute("href")).toBe("tel:+1-555-1234");
  });

  it("renders support link when valid https supportUrl provided", () => {
    const { getByText } = render(
      <BrandedShell supportUrl="https://help.test.com">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("Support");
    expect(link.getAttribute("href")).toBe("https://help.test.com");
  });

  it("adds rel noopener noreferrer to support link", () => {
    const { getByText } = render(
      <BrandedShell supportUrl="https://help.test.com">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("Support");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("adds target _blank to support link", () => {
    const { getByText } = render(
      <BrandedShell supportUrl="https://help.test.com">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("Support");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("does not render support link when supportUrl is javascript:", () => {
    const { queryByText } = render(
      <BrandedShell supportUrl="javascript:alert(1)">
        <span>child</span>
      </BrandedShell>
    );
    expect(queryByText("Support")).toBeNull();
  });

  it("does not render support link when supportUrl is data:", () => {
    const { queryByText } = render(
      <BrandedShell supportUrl="data:text/html,evil">
        <span>child</span>
      </BrandedShell>
    );
    expect(queryByText("Support")).toBeNull();
  });

  it("does not render support link when supportUrl is vbscript:", () => {
    const { queryByText } = render(
      <BrandedShell supportUrl="vbscript:MsgBox">
        <span>child</span>
      </BrandedShell>
    );
    expect(queryByText("Support")).toBeNull();
  });

  it("does not render support link when supportUrl is http:", () => {
    const { queryByText } = render(
      <BrandedShell supportUrl="http://help.test.com">
        <span>child</span>
      </BrandedShell>
    );
    expect(queryByText("Support")).toBeNull();
  });

  it("renders support link when supportUrl is relative path", () => {
    const { getByText } = render(
      <BrandedShell supportUrl="/support">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("Support");
    expect(link.getAttribute("href")).toBe("/support");
  });

  it("does not render support link when supportUrl is invalid string", () => {
    const { queryByText } = render(
      <BrandedShell supportUrl="not-a-url">
        <span>child</span>
      </BrandedShell>
    );
    expect(queryByText("Support")).toBeNull();
  });

  it("renders custom footer text", () => {
    const { getByText } = render(
      <BrandedShell customFooterText="Copyright 2025 TestCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("Copyright 2025 TestCo")).toBeDefined();
  });

  it("applies primary color to header border", () => {
    const { container } = render(
      <BrandedShell primaryColor="#ff0000">
        <span>child</span>
      </BrandedShell>
    );
    const header = container.querySelector("header") as HTMLElement | null;
    expect(header?.style.borderColor).toBe("rgb(255, 0, 0)");
  });

  it("applies primary color to brand name text", () => {
    const { container } = render(
      <BrandedShell primaryColor="#ff0000">
        <span>child</span>
      </BrandedShell>
    );
    const name = container.querySelector(".tracking-brand-name") as HTMLElement | null;
    expect(name?.style.color).toBe("rgb(255, 0, 0)");
  });

  it("uses default primary color variable when no primaryColor provided", () => {
    const { container } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    const header = container.querySelector("header") as HTMLElement | null;
    expect(header?.style.borderColor).toBe("var(--color-primary)");
  });
});
