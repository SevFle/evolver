import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const API_BASE = "http://localhost:3001";

describe("apiClient: auth token injection", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.resetModules();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    localStorage.clear();
  });

  async function getApiClient() {
    const { apiClient } = await import("../src/lib/api-client");
    return apiClient;
  }

  function mockFetch(response: {
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
  }) {
    return vi.fn().mockResolvedValue(response);
  }

  it("includes Authorization header when token is stored", async () => {
    const fakeToken = "header." + btoa(JSON.stringify({ tenantId: "t-1" })) + ".sig";
    localStorage.setItem("shiplens_auth_token", fakeToken);

    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/test`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${fakeToken}`,
        }),
      })
    );
  });

  it("does not include Authorization header when no token stored", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("handles localStorage error gracefully", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("Security error");
    });

    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const headers = callArgs[1].headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
  });

  it("includes token in POST requests", async () => {
    const fakeToken = "header." + btoa(JSON.stringify({ tenantId: "t-2" })) + ".sig";
    localStorage.setItem("shiplens_auth_token", fakeToken);

    globalThis.fetch = mockFetch({
      ok: true,
      status: 201,
      statusText: "Created",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.post("/test", { data: true });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      `${API_BASE}/test`,
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${fakeToken}`,
        }),
      })
    );
  });
});
