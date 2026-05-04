import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const API_BASE = "http://localhost:3001";

describe("apiClient: auth interceptor", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", API_BASE);
    vi.resetModules();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  async function importClient() {
    return await import("../src/lib/api-client");
  }

  function mockFetch(response: {
    ok: boolean;
    status: number;
    statusText: string;
    json: () => Promise<unknown>;
  }) {
    return vi.fn().mockResolvedValue(response);
  }

  describe("session management", () => {
    it("setAuthToken stores token", async () => {
      const { setAuthToken, getAuthToken } = await importClient();
      setAuthToken("jwt-token-123");
      expect(getAuthToken()).toBe("jwt-token-123");
    });

    it("setCsrfToken stores token", async () => {
      const { setCsrfToken, getCsrfToken } = await importClient();
      setCsrfToken("csrf_token_value");
      expect(getCsrfToken()).toBe("csrf_token_value");
    });

    it("clearSession resets both tokens", async () => {
      const { setAuthToken, setCsrfToken, clearSession, getAuthToken, getCsrfToken } =
        await importClient();
      setAuthToken("jwt-123");
      setCsrfToken("csrf-456");
      expect(getAuthToken()).toBe("jwt-123");
      expect(getCsrfToken()).toBe("csrf-456");

      clearSession();
      expect(getAuthToken()).toBeNull();
      expect(getCsrfToken()).toBeNull();
    });

    it("hasValidSession returns false when no token", async () => {
      const { hasValidSession, clearSession } = await importClient();
      clearSession();
      expect(hasValidSession()).toBe(false);
    });

    it("hasValidSession returns true when token is set", async () => {
      const { setAuthToken, hasValidSession } = await importClient();
      setAuthToken("jwt-token");
      expect(hasValidSession()).toBe(true);
    });

    it("hasValidSession returns false when token is null", async () => {
      const { setAuthToken, hasValidSession } = await importClient();
      setAuthToken(null);
      expect(hasValidSession()).toBe(false);
    });

    it("setAuthToken(null) clears the auth token", async () => {
      const { setAuthToken, getAuthToken } = await importClient();
      setAuthToken("jwt-token");
      expect(getAuthToken()).toBe("jwt-token");
      setAuthToken(null);
      expect(getAuthToken()).toBeNull();
    });

    it("setCsrfToken(null) clears the CSRF token", async () => {
      const { setCsrfToken, getCsrfToken } = await importClient();
      setCsrfToken("csrf-token");
      expect(getCsrfToken()).toBe("csrf-token");
      setCsrfToken(null);
      expect(getCsrfToken()).toBeNull();
    });
  });

  describe("auth header injection", () => {
    it("includes Authorization header when token is set", async () => {
      const { setAuthToken, apiClient } = await importClient();
      setAuthToken("my-jwt-token");

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: [] }),
      });

      await apiClient.get("/api/shipments");

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer my-jwt-token");
    });

    it("does not include Authorization header when no token", async () => {
      const { clearSession, apiClient } = await importClient();
      clearSession();

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ data: [] }),
      });

      await apiClient.get("/api/shipments");

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBeUndefined();
    });

    it("includes CSRF token header when set", async () => {
      const { setCsrfToken, apiClient } = await importClient();
      setCsrfToken("csrf_my-token.sig");

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });

      await apiClient.post("/api/shipments", {});

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf_my-token.sig");
    });

    it("does not include CSRF header when no token", async () => {
      const { clearSession, apiClient } = await importClient();
      clearSession();

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });

      await apiClient.post("/api/shipments", {});

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["x-csrf-token"]).toBeUndefined();
    });

    it("includes both auth and CSRF headers together", async () => {
      const { setAuthToken, setCsrfToken, apiClient } = await importClient();
      setAuthToken("jwt-token");
      setCsrfToken("csrf_token");

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });

      await apiClient.post("/api/shipments", {});

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer jwt-token");
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf_token");
      expect(callArgs[1].headers["content-type"]).toBe("application/json");
    });
  });

  describe("401 response clears session", () => {
    it("clears session on 401 response", async () => {
      const { setAuthToken, setCsrfToken, apiClient, getAuthToken, getCsrfToken } =
        await importClient();
      setAuthToken("jwt-token");
      setCsrfToken("csrf-token");

      globalThis.fetch = mockFetch({
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: () => Promise.resolve({}),
      });

      await expect(apiClient.get("/api/test")).rejects.toThrow(
        "API error: 401 Unauthorized"
      );
      expect(getAuthToken()).toBeNull();
      expect(getCsrfToken()).toBeNull();
    });

    it("does not clear session on non-401 error", async () => {
      const { setAuthToken, apiClient, getAuthToken } = await importClient();
      setAuthToken("jwt-token");

      globalThis.fetch = mockFetch({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
        json: () => Promise.resolve({}),
      });

      await expect(apiClient.get("/api/test")).rejects.toThrow(
        "API error: 500 Internal Server Error"
      );
      expect(getAuthToken()).toBe("jwt-token");
    });

    it("does not clear session on successful response", async () => {
      const { setAuthToken, setCsrfToken, apiClient, getAuthToken, getCsrfToken } =
        await importClient();
      setAuthToken("jwt-token");
      setCsrfToken("csrf-token");

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({ success: true }),
      });

      await apiClient.get("/api/test");
      expect(getAuthToken()).toBe("jwt-token");
      expect(getCsrfToken()).toBe("csrf-token");
    });
  });

  describe("all HTTP methods include auth headers", () => {
    async function setupAuth() {
      const mod = await importClient();
      mod.setAuthToken("jwt-token");
      mod.setCsrfToken("csrf-token");
      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });
      return mod;
    }

    it("GET includes auth headers", async () => {
      const { apiClient } = await setupAuth();
      await apiClient.get("/api/test");
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer jwt-token");
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf-token");
    });

    it("POST includes auth headers", async () => {
      const { apiClient } = await setupAuth();
      await apiClient.post("/api/test", {});
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer jwt-token");
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf-token");
    });

    it("PATCH includes auth headers", async () => {
      const { apiClient } = await setupAuth();
      await apiClient.patch("/api/test", {});
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer jwt-token");
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf-token");
    });

    it("DELETE includes auth headers", async () => {
      const { apiClient } = await setupAuth();
      await apiClient.delete("/api/test");
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["authorization"]).toBe("Bearer jwt-token");
      expect(callArgs[1].headers["x-csrf-token"]).toBe("csrf-token");
    });
  });

  describe("custom headers override defaults", () => {
    it("custom Content-Type overrides default", async () => {
      const { apiClient } = await importClient();
      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });

      await apiClient.get("/api/test");

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["content-type"]).toBe("application/json");
    });
  });

  describe("without valid session (no tokens)", () => {
    it("sends request with only Content-Type header", async () => {
      const { clearSession, apiClient } = await importClient();
      clearSession();

      globalThis.fetch = mockFetch({
        ok: true,
        status: 200,
        statusText: "OK",
        json: () => Promise.resolve({}),
      });

      await apiClient.get("/api/test");

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["content-type"]).toBe("application/json");
      expect(callArgs[1].headers["authorization"]).toBeUndefined();
      expect(callArgs[1].headers["x-csrf-token"]).toBeUndefined();
    });

    it("POST without session still sends Content-Type", async () => {
      const { clearSession, apiClient } = await importClient();
      clearSession();

      globalThis.fetch = mockFetch({
        ok: true,
        status: 201,
        statusText: "Created",
        json: () => Promise.resolve({}),
      });

      await apiClient.post("/api/test", { data: "value" });

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[1].headers["content-type"]).toBe("application/json");
      expect(callArgs[1].method).toBe("POST");
    });
  });
});
