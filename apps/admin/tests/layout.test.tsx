import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("./globals.css", () => ({}));

import RootLayout from "../src/app/layout";

describe("RootLayout", () => {
  it("renders children", () => {
    render(
      <RootLayout>
        <p>Test child content</p>
      </RootLayout>
    );
    expect(screen.getByText("Test child content")).toBeDefined();
  });

  it("exports metadata with correct title and description", async () => {
    const mod = await import("../src/app/layout");
    expect(mod.metadata?.title).toBe("ShipLens Admin");
    expect(mod.metadata?.description).toBe(
      "Manage shipments, tenants, and notifications"
    );
  });
});
