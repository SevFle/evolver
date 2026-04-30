import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetConsecutiveFailures = vi.fn();
const mockUpdateEndpoint = vi.fn().mockResolvedValue(undefined);
const mockGetUserById = vi.fn();
const mockGetLastErrorForEndpoint = vi.fn().mockResolvedValue(null);
const mockGetEndpointById = vi.fn();
const mockGetEventById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue(undefined);
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(null);
const mockUpdateFanoutEventStatus = vi.fn().mockResolvedValue(undefined);

vi.mock("@/server/db/queries", () => ({
  getConsecutiveFailures: (...args: unknown[]) => mockGetConsecutiveFailures(...args),
  updateEndpoint: (...args: unknown[]) => mockUpdateEndpoint(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getLastErrorForEndpoint: (...args: unknown[]) => mockGetLastErrorForEndpoint(...args),
  getEndpointById: (...args: unknown[]) => mockGetEndpointById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createDelivery: (...args: unknown[]) => mockCreateDelivery(...args),
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  getSuccessfulDelivery: (...args: unknown[]) => mockGetSuccessfulDelivery(...args),
  updateFanoutEventStatus: (...args: unknown[]) => mockUpdateFanoutEventStatus(...args),
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
  MAX_PAYLOAD_RESPONSE_SIZE: 10 * 1024,
  MAX_RETRY_ATTEMPTS: 5,
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
  payload: { action: "test" },
  eventType: "test.event",
  status: "queued" as const,
  userId: "user-001",
  createdAt: new Date(),
};

const baseEndpoint = {
  id: "ep-001",
  userId: "user-001",
  url: "https://example.com/webhook",
  name: "Production API",
  signingSecret: "whsec_test",
  status: "active" as const,
  isActive: true,
  customHeaders: null,
  retrySchedule: null,
  maxRetries: 5,
};

describe("worker → alert integration flow", () => {
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
    mockUpdateFanoutEventStatus.mockResolvedValue(undefined);
    mockGetConsecutiveFailures.mockResolvedValue(0);
    mockUpdateEndpoint.mockResolvedValue(undefined);
    mockGetUserById.mockResolvedValue({
      id: "user-001",
      email: "admin@example.com",
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
    mockDeliverWebhook.mockResolvedValue({
      statusCode: 500,
      responseBody: "Internal Server Error",
      responseHeaders: {},
      requestHeaders: {},
      durationMs: 100,
    });
    mockIsSuccessfulDelivery.mockReturnValue(false);
    mockHasRetriesRemaining.mockReturnValue(false);
    mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
  });

  describe("full failure → alert flow", () => {
    it("delivers, detects failure, tracks consecutive failures, sends alert", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();

      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          responseStatusCode: 500,
        }),
      );

      expect(mockGetConsecutiveFailures).toHaveBeenCalledWith("ep-001");

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "degraded",
      });

      expect(mockMarkSent).toHaveBeenCalledWith("ep-001");

      expect(mockGetUserById).toHaveBeenCalledWith("user-001");
      expect(mockGetLastErrorForEndpoint).toHaveBeenCalledWith("ep-001");

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: "ep-001",
          endpointName: "Production API",
          endpointUrl: "https://example.com/webhook",
          failureCount: 5,
          userEmail: "admin@example.com",
        }),
      );
    });

    it("does not alert when consecutive failures below threshold", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(3);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 3,
      });

      expect(mockMarkSent).not.toHaveBeenCalled();
      expect(mockSendFailureAlert).not.toHaveBeenCalled();
    });

    it("rate-limits duplicate alerts within the cooldown window", async () => {
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
  });

  describe("success → reset flow", () => {
    it("resets degraded endpoint to active on success", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockIsSuccessfulDelivery.mockReturnValue(true);
      mockDeliverWebhook.mockResolvedValue({
        statusCode: 200,
        responseBody: "OK",
        responseHeaders: {},
        requestHeaders: {},
        durationMs: 50,
      });
      mockGetEndpointStatusAfterSuccess.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "active",
      });
      expect(mockMarkSent).not.toHaveBeenCalled();
      expect(mockSendFailureAlert).not.toHaveBeenCalled();
    });

    it("does not update active endpoint on success", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(true);
      mockDeliverWebhook.mockResolvedValue({
        statusCode: 200,
        responseBody: "OK",
        responseHeaders: {},
        requestHeaders: {},
        durationMs: 50,
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEndpoint).not.toHaveBeenCalled();
    });
  });

  describe("exception path triggers alerting", () => {
    it("alerts when webhook delivery throws and consecutive failures exceed threshold", async () => {
      mockDeliverWebhook.mockRejectedValue(new Error("Network timeout"));
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(6);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorMessage: "Network timeout",
        }),
      );

      expect(mockGetConsecutiveFailures).toHaveBeenCalledWith("ep-001");
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          failureCount: 6,
          endpointId: "ep-001",
        }),
      );
    });

    it("creates failed delivery and handles alert when email fails", async () => {
      mockDeliverWebhook.mockRejectedValue(new Error("DNS resolution failed"));
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
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

      expect(mockCreateDelivery).toHaveBeenCalled();
      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });
  });

  describe("end-to-end with retries exhausted", () => {
    it("dead letters + alerts when retries exhausted and threshold met", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");

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

      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointId: "ep-001",
          failureCount: 5,
        }),
      );
    });

    it("retries + alerts when retries remain but threshold already met", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 3,
      });

      expect(mockEnqueueDelivery).toHaveBeenCalled();
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
      expect(mockSendFailureAlert).toHaveBeenCalled();
    });
  });

  describe("alert cleared on error recovery", () => {
    it("clears rate limit when user lookup fails, allowing retry next time", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetUserById.mockResolvedValue(null);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("clears rate limit when getUserById throws, preserving retryability", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetUserById.mockRejectedValue(new Error("DB connection lost"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockClearAlertRateLimit).toHaveBeenCalledWith("ep-001");
    });

    it("gracefully handles clearAlertRateLimit failure inside catch block", async () => {
      mockGetConsecutiveFailures.mockResolvedValue(5);
      mockGetEndpointStatusAfterFailure.mockReturnValue("degraded");
      mockMarkSent.mockResolvedValue("OK");
      mockGetUserById.mockRejectedValue(new Error("original"));
      mockClearAlertRateLimit.mockRejectedValue(new Error("redis down"));

      await expect(
        handleDelivery({
          eventId: "evt-001",
          endpointId: "ep-001",
          attemptNumber: 5,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe("multiple endpoints with independent alerting", () => {
    it("alerts for ep-001 but not ep-002 (below threshold)", async () => {
      const endpoint2 = { ...baseEndpoint, id: "ep-002", name: "Backup API" };
      mockGetEndpointById
        .mockResolvedValueOnce(baseEndpoint)
        .mockResolvedValueOnce(endpoint2);
      mockGetConsecutiveFailures
        .mockResolvedValueOnce(5)
        .mockResolvedValueOnce(2);
      mockGetEndpointStatusAfterFailure
        .mockReturnValueOnce("degraded")
        .mockReturnValueOnce("active");
      mockMarkSent.mockResolvedValue("OK");
      mockGetLastErrorForEndpoint
        .mockResolvedValueOnce("Error A")
        .mockResolvedValueOnce("Error B");

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      await handleDelivery({
        eventId: "evt-002",
        endpointId: "ep-002",
        attemptNumber: 5,
      });

      expect(mockSendFailureAlert).toHaveBeenCalledTimes(1);
      expect(mockSendFailureAlert).toHaveBeenCalledWith(
        expect.objectContaining({ endpointId: "ep-001" }),
      );
    });
  });
});
