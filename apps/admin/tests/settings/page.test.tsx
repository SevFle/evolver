import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import SettingsPage from "../../src/app/settings/page";

describe("SettingsPage", () => {
  it("renders heading", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Tenant Settings")).toBeDefined();
  });

  it("renders coming soon text", () => {
    render(<SettingsPage />);
    expect(screen.getByText(/coming soon/)).toBeDefined();
  });
});
