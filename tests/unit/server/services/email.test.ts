import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  markSent,
  resetRateLimits,
  clearAlertRateLimit,
  composeFailureAlertEmail,
  sendFailureAlert,
  sendEmail,
  type AlertPayload,
} from "@/server/services/email";

const mockRedis = {
  set: vi.fn().mockResolvedValue("OK"),
  scan: vi.fn().mockResolvedValue(["0", []]),
  del: vi.fn().mockResolvedValue(0),
};

vi.mock("@/server/redis", () => ({
  getRedis: () => mockRedis,
}));

const baseAlert: AlertPayload = {
  endpointId: "ep-001",
  endpointName: "Stripe Handler",
  endpointUrl: "https://example.com/webhooks/stripe",
  failureCount: 5,
  lastErrorMessage: "Connection refused",
  dashboardUrl: "http://localhost:3000/dashboard/endpoints/ep-001",
  userEmail: "dev@example.com",
};

describe("email service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRedis.set.mockResolvedValue("OK");
    mockRedis.scan.mockResolvedValue(["0", []]);
    mockRedis.del.mockResolvedValue(0);
  });

  describe("rate limiting via markSent atomic gate", () => {
    it("markSent sets Redis key with correct TTL and NX flag", async () => {
      await markSent("ep-001");
      expect(mockRedis.set).toHaveBeenCalledWith(
        "hookrelay:alert:ep-001",
        "1",
        "EX",
        3600,
        "NX",
      );
    });

    it("markSent returns OK on first call (key not set)", async () => {
      mockRedis.set.mockResolvedValueOnce("OK");
      const result = await markSent("ep-001");
      expect(result).toBe("OK");
    });

    it("markSent returns null when key already exists (rate-limited)", async () => {
      mockRedis.set.mockResolvedValueOnce("OK");
      mockRedis.set.mockResolvedValueOnce(null);

      const first = await markSent("ep-001");
      expect(first).toBe("OK");

      const second = await markSent("ep-001");
      expect(second).toBeNull();
    });

    it("markSent gates alerts independently per endpoint", async () => {
      mockRedis.set.mockImplementation(async (_key: string) => "OK");
      const result1 = await markSent("ep-001");
      expect(result1).toBe("OK");

      const result2 = await markSent("ep-002");
      expect(result2).toBe("OK");
    });

    it("resetRateLimits batches deletes inside the SCAN loop per page", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["1", ["hookrelay:alert:ep-001"]])
        .mockResolvedValueOnce(["0", ["hookrelay:alert:ep-002"]]);
      await resetRateLimits();
      expect(mockRedis.scan).toHaveBeenCalledWith("0", "MATCH", "hookrelay:alert:*", "COUNT", 100);
      expect(mockRedis.scan).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenNthCalledWith(1, "hookrelay:alert:ep-001");
      expect(mockRedis.del).toHaveBeenNthCalledWith(2, "hookrelay:alert:ep-002");
    });

    it("resetRateLimits deletes each SCAN batch immediately", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["1", ["hookrelay:alert:ep-a", "hookrelay:alert:ep-b"]])
        .mockResolvedValueOnce(["2", ["hookrelay:alert:ep-c"]])
        .mockResolvedValueOnce(["0", []]);
      await resetRateLimits();
      expect(mockRedis.del).toHaveBeenCalledTimes(2);
      expect(mockRedis.del).toHaveBeenNthCalledWith(1, "hookrelay:alert:ep-a", "hookrelay:alert:ep-b");
      expect(mockRedis.del).toHaveBeenNthCalledWith(2, "hookrelay:alert:ep-c");
    });

    it("resetRateLimits does nothing when no keys exist", async () => {
      mockRedis.scan.mockResolvedValue(["0", []]);
      await resetRateLimits();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });

    it("resetRateLimits handles single-page SCAN result", async () => {
      mockRedis.scan.mockResolvedValueOnce(["0", ["hookrelay:alert:ep-001"]]);
      await resetRateLimits();
      expect(mockRedis.scan).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith("hookrelay:alert:ep-001");
    });

    it("resetRateLimits skips del when SCAN returns empty batch with non-zero cursor", async () => {
      mockRedis.scan
        .mockResolvedValueOnce(["1", []])
        .mockResolvedValueOnce(["0", ["hookrelay:alert:ep-001"]]);
      await resetRateLimits();
      expect(mockRedis.del).toHaveBeenCalledTimes(1);
      expect(mockRedis.del).toHaveBeenCalledWith("hookrelay:alert:ep-001");
    });

    it("clearAlertRateLimit deletes the rate limit key for an endpoint", async () => {
      await clearAlertRateLimit("ep-001");
      expect(mockRedis.del).toHaveBeenCalledWith("hookrelay:alert:ep-001");
    });
  });

  describe("composeFailureAlertEmail", () => {
    it("includes the endpoint name in the subject", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.subject).toContain("Stripe Handler");
    });

    it("includes the failure count in the subject", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.subject).toContain("5 consecutive failures");
    });

    it("addresses the email to the user", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.to).toBe("dev@example.com");
    });

    it("uses the EMAIL_FROM env var when set", () => {
      const original = process.env.EMAIL_FROM;
      process.env.EMAIL_FROM = "custom@example.com";
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.from).toBe("custom@example.com");
      process.env.EMAIL_FROM = original;
    });

    it("includes the endpoint URL in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("https://example.com/webhooks/stripe");
    });

    it("includes the failure count in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("Consecutive Failures: 5");
    });

    it("includes the last error message in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("Connection refused");
    });

    it("shows N/A when no error message", () => {
      const alert = { ...baseAlert, lastErrorMessage: null };
      const email = composeFailureAlertEmail(alert);
      expect(email.text).toContain("Last Error: N/A");
    });

    it("includes the dashboard URL in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("http://localhost:3000/dashboard/endpoints/ep-001");
    });

    it("includes the rate-limit notice in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("one alert per endpoint per hour");
    });

    it("includes degraded status notice in the text body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.text).toContain("degraded");
    });

    it("generates an HTML body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.html).toContain("<div");
      expect(email.html).toContain("Delivery Alert");
    });

    it("escapes HTML in user-provided fields", () => {
      const alert: AlertPayload = {
        ...baseAlert,
        endpointName: '<script>alert("xss")</script>',
        lastErrorMessage: 'err "bad" <value>',
      };
      const email = composeFailureAlertEmail(alert);
      expect(email.html).not.toContain("<script>");
      expect(email.html).toContain("&lt;script&gt;");
      expect(email.html).toContain("&quot;bad&quot;");
    });

    it("escapes single quotes in HTML output", () => {
      const alert: AlertPayload = {
        ...baseAlert,
        endpointName: "O'Brien's endpoint",
        lastErrorMessage: "error: it's broken",
      };
      const email = composeFailureAlertEmail(alert);
      expect(email.html).toContain("O&#x27;Brien&#x27;s endpoint");
      expect(email.html).toContain("it&#x27;s broken");
    });

    it("escapes HTML in endpoint URL field", () => {
      const alert: AlertPayload = {
        ...baseAlert,
        endpointUrl: 'https://evil.com/<img src=x onerror="alert(1)">',
      };
      const email = composeFailureAlertEmail(alert);
      expect(email.html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
    });

    it("escapes HTML in dashboard URL field", () => {
      const alert: AlertPayload = {
        ...baseAlert,
        dashboardUrl: 'http://app.com/<script>"hack"</script>',
      };
      const email = composeFailureAlertEmail(alert);
      expect(email.html).toContain("&lt;script&gt;");
      expect(email.html).toContain("&quot;hack&quot;");
    });

    it("escapes failureCount in HTML body", () => {
      const email = composeFailureAlertEmail(baseAlert);
      expect(email.html).toContain(">5 consecutive<");
    });
  });

  describe("sendFailureAlert", () => {
    it("sends when threshold is met", async () => {
      const result = await sendFailureAlert(baseAlert);
      expect(result.success).toBe(true);
    });

    it("returns failure when email provider fails", async () => {
      const original = process.env.EMAIL_PROVIDER;
      const originalKey = process.env.RESEND_API_KEY;
      process.env.EMAIL_PROVIDER = "resend";
      delete process.env.RESEND_API_KEY;
      const result = await sendFailureAlert(baseAlert);
      expect(result.success).toBe(false);
      process.env.EMAIL_PROVIDER = original;
      if (originalKey) process.env.RESEND_API_KEY = originalKey;
      else delete process.env.RESEND_API_KEY;
    });

    it("skips when failure count is below threshold", async () => {
      const alert = { ...baseAlert, failureCount: 3 };
      const result = await sendFailureAlert(alert);
      expect(result.success).toBe(false);
      expect(result.provider).toBe("skipped");
    });

    it("does not call markSent (rate limiting handled by caller)", async () => {
      await sendFailureAlert(baseAlert);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it("allows sending for different endpoints independently", async () => {
      const result1 = await sendFailureAlert(baseAlert);
      expect(result1.success).toBe(true);

      const alert2: AlertPayload = { ...baseAlert, endpointId: "ep-002" };
      const result2 = await sendFailureAlert(alert2);
      expect(result2.success).toBe(true);
    });

    it("sends successfully even when called twice for same endpoint (rate limiting is callers responsibility)", async () => {
      const first = await sendFailureAlert(baseAlert);
      expect(first.success).toBe(true);

      const second = await sendFailureAlert(baseAlert);
      expect(second.success).toBe(true);
    });
  });

  describe("sendEmail", () => {
    it("uses log provider by default", async () => {
      const original = process.env.EMAIL_PROVIDER;
      delete process.env.EMAIL_PROVIDER;
      const email = composeFailureAlertEmail(baseAlert);
      const result = await sendEmail(email);
      expect(result.success).toBe(true);
      expect(result.provider).toBe("log");
      process.env.EMAIL_PROVIDER = original;
    });

    it("uses log provider when explicitly set", async () => {
      const original = process.env.EMAIL_PROVIDER;
      process.env.EMAIL_PROVIDER = "log";
      const email = composeFailureAlertEmail(baseAlert);
      const result = await sendEmail(email);
      expect(result.success).toBe(true);
      expect(result.provider).toBe("log");
      process.env.EMAIL_PROVIDER = original;
    });

    it("returns error for resend without API key", async () => {
      const original = process.env.EMAIL_PROVIDER;
      const originalKey = process.env.RESEND_API_KEY;
      process.env.EMAIL_PROVIDER = "resend";
      delete process.env.RESEND_API_KEY;
      const email = composeFailureAlertEmail(baseAlert);
      const result = await sendEmail(email);
      expect(result.success).toBe(false);
      expect(result.error).toContain("RESEND_API_KEY");
      process.env.EMAIL_PROVIDER = original;
      if (originalKey) process.env.RESEND_API_KEY = originalKey;
      else delete process.env.RESEND_API_KEY;
    });
  });
});

