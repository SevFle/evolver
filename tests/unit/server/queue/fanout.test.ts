import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(null);
const mockGetEventById = vi.fn();
const mockGetEndpointById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue(undefined);
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateFanoutEventStatus = vi.fn().mockResolvedValue(undefined);
const mockGetConsecutiveFailures = vi.fn().mockResolvedValue(0);
const mockUpdateEndpoint = vi.fn().mockResolvedValue(undefined);
const mockGetUserById = vi.fn();
const mockGetLastErrorForEndpoint = vi.fn().mockResolvedValue(null);

vi.mock("@/server/db/queries", () => ({
  getEndpointById: (...args: unknown[]) => mockGetEndpointById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createDelivery: (...args: unknown[]) => mockCreateDelivery(...args),
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  updateFanoutEventStatus: (...args: unknown[]) => mockUpdateFanoutEventStatus(...args),
  getConsecutiveFailures: (...args: unknown[]) => mockGetConsecutiveFailures(...args),
  updateEndpoint: (...args: unknown[]) => mockUpdateEndpoint(...args),
  getSuccessfulDelivery: (...args: unknown[]) => mockGetSuccessfulDelivery(...args),
  getUserById: (...args: unknown[]) => mockGetUserById(...args),
  getLastErrorForEndpoint: (...args: unknown[]) => mockGetLastErrorForEndpoint(...args),
  getLastActualDeliveryTimeByEndpoint: vi.fn().mockResolvedValue(null),
  countCircuitOpenRetries: vi.fn().mockResolvedValue(0),
  deleteDeliveryById: vi.fn().mockResolvedValue(undefined),
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

const fanoutEvent = {
  id: "evt-fanout-001",
  userId: "user-001",
  endpointId: null,
  endpointGroupId: "group-001",
  eventType: "order.created",
  payload: { orderId: "123" },
  metadata: {},
  source: null,
  idempotencyKey: null,
  status: "queued" as const,
  replayedFromEventId: null,
  createdAt: new Date(),
};

const singleEvent = {
  id: "evt-single-001",
  userId: "user-001",
  endpointId: "ep-001",
  endpointGroupId: null,
  eventType: "test.event",
  payload: { foo: "bar" },
  metadata: {},
  source: null,
  idempotencyKey: null,
  status: "queued" as const,
  replayedFromEventId: null,
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

const successDeliveryResult = {
  statusCode: 200,
  responseBody: '{"ok": true}',
  responseHeaders: { "content-type": "application/json" },
  requestHeaders: { "content-type": "application/json" },
  durationMs: 150,
};

const failureDeliveryResult = {
  statusCode: 500,
  responseBody: "Internal Server Error",
  responseHeaders: { "content-type": "text/plain" },
  requestHeaders: { "content-type": "application/json" },
  durationMs: 150,
};

describe("handleDelivery — fan-out event tracking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mockGetSuccessfulDelivery.mockResolvedValue(null);
    mockCreateDelivery.mockResolvedValue(undefined);
    mockUpdateEventStatus.mockResolvedValue(undefined);
    mockUpdateFanoutEventStatus.mockResolvedValue(undefined);
    mockGetConsecutiveFailures.mockResolvedValue(0);
    mockUpdateEndpoint.mockResolvedValue(undefined);
    mockDeliverWebhook.mockResolvedValue(successDeliveryResult);
    mockIsSuccessfulDelivery.mockReturnValue(true);
    mockGetEndpointById.mockResolvedValue(baseEndpoint);
  });

  describe("fan-out vs single event status updates", () => {
    it("calls updateFanoutEventStatus on fan-out success", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-fanout-001");
      expect(mockUpdateEventStatus).not.toHaveBeenCalledWith("evt-fanout-001", "delivered");
    });

    it("calls updateEventStatus('delivered') on single-event success", async () => {
      mockGetEventById.mockResolvedValue(singleEvent);

      await handleDelivery({
        eventId: "evt-single-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-single-001", "delivered");
      expect(mockUpdateFanoutEventStatus).not.toHaveBeenCalled();
    });

    it("calls updateFanoutEventStatus when fan-out endpoint is disabled", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        status: "disabled",
      });

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-fanout-001");
      expect(mockDeliverWebhook).not.toHaveBeenCalled();
    });

    it("calls updateEventStatus('failed') when single-event endpoint is disabled", async () => {
      mockGetEventById.mockResolvedValue(singleEvent);
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        status: "disabled",
      });

      await handleDelivery({
        eventId: "evt-single-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-single-001", "failed");
      expect(mockUpdateFanoutEventStatus).not.toHaveBeenCalled();
    });
  });

  describe("fan-out failure with retries", () => {
    it("calls updateFanoutEventStatus when fan-out retries exhausted", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockEnqueueDeadLetter).toHaveBeenCalled();
      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-fanout-001");
      expect(mockUpdateEventStatus).not.toHaveBeenCalledWith("evt-fanout-001", "failed");
    });

    it("calls updateEventStatus('failed') when single-event retries exhausted", async () => {
      mockGetEventById.mockResolvedValue(singleEvent);
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-single-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockEnqueueDeadLetter).toHaveBeenCalled();
      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-single-001", "failed");
      expect(mockUpdateFanoutEventStatus).not.toHaveBeenCalled();
    });

    it("re-enqueues retry for fan-out event when retries remain", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 2,
      });

      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          eventId: "evt-fanout-001",
          endpointId: "ep-001",
          attemptNumber: 3,
        }),
        expect.any(Number),
      );
      expect(mockUpdateFanoutEventStatus).not.toHaveBeenCalled();
      expect(mockUpdateEventStatus).not.toHaveBeenCalledWith(
        expect.any(String),
        "failed",
      );
    });
  });

  describe("fan-out exception handling", () => {
    it("calls updateFanoutEventStatus after network error exhausts retries", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockDeliverWebhook.mockRejectedValue(new Error("ECONNREFUSED"));
      mockHasRetriesRemaining.mockReturnValue(false);
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockCreateDelivery).toHaveBeenCalledWith(
        expect.objectContaining({
          status: "failed",
          errorMessage: "ECONNREFUSED",
        }),
      );
      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-fanout-001");
    });

    it("re-enqueues after network error when retries remain for fan-out", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockDeliverWebhook.mockRejectedValue(new Error("timeout"));
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
      mockGetConsecutiveFailures.mockResolvedValue(1);
      mockGetEndpointStatusAfterFailure.mockReturnValue("active");

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockEnqueueDelivery).toHaveBeenCalledWith(
        expect.objectContaining({ attemptNumber: 2 }),
        expect.any(Number),
      );
    });
  });

  describe("delivering status is always set", () => {
    it("sets delivering status for fan-out events", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-fanout-001", "delivering");
    });

    it("sets delivering status for single events", async () => {
      mockGetEventById.mockResolvedValue(singleEvent);

      await handleDelivery({
        eventId: "evt-single-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEventStatus).toHaveBeenCalledWith("evt-single-001", "delivering");
    });
  });

  describe("idempotency — duplicate delivery skip", () => {
    it("skips delivery for fan-out event already delivered to this endpoint", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockGetSuccessfulDelivery.mockResolvedValue({ id: "del-existing" });

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockDeliverWebhook).not.toHaveBeenCalled();
      expect(mockCreateDelivery).not.toHaveBeenCalled();
      expect(mockUpdateFanoutEventStatus).not.toHaveBeenCalled();
    });
  });

  describe("fan-out endpoint recovery", () => {
    it("recovers degraded endpoint after successful fan-out delivery", async () => {
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        status: "degraded",
      });

      await handleDelivery({
        eventId: "evt-fanout-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateEndpoint).toHaveBeenCalledWith("ep-001", {
        status: "active",
      });
      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-fanout-001");
    });
  });
});
