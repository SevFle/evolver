import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const API_BASE = "http://localhost:3001";

describe("apiClient: edge cases", () => {
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

  function mockFetch(response: {
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
  }) {
    return vi.fn().mockResolvedValue(response);
  }

  it("merges custom headers with Content-Type", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.get("/test", {
      headers: { "X-Custom-Header": "custom-value" },
    });

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[1].headers["content-type"]).toBe("application/json");
    expect(callArgs[1].headers["x-custom-header"]).toBe("custom-value");
  });

  it("PATCH with no body sends undefined", async () => {
    globalThis.fetch = mockFetch({
      ok: true,
      status: 200,
      statusText: "OK",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await client.patch("/api/tenants/current");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[1].body).toBe(JSON.stringify(undefined));
  });

  it("throws descriptive error on 403", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 403,
      statusText: "Forbidden",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.get("/api/protected")).rejects.toThrow(
      "API error: 403 Forbidden"
    );
  });

  it("throws descriptive error on 422", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.post("/api/test", {})).rejects.toThrow(
      "API error: 422 Unprocessable Entity"
    );
  });

  it("throws descriptive error on 500", async () => {
    globalThis.fetch = mockFetch({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    const client = await getApiClient();
    await expect(client.delete("/api/test")).rejects.toThrow(
      "API error: 500 Internal Server Error"
    );
  });

  it("POST with complex nested body serializes correctly", async () => {
    const body = {
      trackingId: "SL-1",
      metadata: { nested: { deep: true } },
      tags: ["a", "b"],
    };
    globalThis.fetch = mockFetch({
      ok: true,
      status: 201,
      statusText: "Created",
      json: () => Promise.resolve({ success: true }),
    });

    const client = await getApiClient();
    await client.post("/api/shipments", body);

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(JSON.parse(callArgs[1].body)).toEqual(body);
  });

  it("handles network failure gracefully", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const client = await getApiClient();
    await expect(client.get("/api/test")).rejects.toThrow("Failed to fetch");
  });

  it("uses default URL when NEXT_PUBLIC_API_URL not set", async () => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", undefined);
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
      "http://localhost:3001/test",
      expect.anything()
    );
  });
});