describe("ALERT_TTL_SECONDS guard", () => {
  const ttlMockRedis = {
    set: vi.fn().mockResolvedValue("OK"),
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(0),
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses correct TTL with default EMAIL_RATE_LIMIT_MS", async () => {
    vi.doMock("@/server/redis", () => ({
      getRedis: () => ttlMockRedis,
    }));

    const { markSent } = await import("@/server/services/email");
    await markSent("ep-001");

    expect(ttlMockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      3600,
      "NX",
    );
  });

  it("enforces minimum TTL of 1 when EMAIL_RATE_LIMIT_MS is very small", async () => {
    vi.doMock("@/lib/constants", () => ({
      EMAIL_RATE_LIMIT_MS: 0,
      DEFAULT_EMAIL_FROM: "alerts@hookrelay.dev",
      EMAIL_ALERT_THRESHOLD: 5,
    }));
    vi.doMock("@/server/redis", () => ({
      getRedis: () => ttlMockRedis,
    }));

    const { markSent } = await import("@/server/services/email");
    await markSent("ep-001");

    const ttlArg = ttlMockRedis.set.mock.calls[0]?.[3];
    expect(ttlArg).toBeGreaterThanOrEqual(1);
  });

  it("enforces minimum TTL of 1 when EMAIL_RATE_LIMIT_MS is negative", async () => {
    vi.doMock("@/lib/constants", () => ({
      EMAIL_RATE_LIMIT_MS: -5000,
      DEFAULT_EMAIL_FROM: "alerts@hookrelay.dev",
      EMAIL_ALERT_THRESHOLD: 5,
    }));
    vi.doMock("@/server/redis", () => ({
      getRedis: () => ttlMockRedis,
    }));

    const { markSent } = await import("@/server/services/email");
    await markSent("ep-001");

    const ttlArg = ttlMockRedis.set.mock.calls[0]?.[3];
    expect(ttlArg).toBeGreaterThanOrEqual(1);
  });

  it("computes TTL correctly from EMAIL_RATE_LIMIT_MS", async () => {
    vi.doMock("@/lib/constants", () => ({
      EMAIL_RATE_LIMIT_MS: 1800_000,
      DEFAULT_EMAIL_FROM: "alerts@hookrelay.dev",
      EMAIL_ALERT_THRESHOLD: 5,
    }));
    vi.doMock("@/server/redis", () => ({
      getRedis: () => ttlMockRedis,
    }));

    const { markSent } = await import("@/server/services/email");
    await markSent("ep-001");

    expect(ttlMockRedis.set).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      "EX",
      1800,
      "NX",
    );
  });
});
