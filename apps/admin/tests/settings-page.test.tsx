import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsPage } from "../src/components/SettingsPage";

const mockTenantConfig = {
  success: true,
  data: {
    id: "tenant-1",
    name: "Acme Forwarding",
    slug: "acme",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#2563EB",
    customDomain: "track.acme.com",
    notificationChannel: "email",
  },
};

const mockApiKeys = {
  success: true,
  data: [
    { id: "key-1", name: "Production", prefix: "sl_prod_", createdAt: "2025-01-15T00:00:00Z" },
  ],
};

const mockNotificationRules = {
  success: true,
  data: [
    { id: "rule-1", name: "Shipment Delivered", eventCode: "delivered", channel: "email", isActive: true },
  ],
};

const mockGet = vi.fn().mockImplementation((path: string) => {
  if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
  if (path === "/api/api-keys") return Promise.resolve(mockApiKeys);
  if (path === "/api/notifications/rules") return Promise.resolve(mockNotificationRules);
  return Promise.resolve({ success: true, data: [] });
});

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
    post: vi.fn().mockResolvedValue({ success: true, key: "sl_new_key_abc123" }),
    patch: vi.fn().mockResolvedValue({ success: true, data: null, message: "Tenant updated" }),
    delete: vi.fn().mockResolvedValue({ success: true, message: "API key revoked" }),
  },
}));

describe("SettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      if (path === "/api/api-keys") return Promise.resolve(mockApiKeys);
      if (path === "/api/notifications/rules") return Promise.resolve(mockNotificationRules);
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("heading", { level: 1, name: "Tenant Settings" })).toBeDefined();
  });

  it("renders all three tab buttons", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Branding" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "Notifications" })).toBeDefined();
    expect(screen.getByRole("tab", { name: "API Keys" })).toBeDefined();
  });

  it("shows Branding tab as selected by default", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tab", { name: "Branding" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tab", { name: "Notifications" }).getAttribute("aria-selected")).toBe("false");
  });

  it("renders tab panel with correct role", () => {
    render(<SettingsPage />);
    expect(screen.getByRole("tabpanel")).toBeDefined();
  });

  it("shows branding section by default", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Portal Branding")).toBeDefined();
    });
  });

  it("switches to Notifications tab on click", async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "Notifications" }));
    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
  });

  it("switches to API Keys tab on click", async () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("tab", { name: "API Keys" }));
    await waitFor(() => {
      expect(screen.getByText("Loading API keys...")).toBeDefined();
    });
  });

  it("respects initialTab prop", async () => {
    render(<SettingsPage initialTab="notifications" />);
    expect(screen.getByRole("tab", { name: "Notifications" }).getAttribute("aria-selected")).toBe("true");
    await waitFor(() => {
      expect(screen.getByText("Notification Preferences")).toBeDefined();
    });
  });

  it("has a container div with padding", () => {
    const { container } = render(<SettingsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.padding).toBe("2rem");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<SettingsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });
});

describe("SettingsPage: Branding tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("loads and displays tenant branding data", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      const nameInput = screen.getByDisplayValue("Acme Forwarding");
      expect(nameInput).toBeDefined();
    });
  });

  it("populates logo URL from tenant config", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("https://example.com/logo.png")).toBeDefined();
    });
  });

  it("populates custom domain from tenant config", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("track.acme.com")).toBeDefined();
    });
  });

  it("shows Save Branding button", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Save Branding")).toBeDefined();
    });
  });

  it("validates required company name", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const nameInput = screen.getByDisplayValue("Acme Forwarding");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Company name is required")).toBeDefined();
    });
  });

  it("validates invalid logo URL", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const logoInput = screen.getByLabelText("Logo URL");
    fireEvent.change(logoInput, { target: { value: "not-a-url" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Invalid URL format")).toBeDefined();
    });
  });

  it("validates invalid hex color", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const colorInput = screen.getByLabelText("Primary Color");
    fireEvent.change(colorInput, { target: { value: "red" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Must be a valid hex color (e.g. #2563EB)")).toBeDefined();
    });
  });

  it("validates invalid custom domain", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const domainInput = screen.getByLabelText("Custom Domain");
    fireEvent.change(domainInput, { target: { value: "invalid domain!" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Invalid domain format")).toBeDefined();
    });
  });

  it("saves branding on valid form submit", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Save Branding")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith("/api/tenants/current", expect.objectContaining({
        name: "Acme Forwarding",
      }));
    });
  });

  it("shows success message after save", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByText("Save Branding")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Settings saved")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    render(<SettingsPage />);
    expect(screen.getByText("Loading branding settings...")).toBeDefined();
  });

  it("clears field error when user types", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const nameInput = screen.getByDisplayValue("Acme Forwarding");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByText("Company name is required")).toBeDefined();
    });
    fireEvent.change(nameInput, { target: { value: "New Name" } });
    expect(screen.queryByText("Company name is required")).toBeNull();
  });

  it("marks invalid fields with aria-invalid", async () => {
    render(<SettingsPage />);
    await waitFor(() => {
      expect(screen.getByDisplayValue("Acme Forwarding")).toBeDefined();
    });
    const nameInput = screen.getByDisplayValue("Acme Forwarding");
    fireEvent.change(nameInput, { target: { value: "" } });
    fireEvent.click(screen.getByText("Save Branding"));
    await waitFor(() => {
      expect(screen.getByLabelText("Company Name").getAttribute("aria-invalid")).toBe("true");
    });
  });
});

