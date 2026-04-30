import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(false);
const mockGetEventById = vi.fn();
const mockGetEndpointById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue({});
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateFanoutEventStatus = vi.fn().mockResolvedValue(undefined);
const mockGetLastActualDeliveryTimeByEndpoint = vi.fn();

vi.mock("@/server/db/queries", () => ({
  getEndpointById: (...args: unknown[]) => mockGetEndpointById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createDelivery: (...args: unknown[]) => mockCreateDelivery(...args),
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  getSuccessfulDelivery: (...args: unknown[]) =>
    mockGetSuccessfulDelivery(...args),
  updateFanoutEventStatus: (...args: unknown[]) =>
    mockUpdateFanoutEventStatus(...args),
  getLastActualDeliveryTimeByEndpoint: (...args: unknown[]) =>
    mockGetLastActualDeliveryTimeByEndpoint(...args),
  getConsecutiveFailures: vi.fn().mockResolvedValue(0),
  updateEndpoint: vi.fn().mockResolvedValue(undefined),
  getUserById: vi.fn().mockResolvedValue({
    id: "user-001",
    email: "dev@example.com",
  }),
  getLastErrorForEndpoint: vi.fn().mockResolvedValue(null),
}));

const mockDeliverWebhook = vi.fn();
const mockIsSuccessfulDelivery = vi.fn();

vi.mock("@/server/services/delivery", () => ({
  deliverWebhook: (...args: unknown[]) => mockDeliverWebhook(...args),
  isSuccessfulDelivery: (...args: unknown[]) =>
    mockIsSuccessfulDelivery(...args),
}));

const mockGetNextRetryAt = vi.fn();
const mockHasRetriesRemaining = vi.fn();

vi.mock("@/server/services/retry", () => ({
  getNextRetryAt: (...args: unknown[]) => mockGetNextRetryAt(...args),
  hasRetriesRemaining: (...args: unknown[]) =>
    mockHasRetriesRemaining(...args),
}));

const mockProcessFailureAlert = vi.fn();
const mockResetAlertStateOnSuccess = vi.fn().mockResolvedValue(false);

vi.mock("@/server/services/alerting", () => ({
  processFailureAlert: (...args: unknown[]) =>
    mockProcessFailureAlert(...args),
  resetAlertStateOnSuccess: (...args: unknown[]) =>
    mockResetAlertStateOnSuccess(...args),
}));

vi.mock("@/server/services/circuit", async () => {
  const actual =
    await vi.importActual<typeof import("@/server/services/circuit")>(
      "@/server/services/circuit",
    );
  return {
    ...actual,
  };
});

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
  endpointGroupId: null,
  deliveryMode: "direct" as const,
  payload: { foo: "bar" },
  eventType: "test.event",
  status: "queued" as const,
  userId: "user-001",
  source: null,
  idempotencyKey: null,
  metadata: {},
  replayedFromEventId: null,
  createdAt: new Date(),
};

const baseEndpoint = {
  id: "ep-001",
  userId: "user-001",
  url: "https://example.com/webhook",
  name: "Test Endpoint",
  description: null,
  signingSecret: "whsec_test",
  status: "active" as const,
  customHeaders: null,
  isActive: true,
  disabledReason: null,
  consecutiveFailures: 0,
  maxRetries: 5,
  retrySchedule: [60, 300, 1800, 7200, 43200],
  rateLimit: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const successResult = {
  statusCode: 200,
  responseBody: '{"ok": true}',
  responseHeaders: { "content-type": "application/json" },
  requestHeaders: { "content-type": "application/json" },
  durationMs: 150,
};

const failureResult = {
  statusCode: 500,
  responseBody: "Internal Server Error",
  responseHeaders: { "content-type": "text/plain" },
  requestHeaders: { "content-type": "application/json" },
  durationMs: 150,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  mockGetSuccessfulDelivery.mockResolvedValue(false);
  mockGetEventById.mockResolvedValue(baseEvent);
  mockGetEndpointById.mockResolvedValue(baseEndpoint);
  mockCreateDelivery.mockResolvedValue({});
  mockUpdateEventStatus.mockResolvedValue(undefined);
  mockUpdateFanoutEventStatus.mockResolvedValue(undefined);
  mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(null);
  mockDeliverWebhook.mockResolvedValue(successResult);
  mockIsSuccessfulDelivery.mockReturnValue(true);
  mockHasRetriesRemaining.mockReturnValue(true);
  mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
  mockProcessFailureAlert.mockResolvedValue({
    status: "active",
    alertSent: false,
    alertSkippedReason: "below_threshold",
  });
  mockResetAlertStateOnSuccess.mockResolvedValue(false);
});

