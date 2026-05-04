import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminDashboard from "../src/app/page";

describe("AdminDashboard", () => {
  it("renders the heading", () => {
    render(<AdminDashboard />);
    expect(screen.getByText("ShipLens Admin")).toBeDefined();
  });

  it("renders navigation links", () => {
    render(<AdminDashboard />);
    expect(screen.getByText("Shipments")).toBeDefined();
    expect(screen.getByText("Settings")).toBeDefined();
    expect(screen.getByText("API Keys")).toBeDefined();
    expect(screen.getByText("Notifications")).toBeDefined();
  });

  it("navigation links have correct hrefs", () => {
    render(<AdminDashboard />);
    expect(screen.getByText("Shipments").closest("a")?.getAttribute("href")).toBe("/shipments");
    expect(screen.getByText("Settings").closest("a")?.getAttribute("href")).toBe("/settings");
    expect(screen.getByText("API Keys").closest("a")?.getAttribute("href")).toBe("/api-keys");
    expect(screen.getByText("Notifications").closest("a")?.getAttribute("href")).toBe("/notifications");
  });

  it("renders welcome message", () => {
    render(<AdminDashboard />);
    expect(screen.getByText(/Welcome to ShipLens/)).toBeDefined();
  });

  it("applies valid style objects (not null) to container", () => {
    const { container } = render(<AdminDashboard />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.style).toBeDefined();
  });
});
