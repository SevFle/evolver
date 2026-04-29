import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db/queries", () => ({
  getEventById: vi.fn(),
  getEndpointById: vi.fn(),
  createReplayEvent: vi.fn(),
  createEvent: vi.fn(),
  getEventsByEndpointId: vi.fn(),
  getEventsByUserId: vi.fn(),
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(),
}));

import { createCallerFactory } from "@/server/trpc/init";
import {
  getEventById,
  getEndpointById,
  createReplayEvent,
} from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { eventRouter } from "@/server/trpc/routers/events";

const mockedGetEventById = vi.mocked(getEventById);
const mockedGetEndpointById = vi.mocked(getEndpointById);
const mockedCreateReplayEvent = vi.mocked(createReplayEvent);
const mockedEnqueueDelivery = vi.mocked(enqueueDelivery);

const createCaller = createCallerFactory(eventRouter);

const ORIGINAL_EVENT_ID = "a0000000-0000-0000-0000-000000000001";
const REPLAYED_EVENT_ID = "a0000000-0000-0000-0000-000000000002";
const NONEXISTENT_EVENT_ID = "a0000000-0000-0000-0000-000000000099";
const ENDPOINT_ID = "b0000000-0000-0000-0000-000000000001";
const USER_ID = "c0000000-0000-0000-0000-000000000001";
const OTHER_USER_ID = "c0000000-0000-0000-0000-000000000002";

const originalEvent = {
  id: ORIGINAL_EVENT_ID,
  userId: USER_ID,
  endpointId: ENDPOINT_ID,
  eventType: "payment.created",
  payload: { amount: 100, currency: "usd" },
  metadata: { source: "stripe" },
  source: "stripe",
  idempotencyKey: "orig-key-123",
  status: "delivered" as const,
  replayedFromEventId: null,
  createdAt: new Date("2025-01-15T10:00:00Z"),
};

