import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminDashboard from "@/app/page";
import ShipmentsPage from "@/app/shipments/page";
import ApiKeysPage from "@/app/api-keys/page";
import NotificationsPage from "@/app/notifications/page";
import SettingsPage from "@/app/settings/page";

describe("AdminDashboard", () => {
  it("renders the ShipLens Admin heading", () => {
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

  it("renders welcome message", () => {
    render(<AdminDashboard />);
    expect(
      screen.getByText("Welcome to ShipLens. Select a section to get started.")
    ).toBeDefined();
  });

  it("renders navigation links with correct hrefs", () => {
    render(<AdminDashboard />);
    expect(screen.getByText("Shipments").getAttribute("href")).toBe("/shipments");
    expect(screen.getByText("Settings").getAttribute("href")).toBe("/settings");
    expect(screen.getByText("API Keys").getAttribute("href")).toBe("/api-keys");
    expect(screen.getByText("Notifications").getAttribute("href")).toBe("/notifications");
  });
});

describe("ShipmentsPage", () => {
  it("renders the Shipments heading", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipments")).toBeDefined();
  });

  it("renders coming soon message", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipment management coming soon.")).toBeDefined();
  });

  it("renders heading with correct font size style", () => {
    const { container } = render(<ShipmentsPage />);
    const heading = container.querySelector("h1") as HTMLElement | null;
    expect(heading?.style.fontSize).toBe("1.25rem");
  });

  it("renders container with padding style", () => {
    const { container } = render(<ShipmentsPage />);
    const wrapper = container.firstChild as HTMLElement | null;
    expect(wrapper?.style.padding).toBe("2rem");
  });
});

describe("ApiKeysPage", () => {
  it("renders the API Keys heading", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText("API Keys")).toBeDefined();
  });

  it("renders coming soon message", () => {
    render(<ApiKeysPage />);
    expect(screen.getByText("API key management coming soon.")).toBeDefined();
  });
});

describe("NotificationsPage", () => {
  it("renders the Notification Rules heading", () => {
    render(<NotificationsPage />);
    expect(screen.getByText("Notification Rules")).toBeDefined();
  });

  it("renders coming soon message", () => {
    render(<NotificationsPage />);
    expect(
      screen.getByText("Notification rule management coming soon.")
    ).toBeDefined();
  });
});

describe("SettingsPage", () => {
  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Tenant Settings")).toBeDefined();
  });

  it("renders coming soon message", () => {
    render(<SettingsPage />);
    expect(
      screen.getByText("Branding and notification settings coming soon.")
    ).toBeDefined();
  });
});