describe("Circuit breaker lifecycle integration", () => {
  describe("phase 1: normal operation - deliveries succeed", () => {
    it("delivers successfully with active endpoint", async () => {
      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "success",
        }),
      );
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "delivered");
      expect(mockResetAlertStateOnSuccess).toHaveBeenCalledWith(
        "ep-001",
        "active",
      );
    });

    it("does not check circuit state for active endpoint", async () => {
      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(
        mockGetLastActualDeliveryTimeByEndpoint,
      ).not.toHaveBeenCalledWith("ep-001");
    });
  });

  describe("phase 2: circuit opens after consecutive failures", () => {
    it("calls processFailureAlert on each failure", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockProcessFailureAlert).toHaveBeenCalledWith({
        endpointId: "ep-001",
        endpointName: "Test Endpoint",
        endpointUrl: "https://example.com/webhook",
        userId: "user-001",
      });
    });
  });

  describe("phase 3: circuit open - deliveries skipped", () => {
    it("skips delivery when circuit is open (degraded, recent failure)", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      const recentDelivery = new Date(Date.now() - 60_000);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(recentDelivery);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "circuit_open",
          errorMessage: "Circuit breaker open - endpoint is degraded",
        }),
      );
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });

    it("does not enqueue retries for circuit_open deliveries", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 60_000),
      );

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
    });

    it("does not send failure alert for circuit_open skip", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 60_000),
      );

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockProcessFailureAlert).not.toHaveBeenCalled();
    });

    it("skips delivery when circuit is open with very recent failure", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(new Date());

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "circuit_open" }),
      );
    });

    it("uses fanout status update for fanout events when circuit open", async () => {
      const fanoutEvent = { ...baseEvent, endpointGroupId: "group-001" };
      mockGetEventById.mockResolvedValue(fanoutEvent);
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 60_000),
      );

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-001");
      expect(mockUpdateEventStatus).not.toHaveBeenCalledWith(
        "evt-001",
        "failed",
      );
    });
  });

  describe("phase 4: half-open - recovery probe allowed", () => {
    it("attempts delivery when cooldown has passed", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      const oldDelivery = new Date(Date.now() - 6 * 60 * 1000);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(oldDelivery);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );
    });

    it("resets endpoint to active on successful recovery", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockResetAlertStateOnSuccess).toHaveBeenCalledWith(
        "ep-001",
        "degraded",
      );
    });

    it("allows recovery when no previous deliveries exist", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(null);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
    });
  });

  describe("phase 5: recovery probe fails - stays degraded", () => {
    it("does not enqueue retries when recovery probe fails", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockIsSuccessfulDelivery.mockReturnValue(false);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
    });

    it("still processes failure alert on failed recovery probe", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockIsSuccessfulDelivery.mockReturnValue(false);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockProcessFailureAlert).toHaveBeenCalledWith({
        endpointId: "ep-001",
        endpointName: "Test Endpoint",
        endpointUrl: "https://example.com/webhook",
        userId: "user-001",
      });
    });

    it("marks event as failed on failed recovery probe", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockIsSuccessfulDelivery.mockReturnValue(false);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });

    it("does not enqueue retries on network error during recovery probe", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockDeliverWebhook.mockRejectedValue(new Error("ECONNREFUSED"));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorMessage: "ECONNREFUSED",
        }),
      );
    });
  });

  describe("full lifecycle: active → degraded → open → half-open → active", () => {
    it("transitions through all circuit breaker states", async () => {
      // Phase 1: Normal delivery succeeds
      mockGetEndpointById.mockResolvedValue(baseEndpoint);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );

      vi.clearAllMocks();
      mockGetSuccessfulDelivery.mockResolvedValue(false);
      mockGetEventById.mockResolvedValue(baseEvent);

      // Phase 2: Failures cause degradation
      const degradedEndpoint = {
        ...baseEndpoint,
        status: "degraded" as const,
      };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 30_000),
      );

      await handleDelivery({
        eventId: "evt-002",
        endpointId: "ep-001",
        attemptNumber: 1,
      });
      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "circuit_open" }),
      );

      vi.clearAllMocks();
      mockGetSuccessfulDelivery.mockResolvedValue(false);

      const event3 = { ...baseEvent, id: "evt-003" };
      mockGetEventById.mockResolvedValue(event3);
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);

      // Phase 3: Cooldown passes, recovery succeeds
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockDeliverWebhook.mockResolvedValue(successResult);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-003",
        endpointId: "ep-001",
        attemptNumber: 1,
      });
      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "success" }),
      );
      expect(mockResetAlertStateOnSuccess).toHaveBeenCalledWith(
        "ep-001",
        "degraded",
      );
    });
  });

  describe("full lifecycle: active → degraded → open → half-open → still degraded", () => {
    it("keeps circuit open when recovery probe fails", async () => {
      // Phase 1: Degraded with recent failure (circuit open)
      const degradedEndpoint = {
        ...baseEndpoint,
        status: "degraded" as const,
      };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 30_000),
      );

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "circuit_open" }),
      );

      vi.clearAllMocks();
      mockGetSuccessfulDelivery.mockResolvedValue(false);

      const event2 = { ...baseEvent, id: "evt-002" };
      mockGetEventById.mockResolvedValue(event2);
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);

      // Phase 2: Cooldown passes, recovery probe fails
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 6 * 60 * 1000),
      );
      mockDeliverWebhook.mockResolvedValue(failureResult);
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockProcessFailureAlert.mockResolvedValue({
        status: "degraded",
        alertSent: false,
      });

      await handleDelivery({
        eventId: "evt-002",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "failed" }),
      );
      expect(mockEnqueueDelivery).not.toHaveBeenCalled();
      expect(mockEnqueueDeadLetter).not.toHaveBeenCalled();
      expect(mockProcessFailureAlert).toHaveBeenCalled();

      vi.clearAllMocks();
      mockGetSuccessfulDelivery.mockResolvedValue(false);

      const event3 = { ...baseEvent, id: "evt-003" };
      mockGetEventById.mockResolvedValue(event3);
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);

      // Phase 3: Next delivery within cooldown → circuit_open again
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 30_000),
      );

      await handleDelivery({
        eventId: "evt-003",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ status: "circuit_open" }),
      );
    });
  });

  describe("edge cases", () => {
    it("still skips delivery for circuit_open on replay events", async () => {
      const replayEvent = {
        ...baseEvent,
        replayedFromEventId: "evt-original",
      };
      mockGetEventById.mockResolvedValue(replayEvent);
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(
        new Date(Date.now() - 60_000),
      );

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "circuit_open",
          isReplay: true,
        }),
      );
    });

    it("normal retries still work for non-degraded endpoints", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 2,
      });

      expect(mockDeliverWebhook).toHaveBeenCalled();
      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ attemptNumber: 3 }),
        expect.any(Number),
      );
    });

    it("dead letter still works for non-degraded endpoints", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockEnqueueDeadLetter).toHaveBeenCalled();
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    });
  });
});
