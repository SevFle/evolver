import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/server/services/ssrf", () => ({
  validateDeliveryUrl: vi.fn().mockResolvedValue(undefined),
  isPrivateIpv4: vi.fn(),
  isPrivateIpv6: vi.fn(),
  SsrfValidationError: class extends Error {},
}));

import { deliverWebhook, isSuccessfulDelivery, filterBlockedHeaders } from "@/server/services/delivery";
import { signPayload } from "@/server/services/signing";

describe("deliverWebhook", () => {
  let capturedOpts: RequestInit;
  let capturedUrl: string;

  beforeEach(() => {
    capturedOpts = {} as RequestInit;
    capturedUrl = "";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, opts: RequestInit) => {
        capturedUrl = url;
        capturedOpts = opts;
        return new Response('{"ok": true}', {
          status: 200,
          headers: { "x-response-id": "resp-123" },
        });
      }),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends POST request to the target URL", async () => {
    await deliverWebhook(
      "https://example.com/webhook",
      { event: "test" },
      "whsec_test",
      "evt-001",
    );

    expect(capturedUrl).toBe("https://example.com/webhook");
    expect(capturedOpts.method).toBe("POST");
  });

  it("sends the payload as JSON body", async () => {
    const payload = { amount: 5000, currency: "usd" };
    await deliverWebhook(
      "https://example.com/webhook",
      payload,
      "whsec_test",
      "evt-001",
    );

    expect(capturedOpts.body).toBe(JSON.stringify(payload));
  });

  it("sets Content-Type to application/json", async () => {
    const headers = await getDeliveryHeaders("whsec_test", "evt-001");

    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("includes X-HookRelay-Event-ID header", async () => {
    const headers = await getDeliveryHeaders("whsec_test", "evt-abc-123");

    expect(headers["X-HookRelay-Event-ID"]).toBe("evt-abc-123");
  });

  it("includes X-HookRelay-Signature header with valid HMAC", async () => {
    const secret = "whsec_mysecret";
    const eventId = "evt-001";
    const headers = await getDeliveryHeaders(secret, eventId);

    const sig = headers["X-HookRelay-Signature"]!;
    expect(sig).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);

    const payload = JSON.stringify({ event: "test" });
    const ts = expectTimestamp(sig);
    expect(ts).toBeGreaterThan(0);
    expect(signPayload(payload, secret, ts)).toBe(sig);
  });

  it("uses current Unix timestamp in signature", async () => {
    const before = Math.floor(Date.now() / 1000);
    const headers = await getDeliveryHeaders("whsec_test", "evt-001");
    const after = Math.floor(Date.now() / 1000);

    const sig = headers["X-HookRelay-Signature"]!;
    const ts = expectTimestamp(sig);
    expect(ts).toBeGreaterThanOrEqual(before);
    expect(ts).toBeLessThanOrEqual(after);
  });

  it("signs the JSON-serialized payload with HMAC-SHA256", async () => {
    const secret = "whsec_signcheck";
    const payload = { data: "value" };
    await deliverWebhook("https://example.com/hook", payload, secret, "evt-1");

    const body = capturedOpts.body as string;
    const sig = (capturedOpts.headers as Record<string, string>)["X-HookRelay-Signature"]!;
    const ts = expectTimestamp(sig);

    const expectedHash = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");

    expect(sig).toBe(`t=${ts},v1=${expectedHash}`);
  });

  it("returns status code from response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502 })),
    );

    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(result.statusCode).toBe(502);
    expect(result.responseBody).toBe("Bad Gateway");
  });

  it("captures response headers", async () => {
    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(result.responseHeaders["x-response-id"]).toBe("resp-123");
  });

  it("measures and returns durationMs", async () => {
    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(typeof result.durationMs).toBe("number");
  });

  it("returns request headers that were sent", async () => {
    const result = await deliverWebhook(
      "https://example.com/hook",
      { test: true },
      "whsec_test",
      "evt-001",
    );

    expect(result.requestHeaders["Content-Type"]).toBe("application/json");
    expect(result.requestHeaders["X-HookRelay-Event-ID"]).toBe("evt-001");
    expect(result.requestHeaders["X-HookRelay-Signature"]).toBeDefined();
  });

  it("filters blocked headers from custom headers", async () => {
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
      {
        Authorization: "Bearer evil",
        Host: "evil.com",
        "X-Custom": "keep-me",
      },
    );

    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["Authorization"]).toBeUndefined();
    expect(headers["Host"]).toBeUndefined();
    expect(headers["X-Custom"]).toBe("keep-me");
  });

  it("includes filtered custom headers alongside security headers", async () => {
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
      {
        "X-Api-Version": "2024-01",
        Accept: "application/json",
      },
    );

    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["X-Api-Version"]).toBe("2024-01");
    expect(headers["Accept"]).toBe("application/json");
    expect(headers["X-HookRelay-Signature"]).toBeDefined();
    expect(headers["X-HookRelay-Event-ID"]).toBe("evt-001");
  });

  it("overrides Content-Type even if provided in custom headers", async () => {
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
      { "Content-Type": "text/plain" },
    );

    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("works without custom headers", async () => {
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(headers["X-HookRelay-Signature"]).toBeDefined();
    expect(headers["X-HookRelay-Event-ID"]).toBe("evt-001");
  });

  it("works with null custom headers", async () => {
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
      null,
    );

    const headers = capturedOpts.headers as Record<string, string>;
    expect(headers["X-HookRelay-Signature"]).toBeDefined();
  });

  it("calls validateDeliveryUrl before making request", async () => {
    const { validateDeliveryUrl } = await import("@/server/services/ssrf");
    await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(validateDeliveryUrl).toHaveBeenCalledWith("https://example.com/hook");
  });

  it("propagates SSRF validation errors", async () => {
    const { SsrfValidationError } = await import("@/server/services/ssrf");
    const { validateDeliveryUrl } = await import("@/server/services/ssrf");
    vi.mocked(validateDeliveryUrl).mockRejectedValueOnce(
      new SsrfValidationError("Blocked"),
    );

    await expect(
      deliverWebhook("https://evil.com/hook", {}, "whsec_test", "evt-001"),
    ).rejects.toThrow("Blocked");
  });

  it("propagates fetch errors (network timeout)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("fetch failed");
      }),
    );

    await expect(
      deliverWebhook("https://example.com/hook", {}, "whsec_test", "evt-001"),
    ).rejects.toThrow("fetch failed");
  });

  it("handles 200 response as successful delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("OK", { status: 200 })),
    );

    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(isSuccessfulDelivery(result.statusCode)).toBe(true);
  });

  it("handles 500 response as failed delivery", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Error", { status: 500 })),
    );

    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(isSuccessfulDelivery(result.statusCode)).toBe(false);
  });

  it("handles 301 redirect response as non-success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://other.com" } })),
    );

    const result = await deliverWebhook(
      "https://example.com/hook",
      {},
      "whsec_test",
      "evt-001",
    );

    expect(isSuccessfulDelivery(result.statusCode)).toBe(false);
  });

  it("signature is deterministic for same inputs (idempotency)", async () => {
    const secret = "whsec_idem";
    const payload = { id: "test-123" };
    const eventId = "evt-idem";

    const result1 = await deliverWebhook(
      "https://example.com/hook", payload, secret, eventId,
    );
    const sig1 = result1.requestHeaders["X-HookRelay-Signature"];

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("OK", { status: 200 })),
    );

    const result2 = await deliverWebhook(
      "https://example.com/hook", payload, secret, eventId,
    );
    const sig2 = result2.requestHeaders["X-HookRelay-Signature"];

    expect(sig1).toBe(sig2);
  });

  async function getDeliveryHeaders(secret: string, eventId: string): Promise<Record<string, string>> {
    await deliverWebhook(
      "https://example.com/webhook",
      { event: "test" },
      secret,
      eventId,
    );
    return capturedOpts.headers as Record<string, string>;
  }

  function expectTimestamp(sig: string): number {
    const match = sig.match(/^t=(\d+),/);
    if (!match) throw new Error(`No timestamp in signature: ${sig}`);
    return Number(match[1]);
  }
});

