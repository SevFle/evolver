import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(null);
const mockGetEventById = vi.fn();
const mockGetEndpointById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue(undefined);
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateFanoutEventStatus = vi.fn().mockResolvedValue(undefined);

vi.mock("@/server/db/queries", () => ({
  getEndpointById: (...args: unknown[]) => mockGetEndpointById(...args),
  getEventById: (...args: unknown[]) => mockGetEventById(...args),
  createDelivery: (...args: unknown[]) => mockCreateDelivery(...args),
  updateEventStatus: (...args: unknown[]) => mockUpdateEventStatus(...args),
  getSuccessfulDelivery: (...args: unknown[]) => mockGetSuccessfulDelivery(...args),
  updateFanoutEventStatus: (...args: unknown[]) => mockUpdateFanoutEventStatus(...args),
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

const mockProcessFailureAlert = vi.fn();
const mockResetAlertStateOnSuccess = vi.fn().mockResolvedValue(false);

vi.mock("@/server/services/alerting", () => ({
  processFailureAlert: (...args: unknown[]) => mockProcessFailureAlert(...args),
  resetAlertStateOnSuccess: (...args: unknown[]) => mockResetAlertStateOnSuccess(...args),
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
    mockUpdateFanoutEventStatus.mockResolvedValue(undefined);
    mockProcessFailureAlert.mockResolvedValue({
      status: "active",
      alertSent: false,
      alertSkippedReason: "below_threshold",
    });
    mockResetAlertStateOnSuccess.mockResolvedValue(false);
    mockDeliverWebhook.mockResolvedValue(baseDeliveryResult);
    mockIsSuccessfulDelivery.mockReturnValue(false);
    mockHasRetriesRemaining.mockReturnValue(true);
    mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
  });

  describe("alerting integration", () => {
    it("calls processFailureAlert on delivery failure", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);
      mockProcessFailureAlert.mockResolvedValue({
        status: "degraded",
        alertSent: true,
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockProcessFailureAlert).toHaveBeenCalledWith({
        endpointId: "ep-001",
        endpointName: "Test Endpoint",
        endpointUrl: "https://example.com/webhook",
        userId: "user-001",
      });
    });

    it("calls processFailureAlert even on exception path", async () => {
      mockDeliverWebhook.mockRejectedValue(new Error("Network timeout"));
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));

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

    it("calls resetAlertStateOnSuccess on successful delivery", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockResetAlertStateOnSuccess).toHaveBeenCalledWith("ep-001", "active");
    });

    it("calls resetAlertStateOnSuccess for degraded endpoint on success", async () => {
      const degradedEndpoint = { ...baseEndpoint, status: "degraded" as const };
      mockGetEndpointById.mockResolvedValue(degradedEndpoint);
      mockIsSuccessfulDelivery.mockReturnValue(true);
      mockResetAlertStateOnSuccess.mockResolvedValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockResetAlertStateOnSuccess).toHaveBeenCalledWith("ep-001", "degraded");
    });

    it("does not call processFailureAlert on successful delivery", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockProcessFailureAlert).not.toHaveBeenCalled();
    });
  });

  describe("retry and dead letter behavior", () => {
    it("enqueues retry when retries remain", async () => {
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(true);
      mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));

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
  });

  describe("fanout events", () => {
    it("uses updateFanoutEventStatus for fanout event on failure", async () => {
      const fanoutEvent = { ...baseEvent, endpointGroupId: "group-001" };
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockIsSuccessfulDelivery.mockReturnValue(false);
      mockHasRetriesRemaining.mockReturnValue(false);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 5,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-001");
    });

    it("uses updateFanoutEventStatus for fanout event on success", async () => {
      const fanoutEvent = { ...baseEvent, endpointGroupId: "group-001" };
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockIsSuccessfulDelivery.mockReturnValue(true);

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-001");
    });

    it("uses updateFanoutEventStatus for disabled endpoint on fanout", async () => {
      const fanoutEvent = { ...baseEvent, endpointGroupId: "group-001" };
      mockGetEventById.mockResolvedValue(fanoutEvent);
      mockGetEndpointById.mockResolvedValue({
        ...baseEndpoint,
        status: "disabled",
      });

      await handleDelivery({
        eventId: "evt-001",
        endpointId: "ep-001",
        attemptNumber: 1,
      });

      expect(mockUpdateFanoutEventStatus).toHaveBeenCalledWith("evt-001");
    });
  });
});
