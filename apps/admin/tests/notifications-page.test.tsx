import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "../src/components/SettingsPage";

const mockTenantConfig = {
  success: true,
  data: {
    id: "tenant-1",
    name: "Acme Forwarding",
    slug: "acme",
    notificationChannel: "both",
  },
};

const mockNotificationRules = {
  success: true,
  data: [
    { id: "rule-1", name: "Shipment Picked Up", eventCode: "picked_up", channel: "email", isActive: true },
    { id: "rule-2", name: "Delivered", eventCode: "delivered", channel: "sms", isActive: true },
  ],
};

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      if (path === "/api/notifications/rules") return Promise.resolve(mockNotificationRules);
      return Promise.resolve({ success: true, data: [] });
    }),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("NotificationsPage (via SettingsPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage initialTab="notifications" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tenant Settings" })).toBeDefined();
  });

  it("shows Notifications tab as active", () => {
    render(<SettingsPage initialTab="notifications" />);
    expect(screen.getByRole("tab", { name: "Notifications" }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders Notification Preferences heading", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
  });

  it("renders email toggle switch", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" })).toBeDefined();
    });
  });

  it("renders SMS toggle switch", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle SMS notifications" })).toBeDefined();
    });
  });

  it("shows both toggles enabled when channel is both", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" }).getAttribute("aria-checked")).toBe("true");
      expect(screen.getByRole("switch", { name: "Toggle SMS notifications" }).getAttribute("aria-checked")).toBe("true");
    });
  });

  it("renders Save Preferences button", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByText("Save Preferences")).toBeDefined();
    });
  });

  it("has a container div with padding", () => {
    const { container } = render(<SettingsPage initialTab="notifications" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.padding).toBe("2rem");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<SettingsPage initialTab="notifications" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders notification rules from API", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByText("Shipment Picked Up")).toBeDefined();
      expect(screen.getByText("Delivered")).toBeDefined();
    });
  });

  it("snapshot matches", () => {
    const { container } = render(<SettingsPage initialTab="notifications" />);
    expect(container).toMatchSnapshot();
  });
});