const activeEndpoint = {
  id: ENDPOINT_ID,
  userId: USER_ID,
  url: "https://example.com/webhook",
  name: "Production Endpoint",
  description: null,
  signingSecret: "whsec_testsecret",
  status: "active" as const,
  customHeaders: null,
  isActive: true,
  disabledReason: null,
  consecutiveFailures: 0,
  maxRetries: 5,
  retrySchedule: [60, 300, 1800, 7200, 43200],
  rateLimit: null,
  deletedAt: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const replayedEvent = {
  id: REPLAYED_EVENT_ID,
  userId: USER_ID,
  endpointId: ENDPOINT_ID,
  eventType: "payment.created",
  payload: { amount: 100, currency: "usd" },
  metadata: { source: "stripe" },
  source: "stripe",
  idempotencyKey: `replay:${ORIGINAL_EVENT_ID}:1700000000000`,
  status: "queued" as const,
  replayedFromEventId: ORIGINAL_EVENT_ID,
  createdAt: new Date("2025-01-15T12:00:00Z"),
};

describe("event.replay mutation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, "now").mockReturnValue(1700000000000);
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Authentication required");
  });

  it("throws NOT_FOUND when event does not exist", async () => {
    mockedGetEventById.mockResolvedValue(null);
    const caller = createCaller({ userId: USER_ID });

    await expect(
      caller.replay({ eventId: NONEXISTENT_EVENT_ID }),
    ).rejects.toThrow("Event not found");
    expect(mockedGetEndpointById).not.toHaveBeenCalled();
    expect(mockedCreateReplayEvent).not.toHaveBeenCalled();
    expect(mockedEnqueueDelivery).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND when event belongs to another user", async () => {
    mockedGetEventById.mockResolvedValue(null);
    const caller = createCaller({ userId: OTHER_USER_ID });

    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Event not found");
  });

  it("throws NOT_FOUND when endpoint no longer exists", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue(null);
    const caller = createCaller({ userId: USER_ID });

    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Endpoint not found");
    expect(mockedCreateReplayEvent).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when endpoint is disabled", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue({
      ...activeEndpoint,
      status: "disabled",
    } as never);
    const caller = createCaller({ userId: USER_ID });

    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Endpoint is disabled or inactive");
    expect(mockedCreateReplayEvent).not.toHaveBeenCalled();
  });

  it("throws PRECONDITION_FAILED when endpoint is inactive", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue({
      ...activeEndpoint,
      isActive: false,
    } as never);
    const caller = createCaller({ userId: USER_ID });

    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Endpoint is disabled or inactive");
    expect(mockedCreateReplayEvent).not.toHaveBeenCalled();
  });

  it("throws INTERNAL_SERVER_ERROR when replay event creation fails", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue(activeEndpoint as never);
    mockedCreateReplayEvent.mockResolvedValue(undefined as never);
    const caller = createCaller({ userId: USER_ID });

    await expect(
      caller.replay({ eventId: ORIGINAL_EVENT_ID }),
    ).rejects.toThrow("Failed to create replay event");
  });

  it("creates replay event with original payload and fresh idempotency key", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue(activeEndpoint as never);
    mockedCreateReplayEvent.mockResolvedValue(replayedEvent as never);
    mockedEnqueueDelivery.mockResolvedValue("job-001");
    const caller = createCaller({ userId: USER_ID });

    const result = await caller.replay({ eventId: ORIGINAL_EVENT_ID });

    expect(mockedCreateReplayEvent).toHaveBeenCalledWith({
      userId: USER_ID,
      endpointId: ENDPOINT_ID,
      payload: { amount: 100, currency: "usd" },
      eventType: "payment.created",
      metadata: { source: "stripe" },
      source: "stripe",
      idempotencyKey: `replay:${ORIGINAL_EVENT_ID}:1700000000000`,
      replayedFromEventId: ORIGINAL_EVENT_ID,
    });

    expect(result.id).toBe(REPLAYED_EVENT_ID);
    expect(result.replayedFromEventId).toBe(ORIGINAL_EVENT_ID);
    expect(result.eventType).toBe("payment.created");
  });

  it("enqueues delivery job for the replayed event", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue(activeEndpoint as never);
    mockedCreateReplayEvent.mockResolvedValue(replayedEvent as never);
    mockedEnqueueDelivery.mockResolvedValue("job-001");
    const caller = createCaller({ userId: USER_ID });

    await caller.replay({ eventId: ORIGINAL_EVENT_ID });

    expect(mockedEnqueueDelivery).toHaveBeenCalledWith({
      eventId: REPLAYED_EVENT_ID,
      endpointId: ENDPOINT_ID,
      attemptNumber: 1,
    });
  });

  it("handles event with null metadata and source", async () => {
    const eventWithNulls = {
      ...originalEvent,
      metadata: null,
      source: null,
    };
    mockedGetEventById.mockResolvedValue(eventWithNulls as never);
    mockedGetEndpointById.mockResolvedValue(activeEndpoint as never);
    mockedCreateReplayEvent.mockResolvedValue(replayedEvent as never);
    mockedEnqueueDelivery.mockResolvedValue("job-001");
    const caller = createCaller({ userId: USER_ID });

    await caller.replay({ eventId: ORIGINAL_EVENT_ID });

    expect(mockedCreateReplayEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: null,
        source: null,
      }),
    );
  });

  it("generates unique idempotency key per replay using timestamp", async () => {
    mockedGetEventById.mockResolvedValue(originalEvent as never);
    mockedGetEndpointById.mockResolvedValue(activeEndpoint as never);
    mockedCreateReplayEvent.mockResolvedValue(replayedEvent as never);
    mockedEnqueueDelivery.mockResolvedValue("job-001");
    const caller = createCaller({ userId: USER_ID });

    await caller.replay({ eventId: ORIGINAL_EVENT_ID });

    const calledWith = mockedCreateReplayEvent.mock.calls[0]![0];
    expect(calledWith.idempotencyKey).toMatch(
      new RegExp(`^replay:${ORIGINAL_EVENT_ID}:\\d+$`),
    );
    expect(calledWith.idempotencyKey).not.toBe(
      originalEvent.idempotencyKey,
    );
  });
});
