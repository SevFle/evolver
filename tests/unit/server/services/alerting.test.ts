import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetConsecutiveFailures = vi.fn();
const mockUpdateEndpoint = vi.fn().mockResolvedValue(undefined);
const mockGetUserById = vi.fn();
const mockGetLastErrorForEndpoint = vi.fn().mockResolvedValue(null);

vi.mock("@/server/db/queries", () => ({
  getConsecutiveFailures: (...args: unknown[]) => mockGetConsecutiveFailures(...args),
  updateEndpoint: (...args: unknown[]) => mockUpdateEndpoint(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getLastErrorForEndpoint: (...args: unknown[]) => mockGetLastErrorForEndpoint(...args),
}));

const mockGetEndpointStatusAfterFailure = vi.fn();
const mockGetEndpointStatusAfterSuccess = vi.fn().mockReturnValue("active");

vi.mock("@/server/services/circuit", () => ({
  getEndpointStatusAfterFailure: (...args: unknown[]) => mockGetEndpointStatusAfterFailure(...args),
  getEndpointStatusAfterSuccess: (...args: unknown[]) => mockGetEndpointStatusAfterSuccess(...args),
}));

const mockSendFailureAlert = vi.fn();
const mockMarkSent = vi.fn();
const mockClearAlertRateLimit = vi.fn().mockResolvedValue(undefined);

vi.mock("@/server/services/email", () => ({
  sendFailureAlert: (...args: unknown[]) => mockSendFailureAlert(...args),
  markSent: (...args: unknown[]) => mockMarkSent(...args),
  clearAlertRateLimit: (...args: unknown[]) => mockClearAlertRateLimit(...args),
}));

vi.mock("@/lib/constants", () => ({
  CIRCUIT_BREAKER_THRESHOLD: 5,
}));

import {
  processFailureAlert,
  resetAlertStateOnSuccess,
  type AlertContext,
} from "@/server/services/alerting";

const baseCtx: AlertContext = {
  endpointId: "ep-001",
  endpointName: "Stripe Handler",
  endpointUrl: "https://example.com/webhooks/stripe",
  userId: "user-001",
};

describe("processFailureAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mockGetConsecutiveFailures.mockResolvedValue(0);
    mockUpdateEndpoint.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({
      id: "user-001",
      email: "dev@example.com",
    });
    mockGetLastErrorForEndpoint.mockResolvedValue("Connection refused");
    mockGetEndpointStatusAfterFailure.mockReturnValue("active");
    mockGetEndpointStatusAfterSuccess.mockReturnValue("active");
    mockMarkSent.mockResolvedValue(null);
    mockClearAlertRateLimit.mockResolvedValue(undefined);
    mockSendFailureAlert.mockResolvedValue({
      success: true,
      provider: "log",
    });
  });

  describe("below threshold", () => {
    it("returns active status with alertSent=false when 0 failures", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(0);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      const result = await processFailureAlert(baseCtx);

      expect(result).toEqual({
        status: "active",
        alertSent: false,
        alertSkippedReason: "below_threshold",
      });
    });

    it("returns active status when 4 failures (one below threshold)", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(4);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      const result = await processFailureAlert(baseCtx);

      expect(result).toEqual({
        status: "active",
        alertSent: false,
        alertSkippedReason: "below_threshold",
      });
    });

    it("does not call markSent when below threshold", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(3);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await processFailureAlert(baseCtx);

      expect(mockMarkSent).not.toHaveBeenCalled();
    });

    it("does not update endpoint when status is active", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(2);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await processFailureAlert(baseCtx);

      expect(mockUpdateEndpoint).not.toHaveBeenCalled();
    });

    it("updates endpoint to degraded at threshold even if alert is rate-limited", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      const result = await processFailureAlert(baseCtx);

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "degraded",
      });
      expect(result.status).toBe("degraded");
      expect(result.alertSent).toBe(false);
    });
  });

  describe("at threshold (5 consecutive failures)", () => {
    function setupAtThreshold() {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
    }

    it("sends alert and returns alertSent=true", async () => {
      setupAtThreshold();

      const result = await processFailureAlert(baseCtx);

      expect(result).toEqual({
        status: "degraded",
        alertSent: true,
      });
    });

    it("updates endpoint to degraded", async () => {
      setupAtThreshold();

      await processFailureAlert(baseCtx);

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "degraded",
      });
    });

    it("checks rate limit via markSent before sending", async () => {
      setupAtThreshold();

      await processFailureAlert(baseCtx);

      expect(mockMarkSent).toHaveBeenCalledWith("ep-001");
    });

    it("fetches user for email address", async () => {
      setupAtThreshold();

      await processFailureAlert(baseCtx);

      expect(mockGetUserById).toHaveBeenCalledWith("user-001");
    });

    it("fetches last error for endpoint", async () => {
      setupAtThreshold();

      await processFailureAlert(baseCtx);

      expect(mockGetLastErrorForEndpoint).toHaveBeenCalledWith("ep-001");
    });

    it("passes correct payload to sendFailureAlert", async () => {
      setupAtThreshold();

      await processFailureAlert(baseCtx);

      expect(mockSendFailureAlert).toHaveBeenCalledWith({
        endpointId: "ep-001",
        endpointName: "Stripe Handler",
        endpointUrl: "https://example.com/webhooks/stripe",
        failureCount: 5,
        lastErrorMessage: "Connection refused",
        dashboardUrl: "http://localhost:3000/dashboard/endpoints/ep-001",
        userEmail: "dev@example.com",
      });
    });

    it("uses DASHBOARD_URL env for dashboard link", async () => {
      setupAtThreshold();
      const original = process.env.DASHBOARD_URL;
      process.env.DASHBOARD_URL = "https://app.example.com";

      await processFailureAlert(baseCtx);

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardUrl: "https://app.example.com/dashboard/endpoints/ep-001",
        }),
      );
      process.env.DASHBOARD_URL = original;
    });

    it("defaults to localhost when DASHBOARD_URL not set", async () => {
      setupAtThreshold();
      const original = process.env.DASHBOARD_URL;
      delete process.env.DASHBOARD_URL;

      await processFailureAlert(baseCtx);

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          dashboardUrl: "http://localhost:3000/dashboard/endpoints/ep-001",
        }),
      );
      process.env.DASHBOARD_URL = original;
    });
  });

  describe("above threshold (more than 5 consecutive failures)", () => {
    function setupAboveThreshold(failures: number) {
      mockGetConsecutiveFailures.mockResolvedValue(failures);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
    }

    it("sends alert when failures are 10", async () => {
      setupAboveThreshold(10);

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({ failureCount: 10 }),
      );
    });

    it("sends alert when failures are 100", async () => {
      setupAboveThreshold(100);

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({ failureCount: 100 }),
      );
    });

    it("passes exact failure count to circuit breaker", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(7);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await processFailureAlert(baseCtx);

      expect(mockGetEndpointStatusAfterFailure).toHaveBeenCalledWith(7);
    });
  });

  describe("rate limiting", () => {
    it("returns rate_limited when markSent returns null", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      const result = await processFailureAlert(baseCtx);

      expect(result).toEqual({
        status: "degraded",
        alertSent: false,
        alertSkippedReason: "rate_limited",
      });
    });

    it("does not send email when rate-limited", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      await processFailureAlert(baseCtx);

      expect(mockSendFailureAlert).not.toHaveBeenCalled();
    });

    it("does not fetch user when rate-limited", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      await processFailureAlert(baseCtx);

      expect(mockGetUserById).not.toHaveBeenCalled();
    });

    it("does not call clearAlertRateLimit when rate-limited (no error)", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      await processFailureAlert(baseCtx);

      expect(mockClearAlertRateLimit).not.toHaveBeenCalled();
    });

    it("allows alert after first rate-limited call succeeds", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce("OK");

      const first = await processFailureAlert(baseCtx);
      expect(first.alertSent).toBe(false);
      expect(first.alertSkippedReason).toBe("rate_limited");

      const second = await processFailureAlert(baseCtx);
      expect(second.alertSent).toBe(true);
    });
  });

  describe("user not found", () => {
    function setupUserNotFound() {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetUserById.mockResolvedValue(null);
    }

    it("returns user_not_found when user is null", async () => {
      setupUserNotFound();

      const result = await processFailureAlert(baseCtx);

      expect(result).toEqual({
        status: "degraded",
        alertSent: false,
        alertSkippedReason: "user_not_found",
      });
    });

    it("clears rate limit when user not found", async () => {
      setupUserNotFound();

      await processFailureAlert(baseCtx);

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("does not send email when user not found", async () => {
      setupUserNotFound();

      await processFailureAlert(baseCtx);

      expect(mockSendFailureAlert).not.toHaveBeenCalled();
    });
  });

  describe("email send failure", () => {
    function setupEmailFailure() {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockSendFailureAlert.mockResolvedValue({
        success: false,
        provider: "resend",
        error: "API key not configured",
      });
    }

    it("returns send_failed when email provider fails", async () => {
      setupEmailFailure();

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toContain("send_failed");
    });

    it("clears rate limit on send failure", async () => {
      setupEmailFailure();

      await processFailureAlert(baseCtx);

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });
  });

  describe("exception handling", () => {
    function setupAlertPath() {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
    }

    it("catches getUserById exception and clears rate limit", async () => {
      setupAlertPath();
      mockGetUserById.mockRejectedValue(new Error("DB connection lost"));

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toBe("exception");
      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("catches sendFailureAlert exception and clears rate limit", async () => {
      setupAlertPath();
      mockSendFailureAlert.mockRejectedValue(new Error("Email service down"));

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toBe("exception");
      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("catches getLastErrorForEndpoint exception and clears rate limit", async () => {
      setupAlertPath();
      mockGetLastErrorForEndpoint.mockRejectedValue(new Error("Query failed"));

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toBe("exception");
      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("does not propagate clearAlertRateLimit failure", async () => {
      setupAlertPath();
      mockGetUserById.mockRejectedValue(new Error("original error"));
      mockClearAlertRateLimit.mockRejectedValue(new Error("Redis down"));

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toBe("exception");
    });

    it("does not propagate when all alerts services fail", async () => {
      setupAlertPath();
      mockGetUserById.mockRejectedValue(new Error("db fail"));
      mockClearAlertRateLimit.mockRejectedValue(new Error("redis fail"));

      await expect(processFailureAlert(baseCtx)).resolves.toBeDefined();
    });

    it("logs error to console on exception", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      setupAlertPath();
      const error = new Error("DB connection lost");
      mockGetUserById.mockRejectedValue(error);

      await processFailureAlert(baseCtx);

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("ep-001"),
        error,
      );
    });
  });

  describe("independent endpoint alerting", () => {
    it("alerts for different endpoints independently", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      const ctx1: AlertContext = { ...baseCtx, endpointId: "ep-001" };
      const ctx2: AlertContext = { ...baseCtx, endpointId: "ep-002" };

      const result1 = await processFailureAlert(ctx1);
      const result2 = await processFailureAlert(ctx2);

      expect(result1.alertSent).toBe(true);
      expect(result2.alertSent).toBe(true);
      expect(mockMarkSent).toHaveBeenCalledWith("ep-001");
      expect(mockMarkSent).toHaveBeenCalledWith("ep-002");
    });

    it("rate-limits per endpoint independently", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent
        .mockImplementation(async (id: string) =>
          id === "ep-001" ? "OK" : null,
        );

      const ctx1: AlertContext = { ...baseCtx, endpointId: "ep-001" };
      const ctx2: AlertContext = { ...baseCtx, endpointId: "ep-002" };

      const result1 = await processFailureAlert(ctx1);
      const result2 = await processFailureAlert(ctx2);

      expect(result1.alertSent).toBe(true);
      expect(result2.alertSent).toBe(false);
      expect(result2.alertSkippedReason).toBe("rate_limited");
    });
  });

  describe("boundary values", () => {
    it("threshold boundary: 4 failures = no alert", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(4);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(false);
      expect(result.alertSkippedReason).toBe("below_threshold");
    });

    it("threshold boundary: 5 failures = alert attempted", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
      expect(mockMarkSent).toHaveBeenCalled();
    });

    it("threshold boundary: 6 failures = alert attempted", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(6);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
    });

    it("handles 1 consecutive failure", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      const result = await processFailureAlert(baseCtx);

      expect(result.status).toBe("active");
      expect(result.alertSent).toBe(false);
    });

    it("handles null last error message", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetLastErrorForEndpoint.mockResolvedValue(null);

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorMessage: null,
        }),
      );
    });

    it("handles empty string last error message", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetLastErrorForEndpoint.mockResolvedValue("");

      const result = await processFailureAlert(baseCtx);

      expect(result.alertSent).toBe(true);
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorMessage: "",
        }),
      );
    });
  });

  describe("execution order", () => {
    it("updates endpoint status before checking alert threshold", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      const callOrder: string[] = [];
      mockUpdateEndpoint.mockImplementation(async () => {
        callOrder.push("updateEndpoint");
      });
      mockMarkSent.mockImplementation(async () => {
        callOrder.push("markSent");
        return "OK";
      });

      await processFailureAlert(baseCtx);

      expect(callOrder).toEqual(["updateEndpoint", "markSent"]);
    });

    it("sends email after rate limit check passes", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");

      const callOrder: string[] = [];
      mockMarkSent.mockImplementation(async () => {
        callOrder.push("markSent");
        return "OK";
      });
      mockSendFailureAlert.mockImplementation(async () => {
        callOrder.push("sendFailureAlert");
        return { success: true, provider: "log" };
      });

      await processFailureAlert(baseCtx);

      expect(callOrder).toEqual(["markSent", "sendFailureAlert"]);
    });
  });
});

describe("resetAlertStateOnSuccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUpdateEndpoint.mockResolvedValue(undefined);
    mockGetEndpointStatusAfterSuccess.mockReturnValue("active");
  });

  it("resets degraded endpoint to active", async () => {
    const updated = await resetAlertStateOnSuccess("ep-001", "degraded");

    expect(updated).toBe(true);
    expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "active",
    });
  });

  it("does nothing for active endpoint", async () => {
    const updated = await resetAlertStateOnSuccess("ep-001", "active");

    expect(updated).toBe(false);
    expect(mockUpdateEndpoint).not.toHaveBeenCalled();
  });

  it("does nothing for disabled endpoint", async () => {
    const updated = await resetAlertStateOnSuccess("ep-001", "disabled");

    expect(updated).toBe(false);
    expect(mockUpdateEndpoint).not.toHaveBeenCalled();
  });

  it("uses circuit breaker success status", async () => {
    mockGetEndpointStatusAfterSuccess.mockReturnValue("active");

    await resetAlertStateOnSuccess("ep-001", "degraded");

    expect(mockGetEndpointStatusAfterSuccess).toHaveBeenCalled();
    expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "active",
    });
  });
});
