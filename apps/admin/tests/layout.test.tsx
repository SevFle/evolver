import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import RootLayout, { metadata } from "../src/app/layout";

describe("RootLayout", () => {
  it("renders children inside html and body", () => {
    const { baseElement } = render(
      <RootLayout>
        <div data-testid="child">Test Child</div>
      </RootLayout>
    );
    expect(baseElement.querySelector('[data-testid="child"]')).not.toBeNull();
    expect(baseElement.querySelector('[data-testid="child"]')?.textContent).toBe("Test Child");
    const html = baseElement.closest("html") ?? document.documentElement;
    expect(html.getAttribute("lang")).toBe("en");
    expect(baseElement.tagName.toLowerCase()).toBe("body");
  });

  it("exports correct metadata", () => {
    expect(metadata.title).toBe("ShipLens Admin");
    expect(metadata.description).toBe("Manage shipments, tenants, and notifications");
  });
});
