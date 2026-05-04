import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import NotificationsPage from "../src/app/notifications/page";

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { apiClient } from "../src/lib/api-client";

const mockGet = vi.mocked(apiClient.get);

const defaultPrefs = [
  "created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception",
].map((m, i) => ({
  id: `pref-${i}`,
  tenantId: "t1",
  milestoneType: m,
  channel: "email" as const,
  enabled: true,
  customTemplate: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
}));

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Notification Preferences heading", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Notification Preferences" })
      ).toBeDefined();
    });
  });

  it("renders all milestone types", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Created")).toBeDefined();
    });
    expect(screen.getByText("Picked Up")).toBeDefined();
    expect(screen.getByText("In Transit")).toBeDefined();
    expect(screen.getByText("Out for Delivery")).toBeDefined();
    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Exception")).toBeDefined();
  });

  it("has a container div with padding", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
    const div = container.firstElementChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("800px");
  });

  it("renders the description paragraph", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationsPage />);

    await waitFor(() => {
      expect(
        screen.getByText("Configure which shipment milestones trigger notifications and how they are delivered.")
      ).toBeDefined();
    });
  });

  it("renders the heading with correct font weight", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(container.querySelector("h1")).toBeDefined();
    });
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("renders heading with correct font size", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(container.querySelector("h1")).toBeDefined();
    });
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontSize).toBe("1.25rem");
  });

  it("snapshot matches", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    const { container } = render(<NotificationsPage />);

    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
    expect(container).toMatchSnapshot();
  });
});
