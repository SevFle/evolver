import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(null);
const mockGetEventById = vi.fn();
const mockGetEndpointById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue(undefined);
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockGetConsecutiveFailures = vi.fn().mockResolvedValue(0);
const mockUpdateEndpoint = vi.fn().mockResolvedValue(undefined);
const mockGetUserById = vi.fn();
const mockGetLastErrorForEndpoint = vi.fn().mockResolvedValue(null);

vi.mock("@/server/db/queries", () => ({
  getEndpointById: (...args: unknown[]) => mockGetEndpointById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createDelivery: (...args: unknown[]) => mockCreateDelivery(...args),
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  getConsecutiveFailures: (...args: unknown[]) => mockGetConsecutiveFailures(...args),
  updateEndpoint: (...args: unknown[]) => mockUpdateEndpoint(...args),
  getSuccessfulDelivery: (...args: unknown[]) => mockGetSuccessfulDelivery(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getLastErrorForEndpoint: (...args: unknown[]) => mockGetLastErrorForEndpoint(...args),
}));

const mockDeliverWebhook = vi.fn();
const mockIsSuccessfulDelivery = vi.fn();

vi.mock("@/server/services/delivery", () => ({
  deliverWebhook: (...args: unknown[]) => mockDeliverWebhook(...args),
  isSuccessfulDelivery: (...args: unknown[]) => mockIsSuccessfulDelivery(...args),
}));

const mockGetNextRetryAt = vi.fn();
const mockHasRetriesRemaining = vi.fn();

vi.mock("@/server/services/retry", () => ({
  getNextRetryAt: (...args: unknown[]) => mockGetNextRetryAt(...args),
  hasRetriesRemaining: (...args: unknown[]) => mockHasRetriesRemaining(...args),
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

const mockEnqueueDelivery = vi.fn().mockResolvedValue("job-1");
const mockEnqueueDeadLetter = vi.fn().mockResolvedValue("dlq-1");

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: (...args: unknown[]) => mockEnqueueDelivery(...args),
  enqueueDeadLetter: (...args: unknown[]) => mockEnqueueDeadLetter(...args),
}));

import { handleDelivery } from "@/server/queue/handlers";

const baseEvent = {
  id: "evt-001",
  endpointId: "ep-001",
  payload: { foo: "bar" },
  eventType: "test.event",
  status: "queued" as const,
  userId: "user-001",
  createdAt: new Date(),
};

const baseEndpoint = {
  id: "ep-001",
  userId: "user-001",
  url: "https://example.com/webhook",
  name: "Test Endpoint",
  signingSecret: "whsec_test",
  status: "active" as const,
  isActive: true,
  customHeaders: null,
};

const baseDeliveryResult = {
  statusCode: 500,
  responseBody: "Internal Server Error",
  responseHeaders: { "content-type": "text/plain" },
  requestHeaders: { "content-type": "application/json" },
  durationMs: 150,
};

describe("handleDelivery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mockGetSuccessfulDelivery.mockResolvedValue(null);
    mockGetEventById.mockResolvedValue(baseEvent);
    mockGetEndpointById.mockResolvedValue(baseEndpoint);
    mockCreateDelivery.mockResolvedValue(undefined);
    mockUpdateEventStatus.mockResolvedValue(undefined);
    mockGetConsecutiveFailures.mockResolvedValue(0);
    mockUpdateEndpoint.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({ id: "user-001", email: "dev@example.com" });
    mockGetLastErrorForEndpoint.mockResolvedValue("HTTP 500");
    mockMarkSent.mockResolvedValue(null);
    mockClearAlertRateLimit.mockResolvedValue(undefined);
    mockSendFailureAlert.mockResolvedValue({ success: true, provider: "log" });
    mockDeliverWebhook.mockResolvedValue(baseDeliveryResult);
    mockIsSuccessfulDelivery.mockReturnValue(false);
    mockHasRetriesRemaining.mockReturnValue(true);
    mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
    mockGetEndpointStatusAfterFailure.mockReturnValue("active");
  });

  describe("clearAlertRateLimit error handling", () => {
    function setupAlertPath(overrides: { consecutiveFailures?: number } = {}) {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(
        overrides.consecutiveFailures ?? 5,
      );
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
    }

    it("calls clearAlertRateLimit when user is not found", async () => {
      setupAlertPath();
      mockGetUserById.mockResolvedValue(null);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("calls clearAlertRateLimit when sendFailureAlert returns failure", async () => {
      setupAlertPath();
      mockSendFailureAlert.mockResolvedValue({
        success: false,
        provider: "resend",
        error: "API key not configured",
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("calls clearAlertRateLimit in catch when getUserById throws", async () => {
      setupAlertPath();
      mockGetUserById.mockRejectedValue(new Error("DB connection lost"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("calls clearAlertRateLimit in catch when sendFailureAlert throws", async () => {
      setupAlertPath();
      mockSendFailureAlert.mockRejectedValue(new Error("Email service down"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("calls clearAlertRateLimit in catch when getLastErrorForEndpoint throws", async () => {
      setupAlertPath({ consecutiveFailures: 6 });
      mockGetLastErrorForEndpoint.mockRejectedValue(new Error("Query failed"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("does not propagate error when clearAlertRateLimit itself throws inside catch", async () => {
      setupAlertPath();
      mockGetUserById.mockRejectedValue(new Error("original error"));
      mockClearAlertRateLimit.mockRejectedValueOnce(new Error("Redis down"));

      await expect(
        handleDelivery({
          eventId: "evt-001",
          endpointId: "ep-001",
          attemptNumber: 5,
        }),
      ).resolves.toBeUndefined();
    });

    it("logs original error when clearAlertRateLimit throws inside catch", async () => {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      setupAlertPath();
      const originalError = new Error("original alert error");
      mockGetUserById.mockRejectedValue(originalError);
      mockClearAlertRateLimit.mockRejectedValueOnce(new Error("Redis down"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(consoleError).toHaveBeenCalledWith(
        expect.stringContaining("ep-001"),
        originalError,
      );
    });
  });

  describe("alert gate - markSent", () => {
    it("does not send alert when below CIRCUIT_BREAKER_THRESHOLD", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(3);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockMarkSent).not.toHaveBeenCalled();
    });

    it("does not send alert when markSent returns null (rate-limited)", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue(null);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockMarkSent).toHaveBeenCalledWith("ep-001");
      expect(mockSendFailureAlert).not.toHaveBeenCalled();
      expect(mockClearAlertRateLimit).not.toHaveBeenCalled();
    });

    it("sends alert when markSent returns OK", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: "ep-001",
          failureCount: 5,
          userEmail: "dev@example.com",
        }),
      );
    });
  });

  describe("retry and dead letter behavior", () => {
    it("enqueues retry when retries remain", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 2,
      });

      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-001",
          endpointId: "ep-001",
          attemptNumber: 3,
        }),
        expect.any(Number),
      );
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
    });

    it("moves to dead letter when retries exhausted", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockEnqueueDeadLetter).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-001",
          endpointId: "ep-001",
        }),
        expect.stringContaining("Max retries"),
      );
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });
  });

  describe("endpoint status transitions", () => {
    it("updates endpoint to degraded after threshold failures", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "degraded",
      });
    });

    it("recovers degraded endpoint on successful delivery", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "active",
      });
    });

    it("does not update active endpoint on success", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEndpoint).not.toHaveBeenCalled();
    });
  });

  describe("early returns and edge cases", () => {
    it("skips when already delivered", async () => {
      mockGetSuccessfulDelivery.mockResolvedValue({ id: "del-001" });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
    });

    it("skips when event not found", async () => {
      mockGetEventById.mockResolvedValue(null);

      await handleDelivery({
        eventId: "evt-999",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
    });

    it("skips and marks failed when endpoint disabled", async () => {
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        status: "disabled",
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });

    it("skips and marks failed when endpoint inactive", async () => {
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        isActive: false,
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });

    it("handles delivery exception and creates failed delivery record", async () => {
      mockDeliverWebhook.mockRejectedValue(new Error("Network timeout"));
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorMessage: "Network timeout",
        }),
      );
    });

    it("uses lastErrorMessage from delivery when available in failure path", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorMessage: "HTTP 500",
        }),
      );
    });

    it("falls back to getLastErrorForEndpoint when no lastErrorMessage", async () => {
      mockDeliverWebhook.mockRejectedValue(new Error("timeout"));
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(6);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetLastErrorForEndpoint.mockResolvedValue("Database error");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          lastErrorMessage: "Database error",
        }),
      );
    });
  });
});
