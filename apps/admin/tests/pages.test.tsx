import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ShipmentList", () => ({
  ShipmentList: () => <div data-testid="shipment-list">ShipmentListMock</div>,
}));

vi.mock("@/lib/auth-context", () => ({
  AuthProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="auth-provider">{children}</div>
  ),
}));

vi.mock("@/components/TopNav", () => ({
  TopNav: () => <nav data-testid="top-nav">TopNav</nav>,
}));

describe("Shipment Page", () => {
  it("renders page heading and ShipmentList", async () => {
    const { default: ShipmentsPage } = await import(
      "@/app/shipments/page"
    );
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipments")).toBeDefined();
    expect(screen.getByTestId("shipment-list")).toBeDefined();
  });
});

describe("Dashboard Page", () => {
  it("renders dashboard heading and cards", async () => {
    const { default: AdminDashboard } = await import("@/app/page");
    render(<AdminDashboard />);
    expect(screen.getByText("Dashboard")).toBeDefined();
    expect(screen.getByText("Shipments")).toBeDefined();
    expect(screen.getByText("API Keys")).toBeDefined();
    expect(screen.getByText("Tracking Page Config")).toBeDefined();
  });

  it("renders card links with correct hrefs", async () => {
    const { default: AdminDashboard } = await import("@/app/page");
    render(<AdminDashboard />);
    const links = screen.getAllByRole("link");
    const hrefs = links.map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/shipments");
    expect(hrefs).toContain("/api-keys");
    expect(hrefs).toContain("/settings");
  });

  it("renders card descriptions", async () => {
    const { default: AdminDashboard } = await import("@/app/page");
    render(<AdminDashboard />);
    expect(
      screen.getByText("View, search, and manage your shipments")
    ).toBeDefined();
    expect(
      screen.getByText("Manage API keys for integrations")
    ).toBeDefined();
    expect(
      screen.getByText("Customize your tracking page branding")
    ).toBeDefined();
  });
});

describe("API Keys Page", () => {
  it("renders heading and placeholder", async () => {
    const { default: ApiKeysPage } = await import("@/app/api-keys/page");
    render(<ApiKeysPage />);
    expect(screen.getByText("API Keys")).toBeDefined();
    expect(screen.getByText("API key management coming soon.")).toBeDefined();
  });
});

describe("Settings Page", () => {
  it("renders heading and placeholder", async () => {
    const { default: SettingsPage } = await import("@/app/settings/page");
    render(<SettingsPage />);
    expect(screen.getByText("Tenant Settings")).toBeDefined();
    expect(
      screen.getByText("Branding and notification settings coming soon.")
    ).toBeDefined();
  });
});

describe("Notifications Page", () => {
  it("renders heading and placeholder", async () => {
    const { default: NotificationsPage } = await import(
      "@/app/notifications/page"
    );
    render(<NotificationsPage />);
    expect(screen.getByText("Notification Rules")).toBeDefined();
    expect(
      screen.getByText("Notification rule management coming soon.")
    ).toBeDefined();
  });
});

describe("Root Layout", () => {
  it("wraps children with AuthProvider and TopNav", async () => {
    const { default: RootLayout } = await import("@/app/layout");
    render(
      <RootLayout>
        <div data-testid="child">Child content</div>
      </RootLayout>
    );
    expect(screen.getByTestId("auth-provider")).toBeDefined();
    expect(screen.getByTestId("top-nav")).toBeDefined();
    expect(screen.getByTestId("child")).toBeDefined();
  });
});
