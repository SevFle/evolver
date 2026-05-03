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
    const { getByText } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("ShipLens")).toBeDefined();
  });

  it("renders custom tenant name", () => {
    const { getByText } = render(
      <BrandedShell tenantName="Acme Corp">
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("Acme Corp")).toBeDefined();
  });

  it("renders footer text", () => {
    const { getByText } = render(
      <BrandedShell>
        <span>child</span>
      </BrandedShell>
    );
    expect(getByText("Powered by ShipLens")).toBeDefined();
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
});
