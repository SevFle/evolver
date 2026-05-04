import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NotificationSettings } from "../src/components/NotificationSettings";

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: vi.fn(),
    put: vi.fn(),
  },
}));

import { apiClient } from "../src/lib/api-client";

const mockGet = vi.mocked(apiClient.get);
const mockPut = vi.mocked(apiClient.put);

const MILESTONES = ["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception"] as const;

const defaultPrefs = MILESTONES.map((m, i) => ({
  id: `pref-${i}`,
  tenantId: "t1",
  milestoneType: m,
  channel: "email" as const,
  enabled: true,
  customTemplate: null,
  createdAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
}));

describe("NotificationSettings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<NotificationSettings />);
    expect(screen.getByText("Loading notification preferences...")).toBeDefined();
  });

  it("renders all 6 milestone rows after loading", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Created")).toBeDefined();
    });
    expect(screen.getByText("Picked Up")).toBeDefined();
    expect(screen.getByText("In Transit")).toBeDefined();
    expect(screen.getByText("Out for Delivery")).toBeDefined();
    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Exception")).toBeDefined();
  });

  it("renders heading and description", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { level: 1, name: "Notification Preferences" })).toBeDefined();
    });
    expect(
      screen.getByText("Configure which shipment milestones trigger notifications and how they are delivered.")
    ).toBeDefined();
  });

  it("renders toggle checkboxes for each milestone", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-created")).toBeDefined();
    });

    for (const m of MILESTONES) {
      const toggle = screen.getByTestId(`toggle-${m}`) as HTMLInputElement;
      expect(toggle.checked).toBe(true);
    }
  });

  it("renders channel selectors with default 'email'", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("channel-created")).toBeDefined();
    });

    for (const m of MILESTONES) {
      const select = screen.getByTestId(`channel-${m}`) as HTMLSelectElement;
      expect(select.value).toBe("email");
    }
  });

  it("renders template textareas with empty default", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("template-created")).toBeDefined();
    });

    for (const m of MILESTONES) {
      const textarea = screen.getByTestId(`template-${m}`) as HTMLTextAreaElement;
      expect(textarea.value).toBe("");
    }
  });

  it("toggles enabled state when checkbox is clicked", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-delivered")).toBeDefined();
    });

    const toggle = screen.getByTestId("toggle-delivered") as HTMLInputElement;
    expect(toggle.checked).toBe(true);

    fireEvent.click(toggle);
    expect(toggle.checked).toBe(false);
    expect(screen.getByText("Disabled")).toBeDefined();
  });

  it("changes channel when selector is changed", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("channel-delivered")).toBeDefined();
    });

    const select = screen.getByTestId("channel-delivered") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "sms" } });
    expect(select.value).toBe("sms");
  });

  it("updates template text when textarea is typed in", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("template-exception")).toBeDefined();
    });

    const textarea = screen.getByTestId("template-exception") as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "Custom alert message" } });
    expect(textarea.value).toBe("Custom alert message");
  });

  it("renders Save Preferences button", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("save-button")).toBeDefined();
    });
    expect(screen.getByText("Save Preferences")).toBeDefined();
  });

  it("saves all preferences when save button is clicked", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    mockPut.mockResolvedValue({ success: true });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("save-button")).toBeDefined();
    });

    const saveBtn = screen.getByTestId("save-button");
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(mockPut).toHaveBeenCalledTimes(6);
    });
  });

  it("shows success message after saving", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    mockPut.mockResolvedValue({ success: true });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("save-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(screen.getByText("Preferences saved successfully.")).toBeDefined();
    });
  });

  it("shows error when fetch fails", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("shows error when save fails", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    mockPut.mockRejectedValue(new Error("Save failed"));
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("save-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(screen.getByText("Save failed")).toBeDefined();
    });
  });

  it("shows saving state on save button during save", async () => {
    mockGet.mockResolvedValue({ success: true, data: defaultPrefs });
    mockPut.mockReturnValue(new Promise(() => {}));
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("save-button")).toBeDefined();
    });

    fireEvent.click(screen.getByTestId("save-button"));

    await waitFor(() => {
      expect(screen.getByText("Saving...")).toBeDefined();
    });
  });

  it("renders with default preferences when API returns empty data", async () => {
    mockGet.mockResolvedValue({ success: true, data: [] });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByText("Created")).toBeDefined();
    });
    expect(screen.getByText("Delivered")).toBeDefined();
  });

  it("renders custom template values from API response", async () => {
    const prefsWithTemplate = defaultPrefs.map((p) =>
      p.milestoneType === "exception"
        ? { ...p, customTemplate: "URGENT: Shipment exception occurred!" }
        : p
    );
    mockGet.mockResolvedValue({ success: true, data: prefsWithTemplate });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("template-exception")).toBeDefined();
    });

    const textarea = screen.getByTestId("template-exception") as HTMLTextAreaElement;
    expect(textarea.value).toBe("URGENT: Shipment exception occurred!");
  });

  it("renders disabled preferences from API correctly", async () => {
    const prefsDisabled = defaultPrefs.map((p) =>
      p.milestoneType === "picked_up" ? { ...p, enabled: false } : p
    );
    mockGet.mockResolvedValue({ success: true, data: prefsDisabled });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("toggle-picked_up")).toBeDefined();
    });

    const toggle = screen.getByTestId("toggle-picked_up") as HTMLInputElement;
    expect(toggle.checked).toBe(false);
  });

  it("renders channel values from API correctly", async () => {
    const prefsChannel = defaultPrefs.map((p) =>
      p.milestoneType === "in_transit" ? { ...p, channel: "both" as const } : p
    );
    mockGet.mockResolvedValue({ success: true, data: prefsChannel });
    render(<NotificationSettings />);

    await waitFor(() => {
      expect(screen.getByTestId("channel-in_transit")).toBeDefined();
    });

    const select = screen.getByTestId("channel-in_transit") as HTMLSelectElement;
    expect(select.value).toBe("both");
  });
});