describe("SettingsPage: Notifications tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      if (path === "/api/notifications/rules") return Promise.resolve(mockNotificationRules);
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("renders email toggle", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" })).toBeDefined();
    });
  });

  it("renders SMS toggle", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle SMS notifications" })).toBeDefined();
    });
  });

  it("shows email as enabled from tenant config", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" }).getAttribute("aria-checked")).toBe("true");
    });
  });

  it("shows SMS as disabled when channel is email only", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle SMS notifications" }).getAttribute("aria-checked")).toBe("false");
    });
  });

  it("toggles email off on click", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle email notifications" }));
    expect(screen.getByRole("switch", { name: "Toggle email notifications" }).getAttribute("aria-checked")).toBe("false");
  });

  it("shows warning when both channels disabled", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle email notifications" }));
    expect(screen.getByText("At least one notification channel must be enabled")).toBeDefined();
  });

  it("disables save when both channels off", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByRole("switch", { name: "Toggle email notifications" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("switch", { name: "Toggle email notifications" }));
    expect(screen.getByText("Save Preferences").closest("button")?.disabled).toBe(true);
  });

  it("saves notification preferences", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByText("Save Preferences")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Save Preferences"));
    await waitFor(() => {
      expect(apiClient.patch).toHaveBeenCalledWith("/api/tenants/current", expect.objectContaining({
        notificationChannel: "email",
      }));
    });
  });

  it("displays notification rules list", async () => {
    render(<SettingsPage initialTab="notifications" />);
    await waitFor(() => {
      expect(screen.getByText("Shipment Delivered")).toBeDefined();
    });
  });

  it("shows loading state initially", () => {
    render(<SettingsPage initialTab="notifications" />);
    expect(screen.getByText("Loading notification settings...")).toBeDefined();
  });
});

describe("SettingsPage: API Keys tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockImplementation((path: string) => {
      if (path === "/api/api-keys") return Promise.resolve(mockApiKeys);
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      return Promise.resolve({ success: true, data: [] });
    });
  });

  it("renders key name input", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Key name (e.g. Production)")).toBeDefined();
    });
  });

  it("renders Create Key button", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Create Key")).toBeDefined();
    });
  });

  it("displays existing API keys", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Production")).toBeDefined();
    });
  });

  it("renders Revoke button for each key", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeDefined();
    });
  });

  it("creates a new API key", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Create Key")).toBeDefined();
    });
    const input = screen.getByPlaceholderText("Key name (e.g. Production)");
    fireEvent.change(input, { target: { value: "Staging" } });
    fireEvent.click(screen.getByText("Create Key"));
    await waitFor(() => {
      expect(apiClient.post).toHaveBeenCalledWith("/api/api-keys", { name: "Staging" });
    });
  });

  it("shows new key value after creation", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Create Key")).toBeDefined();
    });
    const input = screen.getByPlaceholderText("Key name (e.g. Production)");
    fireEvent.change(input, { target: { value: "Staging" } });
    fireEvent.click(screen.getByText("Create Key"));
    await waitFor(() => {
      expect(screen.getByText(/New API key created/)).toBeDefined();
    });
  });

  it("disables Create Key when name is empty", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Create Key").closest("button")?.disabled).toBe(true);
    });
  });

  it("revokes an API key on click", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Revoke"));
    await waitFor(() => {
      expect(apiClient.delete).toHaveBeenCalledWith("/api/api-keys/key-1");
    });
  });

  it("shows loading state initially", () => {
    render(<SettingsPage initialTab="api-keys" />);
    expect(screen.getByText("Loading API keys...")).toBeDefined();
  });
});
