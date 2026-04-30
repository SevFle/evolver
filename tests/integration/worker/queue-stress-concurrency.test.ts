import { describe, it, expect, vi, beforeEach } from "vitest";

// Issue #6: queue/circuit reliability under concurrent load. These tests
// fire parallel deliveries and assert the queue subsystem handles each one
// independently — no swallowed failures, no double-counted successes, no
// dropped circuit-breaker observations under contention.

const mockGetSuccessfulDelivery = vi.fn().mockResolvedValue(false);
const mockGetEventById = vi.fn();
const mockGetEndpointById = vi.fn();
const mockCreateDelivery = vi.fn().mockResolvedValue({});
const mockUpdateEventStatus = vi.fn().mockResolvedValue(undefined);
const mockUpdateFanoutEventStatus = vi.fn().mockResolvedValue(undefined);
const mockGetLastActualDeliveryTimeByEndpoint = vi.fn();
const mockGetConsecutiveFailures = vi.fn().mockResolvedValue(0);
const mockUpdateEndpoint = vi.fn().mockResolvedValue(undefined);

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
  getConsecutiveFailures: (...args: unknown[]) =>
    mockGetConsecutiveFailures(...args),
  updateEndpoint: (...args: unknown[]) => mockUpdateEndpoint(...args),
  getUserById: vi.fn().mockResolvedValue({
    id: "user-001",
    email: "dev@example.com",
  }),
  getLastErrorForEndpoint: vi.fn().mockResolvedValue(null),
  countCircuitOpenRetries: vi.fn().mockResolvedValue(0),
  deleteDeliveryById: vi.fn().mockResolvedValue(undefined),
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

const mockEnqueueDelivery = vi.fn().mockResolvedValue("job-1");
const mockEnqueueDeadLetter = vi.fn().mockResolvedValue("dlq-1");

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: (...args: unknown[]) => mockEnqueueDelivery(...args),
  enqueueDeadLetter: (...args: unknown[]) => mockEnqueueDeadLetter(...args),
}));

import { handleDelivery } from "@/server/queue/handlers";

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

function makeEvent(idx: number) {
  return {
    id: `evt-${String(idx).padStart(4, "0")}`,
    endpointId: "ep-001",
    endpointGroupId: null,
    deliveryMode: "direct" as const,
    payload: { idx },
    eventType: "test.event",
    status: "queued" as const,
    userId: "user-001",
    source: null,
    idempotencyKey: null,
    metadata: {},
    replayedFromEventId: null,
    createdAt: new Date(),
  };
}

const failureResult = {
  statusCode: 500,
  responseBody: "Internal Server Error",
  responseHeaders: {},
  requestHeaders: {},
  durationMs: 150,
};

const successResult = {
  statusCode: 200,
  responseBody: '{"ok":true}',
  responseHeaders: {},
  requestHeaders: {},
  durationMs: 100,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});

  mockGetSuccessfulDelivery.mockResolvedValue(false);
  mockGetEndpointById.mockResolvedValue(baseEndpoint);
  mockCreateDelivery.mockResolvedValue({});
  mockUpdateEventStatus.mockResolvedValue(undefined);
  mockGetLastActualDeliveryTimeByEndpoint.mockResolvedValue(null);
  mockHasRetriesRemaining.mockReturnValue(true);
  mockGetNextRetryAt.mockReturnValue(new Date(Date.now() + 60000));
  mockProcessFailureAlert.mockResolvedValue({
    status: "active",
    alertSent: false,
    alertSkippedReason: "below_threshold",
  });
  mockResetAlertStateOnSuccess.mockResolvedValue(false);
});