describe("isSuccessfulDelivery", () => {
  it("returns true for all 2xx status codes", () => {
    for (let code = 200; code <= 299; code++) {
      expect(isSuccessfulDelivery(code)).toBe(true);
    }
  });

  it("returns false for 1xx informational", () => {
    expect(isSuccessfulDelivery(100)).toBe(false);
    expect(isSuccessfulDelivery(199)).toBe(false);
  });

  it("returns false for 3xx redirection", () => {
    expect(isSuccessfulDelivery(301)).toBe(false);
    expect(isSuccessfulDelivery(302)).toBe(false);
  });

  it("returns false for 4xx client errors", () => {
    expect(isSuccessfulDelivery(400)).toBe(false);
    expect(isSuccessfulDelivery(401)).toBe(false);
    expect(isSuccessfulDelivery(403)).toBe(false);
    expect(isSuccessfulDelivery(404)).toBe(false);
    expect(isSuccessfulDelivery(422)).toBe(false);
    expect(isSuccessfulDelivery(429)).toBe(false);
  });

  it("returns false for 5xx server errors", () => {
    expect(isSuccessfulDelivery(500)).toBe(false);
    expect(isSuccessfulDelivery(502)).toBe(false);
    expect(isSuccessfulDelivery(503)).toBe(false);
    expect(isSuccessfulDelivery(504)).toBe(false);
  });
});

describe("filterBlockedHeaders", () => {
  it("removes all security-sensitive headers", () => {
    const result = filterBlockedHeaders({
      Authorization: "Bearer x",
      Host: "evil.com",
      Cookie: "session=abc",
      "Set-Cookie": "evil=1",
      "Proxy-Authorization": "Basic x",
      "Proxy-Authenticate": "Basic",
      "WWW-Authenticate": "Bearer",
      "X-Forwarded-For": "1.2.3.4",
      "X-Forwarded-Host": "evil",
      "X-Forwarded-Proto": "http",
      "Content-Type": "text/plain",
      "X-HookRelay-Signature": "forged",
      "X-HookRelay-Event-ID": "forged",
    });

    expect(result).toEqual({});
  });

  it("removes any X-HookRelay-* prefix header case-insensitively", () => {
    const result = filterBlockedHeaders({
      "x-hookrelay-custom": "nope",
      "X-HOOKRELAY-TRACE": "nope",
      "X-HookRelay-Anything-At-All": "nope",
    });

    expect(result).toEqual({});
  });

  it("preserves non-blocked headers", () => {
    const input = {
      "X-Request-Id": "abc-123",
      Accept: "application/json",
      "X-Custom-Header": "custom-value",
      "Traceparent": "00-abc-123-01",
    };

    expect(filterBlockedHeaders(input)).toEqual(input);
  });

  it("is case-insensitive for blocked header matching", () => {
    const result = filterBlockedHeaders({
      authorization: "Bearer x",
      host: "evil.com",
      cookie: "session=1",
      "content-type": "text/html",
      "x-forwarded-for": "1.2.3.4",
    });

    expect(result).toEqual({});
  });

  it("returns empty object for empty input", () => {
    expect(filterBlockedHeaders({})).toEqual({});
  });
});
