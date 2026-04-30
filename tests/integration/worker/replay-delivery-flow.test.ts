import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db/queries", () => ({
  getSuccessfulDelivery: vi.fn(),
  getEventById: vi.fn(),
  getEndpointById: vi.fn(),
  createDelivery: vi.fn(),
  updateEventStatus: vi.fn(),
  getConsecutiveFailures: vi.fn(),
  updateEndpoint: vi.fn(),
  getUserById: vi.fn(),
  getLastErrorForEndpoint: vi.fn(),
}));

vi.mock("@/server/services/delivery", () => ({
  deliverWebhook: vi.fn(),
  isSuccessfulDelivery: vi.fn((code: number) => code >= 200 && code < 300),
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(),
  enqueueDeadLetter: vi.fn(),
}));

vi.mock("@/server/redis", () => ({
  getRedis: () => ({
    exists: vi.fn().mockResolvedValue(0),
    set: vi.fn().mockResolvedValue("OK"),
    scan: vi.fn().mockResolvedValue(["0", []]),
    del: vi.fn().mockResolvedValue(0),
  }),
}));

vi.mock("@/server/services/email", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/email")>("@/server/services/email");
  return {
    ...actual,
    sendFailureAlert: vi.fn().mockResolvedValue({ success: true, provider: "log" }),
  };
});

import { handleDelivery } from "@/server/queue/handlers";
import {
  getSuccessfulDelivery,
  getEventById,
  getEndpointById,
  createDelivery,
  updateEventStatus,
  getConsecutiveFailures,
  getUserById,
} from "@/server/db/queries";
import { deliverWebhook } from "@/server/services/delivery";
import { enqueueDelivery } from "@/server/queue/producer";

const originalEvent = {
  id: "evt-original-001",
  userId: "user-001",
  endpointId: "ep-001",
  endpointGroupId: null,
  deliveryMode: "direct" as const,
  eventType: "payment.created",
  payload: { amount: 100, currency: "usd" },
  metadata: {},
  source: null,
  idempotencyKey: null,
  status: "delivered" as const,
  replayedFromEventId: null,
  createdAt: new Date("2025-01-15T10:00:00Z"),
};

const replayedEvent = {
  id: "evt-replay-001",
  userId: "user-001",
  endpointId: "ep-001",
  endpointGroupId: null,
  deliveryMode: "direct" as const,
  eventType: "payment.created",
  payload: { amount: 100, currency: "usd" },
  metadata: {},
  source: null,
  idempotencyKey: "replay:evt-original-001:1700000000000",
  status: "queued" as const,
  replayedFromEventId: "evt-original-001",
  createdAt: new Date("2025-01-15T12:00:00Z"),
};

const mockEndpoint = {
  id: "ep-001",
  userId: "user-001",
  url: "https://example.com/webhook",
  name: "Production Endpoint",
  description: null,
  signingSecret: "whsec_testsecret123",
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

const successfulDeliveryResult = {
  statusCode: 200,
  responseBody: '{"ok": true}',
  responseHeaders: { "content-type": "application/json" },
  durationMs: 120,
  requestHeaders: {
    "content-type": "application/json",
    "x-hookrelay-event-id": "evt-replay-001",
    "x-hookrelay-signature": "t=1700000000,v1=abc123",
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
  vi.mocked(getEventById).mockResolvedValue(replayedEvent);
  vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
  vi.mocked(deliverWebhook).mockResolvedValue(successfulDeliveryResult);
  vi.mocked(createDelivery).mockResolvedValue({} as never);
  vi.mocked(updateEventStatus).mockResolvedValue(undefined as never);
  vi.mocked(getConsecutiveFailures).mockResolvedValue(0);
  vi.mocked(getUserById).mockResolvedValue({
    id: "user-001",
    email: "dev@example.com",
    name: "Dev",
  });
});

describe("handleDelivery — replay flow", () => {
  it("tags delivery as isReplay=true when event is a replay", async () => {
    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-replay-001",
        endpointId: "ep-001",
        userId: "user-001",
        attemptNumber: 1,
        status: "success",
        isReplay: true,
      }),
    );
  });

  it("tags delivery as isReplay=false for original events", async () => {
    vi.mocked(getEventById).mockResolvedValue(originalEvent);

    await handleDelivery({
      eventId: "evt-original-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        isReplay: false,
      }),
    );
  });

  it("tags failed delivery as isReplay=true when event is a replay", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...successfulDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        isReplay: true,
      }),
    );
  });

  it("tags error delivery as isReplay=true when event is a replay", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("ECONNREFUSED"));
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "ECONNREFUSED",
        isReplay: true,
      }),
    );
  });

  it("delivers the replayed event payload to the endpoint", async () => {
    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(deliverWebhook).toHaveBeenCalledWith(
      "https://example.com/webhook",
      { amount: 100, currency: "usd" },
      "whsec_testsecret123",
      "evt-replay-001",
      null,
    );
  });

  it("updates replayed event status to delivered on success", async () => {
    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-replay-001", "delivering");
    expect(updateEventStatus).toHaveBeenCalledWith("evt-replay-001", "delivered");
  });

  it("enqueues retry for replayed event on failure", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...successfulDeliveryResult,
      statusCode: 503,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-replay-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-replay-001",
        endpointId: "ep-001",
        attemptNumber: 2,
      }),
      expect.any(Number),
    );
  });
});