describe("Queue concurrency — N parallel deliveries against the same endpoint", () => {
  it("processes 20 parallel failures without dropping any", async () => {
    const N = 20;
    mockDeliverWebhook.mockResolvedValue(failureResult);
    mockIsSuccessfulDelivery.mockReturnValue(false);

    const events = Array.from({ length: N }, (_, i) => makeEvent(i));
    mockGetEventById.mockImplementation((id: string) =>
      Promise.resolve(events.find((e) => e.id === id) ?? null),
    );

    const jobs = events.map((e) =>
      handleDelivery({
        eventId: e.id,
        endpointId: "ep-001",
        attempt: 1,
      }),
    );

    await Promise.all(jobs);

    expect(mockDeliverWebhook).toHaveBeenCalledTimes(N);
    expect(mockCreateDelivery).toHaveBeenCalledTimes(N);
    expect(mockProcessFailureAlert).toHaveBeenCalledTimes(N);
  });

  it("processes 20 parallel successes without double-counting", async () => {
    const N = 20;
    mockDeliverWebhook.mockResolvedValue(successResult);
    mockIsSuccessfulDelivery.mockReturnValue(true);

    const events = Array.from({ length: N }, (_, i) => makeEvent(i));
    mockGetEventById.mockImplementation((id: string) =>
      Promise.resolve(events.find((e) => e.id === id) ?? null),
    );

    const jobs = events.map((e) =>
      handleDelivery({
        eventId: e.id,
        endpointId: "ep-001",
        attempt: 1,
      }),
    );

    await Promise.all(jobs);

    expect(mockDeliverWebhook).toHaveBeenCalledTimes(N);
    expect(mockCreateDelivery).toHaveBeenCalledTimes(N);
    expect(mockProcessFailureAlert).not.toHaveBeenCalled();
    expect(mockResetAlertStateOnSuccess).toHaveBeenCalledTimes(N);
  });

  it("mixed parallel results: each delivery counted exactly once", async () => {
    const N = 30;
    let callCount = 0;
    mockDeliverWebhook.mockImplementation(() => {
      callCount += 1;
      return Promise.resolve(callCount % 2 === 0 ? successResult : failureResult);
    });
    mockIsSuccessfulDelivery.mockImplementation(
      (status: number) => status >= 200 && status < 300,
    );

    const events = Array.from({ length: N }, (_, i) => makeEvent(i));
    mockGetEventById.mockImplementation((id: string) =>
      Promise.resolve(events.find((e) => e.id === id) ?? null),
    );

    const jobs = events.map((e) =>
      handleDelivery({
        eventId: e.id,
        endpointId: "ep-001",
        attempt: 1,
      }),
    );

    await Promise.all(jobs);

    expect(mockDeliverWebhook).toHaveBeenCalledTimes(N);
    expect(mockCreateDelivery).toHaveBeenCalledTimes(N);
    const totalAccountedFor =
      mockProcessFailureAlert.mock.calls.length +
      mockResetAlertStateOnSuccess.mock.calls.length;
    expect(totalAccountedFor).toBe(N);
  });
});

describe("Queue concurrency — fault tolerance under contention", () => {
  it("rejected deliverWebhook promises do not crash the worker batch", async () => {
    const N = 10;
    mockDeliverWebhook.mockImplementation(() =>
      Promise.reject(new Error("network down")),
    );
    mockIsSuccessfulDelivery.mockReturnValue(false);

    const events = Array.from({ length: N }, (_, i) => makeEvent(i));
    mockGetEventById.mockImplementation((id: string) =>
      Promise.resolve(events.find((e) => e.id === id) ?? null),
    );

    const jobs = events.map((e) =>
      handleDelivery({
        eventId: e.id,
        endpointId: "ep-001",
        attempt: 1,
      }),
    );

    const settled = await Promise.allSettled(jobs);
    expect(mockDeliverWebhook).toHaveBeenCalledTimes(N);
    expect(settled).toHaveLength(N);
  });

  it("partial endpoint failure (1-of-N missing) does not block the rest", async () => {
    const N = 10;
    mockDeliverWebhook.mockResolvedValue(successResult);
    mockIsSuccessfulDelivery.mockReturnValue(true);

    const events = Array.from({ length: N }, (_, i) => makeEvent(i));
    mockGetEventById.mockImplementation((id: string) =>
      Promise.resolve(events.find((e) => e.id === id) ?? null),
    );

    let endpointCalls = 0;
    mockGetEndpointById.mockImplementation(() => {
      endpointCalls += 1;
      if (endpointCalls === 1) return Promise.resolve(null);
      return Promise.resolve(baseEndpoint);
    });

    const jobs = events.map((e) =>
      handleDelivery({
        eventId: e.id,
        endpointId: "ep-001",
        attempt: 1,
      }),
    );

    const settled = await Promise.allSettled(jobs);
    expect(settled).toHaveLength(N);
    expect(mockDeliverWebhook.mock.calls.length).toBeGreaterThanOrEqual(N - 1);
  });
});
