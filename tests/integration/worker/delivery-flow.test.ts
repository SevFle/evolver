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

const mockRedisStore = new Set<string>();

const mockRedis = {
  exists: vi.fn((key: string) => Promise.resolve(mockRedisStore.has(key) ? 1 : 0)),
  set: vi.fn((...args: unknown[]) => {
    const key = args[0] as string;
    const hasNx = args.includes("NX");
    if (hasNx && mockRedisStore.has(key)) {
      return Promise.resolve(null);
    }
    mockRedisStore.add(key);
    return Promise.resolve("OK");
  }),
  scan: vi.fn((_cursor: string) => {
    const keys = [...mockRedisStore].filter(k => k.startsWith("hookrelay:alert:"));
    return Promise.resolve(["0", keys]);
  }),
  del: vi.fn((...keys: string[]) => {
    keys.forEach(k => mockRedisStore.delete(k));
    return Promise.resolve(keys.length);
  }),
};

vi.mock("@/server/redis", () => ({
  getRedis: () => mockRedis,
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
  updateEndpoint,
  getUserById,
  getLastErrorForEndpoint,
} from "@/server/db/queries";
import { deliverWebhook, isSuccessfulDelivery } from "@/server/services/delivery";
import { enqueueDelivery, enqueueDeadLetter } from "@/server/queue/producer";
import { sendFailureAlert, resetRateLimits } from "@/server/services/email";

const mockEvent = {
  id: "evt-001",
  userId: "user-001",
  endpointId: "ep-001",
  endpointGroupId: null,
  eventType: "test.event",
  payload: { hello: "world" },
  metadata: {},
  source: null,
  idempotencyKey: null,
  status: "queued" as const,
  replayedFromEventId: null,
  createdAt: new Date(),
};

const mockEndpoint = {
  id: "ep-001",
  userId: "user-001",
  url: "https://example.com/webhook",
  name: "Test Endpoint",
  description: null,
  signingSecret: "whsec_testsecret123",
  status: "active" as const,
  customHeaders: { "X-Custom": "value" },
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

const mockDeliveryResult = {
  statusCode: 200,
  responseBody: '{"ok": true}',
  responseHeaders: { "content-type": "application/json" },
  durationMs: 150,
  requestHeaders: {
    "content-type": "application/json",
    "x-hookrelay-event-id": "evt-001",
    "x-hookrelay-signature": "t=1700000000,v1=abc123",
    "x-custom": "value",
  },
};

beforeEach(async () => {
  mockRedisStore.clear();
  vi.clearAllMocks();
  await resetRateLimits();
  vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
  vi.mocked(getEventById).mockResolvedValue(mockEvent);
  vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
  vi.mocked(deliverWebhook).mockResolvedValue(mockDeliveryResult);
  vi.mocked(createDelivery).mockResolvedValue({} as never);
  vi.mocked(updateEventStatus).mockResolvedValue(undefined as never);
  vi.mocked(getConsecutiveFailures).mockResolvedValue(0);
  vi.mocked(updateEndpoint).mockResolvedValue(undefined as never);
  vi.mocked(enqueueDelivery).mockResolvedValue("job-123");
  vi.mocked(enqueueDeadLetter).mockResolvedValue("dlq-123");
  vi.mocked(getUserById).mockResolvedValue({ id: "user-001", email: "dev@example.com", name: "Dev" });
  vi.mocked(getLastErrorForEndpoint).mockResolvedValue("Connection refused");
  vi.mocked(sendFailureAlert).mockResolvedValue({ success: true, provider: "log" });
});

describe("handleDelivery - full delivery flow", () => {
  it("delivers webhook successfully on first attempt", async () => {
    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-001", "ep-001");
    expect(getEventById).toHaveBeenCalledWith("evt-001");
    expect(getEndpointById).toHaveBeenCalledWith("ep-001");
    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "delivering");
    expect(deliverWebhook).toHaveBeenCalledWith(
      "https://example.com/webhook",
      { hello: "world" },
      "whsec_testsecret123",
      "evt-001",
      { "X-Custom": "value" },
    );
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-001",
        endpointId: "ep-001",
        userId: "user-001",
        attemptNumber: 1,
        responseStatusCode: 200,
        status: "success",
        completedAt: expect.any(Date),
        requestHeaders: expect.any(Object),
        durationMs: 150,
      }),
    );
    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "delivered");
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });

  it("skips delivery if already successfully delivered (idempotency)", async () => {
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(true);

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-001", "ep-001");
    expect(deliverWebhook).not.toHaveBeenCalled();
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("returns early when event not found", async () => {
    vi.mocked(getEventById).mockResolvedValue(null);

    await handleDelivery({
      eventId: "evt-missing",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(deliverWebhook).not.toHaveBeenCalled();
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("returns early and marks event failed when endpoint is disabled", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      status: "disabled",
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("returns early and marks event failed when endpoint is inactive", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      isActive: false,
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
    expect(deliverWebhook).not.toHaveBeenCalled();
  });

  it("re-enqueues with delay on non-2xx response", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        responseStatusCode: 500,
        completedAt: null,
      }),
    );
    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 2 },
      expect.any(Number),
    );
    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "delivering");
    expect(updateEventStatus).not.toHaveBeenCalledWith("evt-001", "delivered");
  });

  it("moves to dead-letter queue when retries exhausted", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 502,
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 5,
    });

    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 5 },
      "Max retries (5) exhausted",
    );
    expect(updateEventStatus).toHaveBeenCalledWith("evt-001", "failed");
  });

  it("records error message on network failure", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("ECONNREFUSED"));

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: "ECONNREFUSED",
        requestHeaders: expect.objectContaining({
          "Content-Type": "application/json",
          "X-HookRelay-Event-ID": "evt-001",
        }),
      }),
    );
    expect(enqueueDelivery).toHaveBeenCalled();
  });

  it("records generic error message for non-Error throws", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue("string error");

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        errorMessage: "Unknown delivery error",
      }),
    );
  });

  it("triggers circuit breaker on consecutive failures", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "degraded",
    });
  });

  it("sends email alert when circuit breaker triggers", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: "ep-001",
        endpointName: "Test Endpoint",
        endpointUrl: "https://example.com/webhook",
        failureCount: 5,
        userEmail: "dev@example.com",
      }),
    );
  });

  it("sends alert even when consecutive failures exceed threshold", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(6);

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "degraded",
    });
    expect(sendFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: "ep-001",
        failureCount: 6,
      }),
    );
  });

  it("does not send alert when rate limited for same endpoint", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);

    const { markSent } = await import("@/server/services/email");
    await markSent("ep-001");

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).not.toHaveBeenCalled();
  });

  it("resets endpoint status to active after successful delivery from degraded", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      status: "degraded",
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "active",
    });
  });

  it("does not update endpoint status when already active and delivery succeeds", async () => {
    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).not.toHaveBeenCalled();
  });

  it("passes custom headers to deliverWebhook", async () => {
    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(deliverWebhook).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      { "X-Custom": "value" },
    );
  });

  it("handles endpoint with null custom headers", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      customHeaders: null,
    });

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(deliverWebhook).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
      expect.any(String),
      expect.any(String),
      null,
    );
  });

  it("re-enqueues with proper delay for retry attempts", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("timeout"));

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 3,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-001", endpointId: "ep-001", attemptNumber: 4 },
      expect.any(Number),
    );
    const delay = vi.mocked(enqueueDelivery).mock.calls[0]![1]!;
    expect(delay).toBeGreaterThan(0);
  });

  it("records request headers from delivery result on success", async () => {
    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        requestHeaders: mockDeliveryResult.requestHeaders,
      }),
    );
  });
  it("clears rate limit key when sendFailureAlert fails", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);
    vi.mocked(sendFailureAlert).mockResolvedValueOnce({ success: false, provider: "resend", error: "RESEND_API_KEY not configured" });
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    expect(sendFailureAlert).toHaveBeenCalled();
    expect(mockRedisStore.has("hookrelay:alert:ep-001")).toBe(false);
  });

  it("clears rate limit key when alert sending throws", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);
    vi.mocked(getUserById).mockRejectedValueOnce(new Error("DB connection lost"));
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    expect(mockRedisStore.has("hookrelay:alert:ep-001")).toBe(false);
  });

  it("clears rate limit key when user not found", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue({
      ...mockDeliveryResult,
      statusCode: 500,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(5);
    vi.mocked(getUserById).mockResolvedValueOnce(null);
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    expect(mockRedisStore.has("hookrelay:alert:ep-001")).toBe(false);
  });
});

describe("handleDelivery - retry sequence", () => {
  it("allows retries up to attempt 5 and moves to dead-letter at attempt 6+", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("fail"));

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 4,
    });
    expect(enqueueDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 5 }),
      expect.any(Number),
    );
    expect(enqueueDeadLetter).not.toHaveBeenCalled();

    vi.clearAllMocks();
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
    vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("fail"));
    vi.mocked(createDelivery).mockResolvedValue({} as never);
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-001",
      endpointId: "ep-001",
      attemptNumber: 5,
    });
    expect(enqueueDeadLetter).toHaveBeenCalled();
    expect(enqueueDelivery).not.toHaveBeenCalled();
  });
});
