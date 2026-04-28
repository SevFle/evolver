import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  filterBlockedHeaders,
  isSuccessfulDelivery,
  deliverWebhook,
} from "@/server/services/delivery";

vi.mock("@/server/services/delivery", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/server/services/delivery")>();
  return {
    ...original,
    validateDeliveryUrl: vi.fn().mockResolvedValue(undefined),
  };
});

describe("delivery headers", () => {
  describe("filterBlockedHeaders", () => {
    it("removes Authorization header", () => {
      const result = filterBlockedHeaders({ Authorization: "Bearer token" });
      expect(result).toEqual({});
    });

    it("removes Host header", () => {
      const result = filterBlockedHeaders({ Host: "evil.com" });
      expect(result).toEqual({});
    });

    it("removes Cookie header", () => {
      const result = filterBlockedHeaders({ Cookie: "session=abc" });
      expect(result).toEqual({});
    });

    it("removes Set-Cookie header", () => {
      const result = filterBlockedHeaders({ "Set-Cookie": "session=abc" });
      expect(result).toEqual({});
    });

    it("removes proxy headers", () => {
      const result = filterBlockedHeaders({
        "Proxy-Authorization": "Basic x",
        "Proxy-Authenticate": "Basic",
      });
      expect(result).toEqual({});
    });

    it("removes WWW-Authenticate header", () => {
      const result = filterBlockedHeaders({ "WWW-Authenticate": "Basic" });
      expect(result).toEqual({});
    });

    it("removes X-Forwarded headers", () => {
      const result = filterBlockedHeaders({
        "X-Forwarded-For": "1.2.3.4",
        "X-Forwarded-Host": "evil.com",
        "X-Forwarded-Proto": "http",
      });
      expect(result).toEqual({});
    });

    it("preserves allowed custom headers", () => {
      const input = {
        "X-Custom-Header": "value",
        "X-Request-Id": "123",
        Accept: "application/json",
      };
      const result = filterBlockedHeaders(input);
      expect(result).toEqual(input);
    });

    it("handles case-insensitive matching", () => {
      const result = filterBlockedHeaders({
        authorization: "Bearer token",
        HOST: "evil.com",
        "x-forwarded-for": "1.2.3.4",
      });
      expect(result).toEqual({});
    });

    it("removes Content-Type from custom headers", () => {
      const result = filterBlockedHeaders({ "Content-Type": "text/plain" });
      expect(result).toEqual({});
    });

    it("removes X-HookRelay-Signature from custom headers", () => {
      const result = filterBlockedHeaders({ "X-HookRelay-Signature": "forged" });
      expect(result).toEqual({});
    });

    it("removes X-HookRelay-Event-ID from custom headers", () => {
      const result = filterBlockedHeaders({ "X-HookRelay-Event-ID": "forged" });
      expect(result).toEqual({});
    });

    it("removes security headers case-insensitively", () => {
      const result = filterBlockedHeaders({
        "content-type": "text/html",
        "x-HOOKRELAY-signature": "forged",
        "X-HOOKRELAY-EVENT-ID": "evil",
      });
      expect(result).toEqual({});
    });

    it("removes any X-HookRelay-* header (wildcard pattern)", () => {
      const result = filterBlockedHeaders({
        "X-HookRelay-Custom": "value",
        "X-HOOKRELAY-TRACE-ID": "123",
        "x-hookrelay-anything": "nope",
      });
      expect(result).toEqual({});
    });

    it("returns empty object for empty input", () => {
      expect(filterBlockedHeaders({})).toEqual({});
    });

    it("filters blocked but keeps allowed headers in mixed input", () => {
      const result = filterBlockedHeaders({
        Authorization: "Bearer token",
        "X-Custom": "keep",
        Host: "evil.com",
        Accept: "application/json",
      });
      expect(result).toEqual({
        "X-Custom": "keep",
        Accept: "application/json",
      });
    });
  });

  describe("deliverWebhook header ordering", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("security headers override custom headers with same name", async () => {
      const capturedHeaders: Record<string, string> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, opts: RequestInit) => {
          Object.assign(capturedHeaders, opts.headers as Record<string, string>);
          return new Response("ok", { status: 200 });
        }),
      );

      const { validateDeliveryUrl } = await import("@/server/services/delivery");
      (validateDeliveryUrl as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deliverWebhook(
        "https://example.com/hook",
        { test: true },
        "whsec_test",
        "evt_123",
        {
          "Content-Type": "text/plain",
          "X-HookRelay-Signature": "forged",
          "X-HookRelay-Event-ID": "forged",
          "X-Custom": "keep",
        },
      );

      expect(capturedHeaders["Content-Type"]).toBe("application/json");
      expect(capturedHeaders["X-HookRelay-Signature"]).not.toBe("forged");
      expect(capturedHeaders["X-HookRelay-Event-ID"]).toBe("evt_123");
      expect(capturedHeaders["X-Custom"]).toBe("keep");
    });

    it("blocked headers from custom headers are not sent", async () => {
      const capturedHeaders: Record<string, string> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, opts: RequestInit) => {
          Object.assign(capturedHeaders, opts.headers as Record<string, string>);
          return new Response("ok", { status: 200 });
        }),
      );

      const { validateDeliveryUrl } = await import("@/server/services/delivery");
      (validateDeliveryUrl as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deliverWebhook(
        "https://example.com/hook",
        { test: true },
        "whsec_test",
        "evt_123",
        {
          Authorization: "Bearer secret",
          Host: "evil.com",
          "X-Custom": "keep",
        },
      );

      expect(capturedHeaders).not.toHaveProperty("authorization");
      expect(capturedHeaders).not.toHaveProperty("Authorization");
      expect(capturedHeaders).not.toHaveProperty("host");
      expect(capturedHeaders).not.toHaveProperty("Host");
      expect(capturedHeaders["X-Custom"]).toBe("keep");
    });

    it("strips unknown X-HookRelay-* headers from custom headers", async () => {
      const capturedHeaders: Record<string, string> = {};
      vi.stubGlobal(
        "fetch",
        vi.fn(async (_url: string, opts: RequestInit) => {
          Object.assign(capturedHeaders, opts.headers as Record<string, string>);
          return new Response("ok", { status: 200 });
        }),
      );

      const { validateDeliveryUrl } = await import("@/server/services/delivery");
      (validateDeliveryUrl as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      await deliverWebhook(
        "https://example.com/hook",
        { test: true },
        "whsec_test",
        "evt_123",
        {
          "X-HookRelay-Injected": "malicious",
          "x-hookrelay-trace-id": "sneaky",
          "X-Custom": "keep",
        },
      );

      expect(capturedHeaders).not.toHaveProperty("X-HookRelay-Injected");
      expect(capturedHeaders).not.toHaveProperty("x-hookrelay-trace-id");
      expect(capturedHeaders["X-Custom"]).toBe("keep");
    });
  });
});
