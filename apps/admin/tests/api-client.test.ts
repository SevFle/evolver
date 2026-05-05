import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const API_BASE = "http://localhost:3001";

describe("apiClient", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function getApiClient() {
    const { apiClient } = await import("../src/lib/api-client");
    return apiClient;
  }

  function mockFetch(response: { ok: boolean; status: number; statusText: string; json: () => Promise<unknown> }) {
    return vi.fn().mockResolvedValue(response);
  }

  it("GET sends request and returns parsed JSON", async () => {
    const data = { success: true, data: [] };
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(data),
    });

    const client = await getApiClient();
    const result = await client.get("/api/shipments");

    expect(result).toEqual(data);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/shipments`,
      expect.objectContaining({ method: "GET" })
    );
  });

  it("POST sends request with JSON body", async () => {
    const responseBody = { success: true };
    globalThis.fetch = mockFetch({
      ok: true,
      status: 201,
      statusText: "Created",
      json: () => Promise.resolve(responseBody),
    });

    const client = await getApiClient();
    const result = await client.post("/api/shipments", { trackingId: "SL-123" });

    expect(result).toEqual(responseBody);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/shipments`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ trackingId: "SL-123" }),
      })
    );
  });

  it("PATCH sends request with JSON body", async () => {
    const responseBody = { success: true };
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(responseBody),
    });

    const client = await getApiClient();
    const result = await client.patch("/api/tenants/current", { name: "Updated" });

    expect(result).toEqual(responseBody);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/tenants/current`,
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Updated" }),
      })
    );
  });

  it("DELETE sends request without body", async () => {
    const responseBody = { success: true };
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve(responseBody),
    });

    const client = await getApiClient();
    const result = await client.delete("/api/api-keys/key-123");

    expect(result).toEqual(responseBody);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/api/api-keys/key-123`,
      expect.objectContaining({ method: "DELETE" })
    );
  });

  it("includes Content-Type header", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ "content-type": "application/json" }),
      })
    );
  });

  it("throws on non-ok response", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.get("/api/shipments")).rejects.toThrow("API error: 500 Internal Server Error");
  });

  it("throws on 404 response", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.get("/api/unknown")).rejects.toThrow("API error: 404 Not Found");
  });

  it("throws on 401 response", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.get("/api/protected")).rejects.toThrow("API error: 401 Unauthorized");
  });

  it("POST without body sends undefined body", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 201,
      statusText: "Created",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.post("/api/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify(undefined),
      })
    );
  });

  it("uses NEXT_PUBLIC_API_URL from environment", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "https://api.custom.com");
    vi.resetModules();

    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://api.custom.com/test",
      expect.anything()
    );
  });

  it("merges custom headers from options", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const { apiClient: freshClient } = await import("../src/lib/api-client");
    await freshClient.get("/test", { headers: { "X-Custom": "value" } });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-custom"]).toBe("value");
  });

  it("clears session on 401", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: () => Promise.resolve({}),
    });

    const { apiClient: freshClient, setAuthToken, getAuthToken } = await import("../src/lib/api-client");
    setAuthToken("test-token");
    expect(getAuthToken()).toBe("test-token");

    await freshClient.get("/test").catch(() => {});
    expect(getAuthToken()).toBeNull();
  });
});
