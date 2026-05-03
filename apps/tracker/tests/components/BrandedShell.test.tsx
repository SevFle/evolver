import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { BrandedShell } from "../../src/components/BrandedShell";

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

  it("renders logo image when logoUrl provided", () => {
    const { container } = render(
      <BrandedShell logoUrl="https://example.com/logo.png">
        <span>child</span>
      </BrandedShell>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://example.com/logo.png");
  });

  it("falls back to text when logoUrl is http (not https)", () => {
    const { container, getByText } = render(
      <BrandedShell logoUrl="http://example.com/logo.png" tenantName="TestCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("TestCo")).toBeDefined();
  });

  it("falls back to text when logoUrl is malformed", () => {
    const { container, getByText } = render(
      <BrandedShell logoUrl="not-a-valid-url" tenantName="TestCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("TestCo")).toBeDefined();
  });

  it("falls back to text when logoUrl is empty string", () => {
    const { container, getByText } = render(
      <BrandedShell logoUrl="" tenantName="TestCo">
        <span>child</span>
      </BrandedShell>
    );
    expect(container.querySelector("img")).toBeNull();
    expect(getByText("TestCo")).toBeDefined();
  });

  it("renders logo for valid https URL with path", () => {
    const { container } = render(
      <BrandedShell logoUrl="https://cdn.example.com/assets/logo.svg">
        <span>child</span>
      </BrandedShell>
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("https://cdn.example.com/assets/logo.svg");
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

  it("renders support link when provided", () => {
    const { getByText } = render(
      <BrandedShell supportUrl="https://help.test.com">
        <span>child</span>
      </BrandedShell>
    );
    const link = getByText("Support");
    expect(link.getAttribute("href")).toBe("https://help.test.com");
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
});
