import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  isRateLimited,
  markSent,
  resetRateLimits,
  composeFailureAlertEmail,
  sendFailureAlert,
  sendEmail,
  type AlertPayload,
} from "@/server/services/email";

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
    resetRateLimits();
  });

  describe("rate limiting", () => {
    it("is not rate-limited for a new endpoint", () => {
      expect(isRateLimited("ep-new")).toBe(false);
    });

    it("is rate-limited after marking as sent", () => {
      markSent("ep-001");
      expect(isRateLimited("ep-001")).toBe(true);
    });

    it("is not rate-limited for a different endpoint", () => {
      markSent("ep-001");
      expect(isRateLimited("ep-002")).toBe(false);
    });

    it("becomes unblocked after the rate limit window passes", () => {
      const now = Date.now();
      markSent("ep-001", now - 60 * 60 * 1000 - 1);
      expect(isRateLimited("ep-001", now)).toBe(false);
    });

    it("remains blocked just before the rate limit window expires", () => {
      const now = Date.now();
      markSent("ep-001", now - 60 * 60 * 1000 + 1000);
      expect(isRateLimited("ep-001", now)).toBe(true);
    });

    it("resetRateLimits clears all rate limit state", () => {
      markSent("ep-001");
      markSent("ep-002");
      resetRateLimits();
      expect(isRateLimited("ep-001")).toBe(false);
      expect(isRateLimited("ep-002")).toBe(false);
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
  });

  describe("sendFailureAlert", () => {
    it("sends when threshold is met and not rate-limited", async () => {
      const result = await sendFailureAlert(baseAlert);
      expect(result.success).toBe(true);
    });

    it("skips when failure count is below threshold", async () => {
      const alert = { ...baseAlert, failureCount: 3 };
      const result = await sendFailureAlert(alert);
      expect(result.success).toBe(false);
      expect(result.provider).toBe("skipped");
    });

    it("rate-limits after the first alert for the same endpoint", async () => {
      const first = await sendFailureAlert(baseAlert);
      expect(first.success).toBe(true);

      const second = await sendFailureAlert(baseAlert);
      expect(second.success).toBe(false);
      expect(second.provider).toBe("rate-limited");
    });

    it("allows alerts for different endpoints independently", async () => {
      await sendFailureAlert(baseAlert);

      const alert2: AlertPayload = { ...baseAlert, endpointId: "ep-002" };
      const result = await sendFailureAlert(alert2);
      expect(result.success).toBe(true);
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
