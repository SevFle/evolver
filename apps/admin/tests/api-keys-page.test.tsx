import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SettingsPage } from "../src/components/SettingsPage";

const mockApiKeys = {
  success: true,
  data: [
    { id: "key-1", name: "Production", prefix: "sl_prod_", createdAt: "2025-01-15T00:00:00Z" },
  ],
};

const mockTenantConfig = {
  success: true,
  data: {
    id: "tenant-1",
    name: "Acme Forwarding",
    slug: "acme",
    notificationChannel: "email",
  },
};

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: vi.fn().mockImplementation((path: string) => {
      if (path === "/api/api-keys") return Promise.resolve(mockApiKeys);
      if (path === "/api/tenants/current") return Promise.resolve(mockTenantConfig);
      return Promise.resolve({ success: true, data: [] });
    }),
    post: vi.fn().mockResolvedValue({ success: true, key: "sl_new_key_abc123" }),
    patch: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true, message: "API key revoked" }),
  },
}));

describe("ApiKeysPage (via SettingsPage)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the Tenant Settings heading", () => {
    render(<SettingsPage initialTab="api-keys" />);
    expect(screen.getByRole("heading", { level: 1, name: "Tenant Settings" })).toBeDefined();
  });

  it("shows API Keys tab as active", () => {
    render(<SettingsPage initialTab="api-keys" />);
    expect(screen.getByRole("tab", { name: "API Keys" }).getAttribute("aria-selected")).toBe("true");
  });

  it("renders Create Key button after loading", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Create Key")).toBeDefined();
    });
  });

  it("renders API key name input", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByPlaceholderText("Key name (e.g. Production)")).toBeDefined();
    });
  });

  it("displays existing API keys from the API", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Production")).toBeDefined();
    });
  });

  it("renders Revoke buttons for each key", async () => {
    render(<SettingsPage initialTab="api-keys" />);
    await waitFor(() => {
      expect(screen.getByText("Revoke")).toBeDefined();
    });
  });

  it("has a container div with padding", () => {
    const { container } = render(<SettingsPage initialTab="api-keys" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.padding).toBe("2rem");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<SettingsPage initialTab="api-keys" />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("snapshot matches", () => {
    const { container } = render(<SettingsPage initialTab="api-keys" />);
    expect(container).toMatchSnapshot();
  });
});
