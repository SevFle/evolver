import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

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
  updateFanoutEventStatus: vi.fn(),
}));

vi.mock("@/server/services/delivery", () => ({
  deliverWebhook: vi.fn().mockResolvedValue({
    statusCode: 500,
    responseBody: "Internal Server Error",
    responseHeaders: { "content-type": "text/plain" },
    durationMs: 302,
    requestHeaders: { "content-type": "application/json" },
  }),
  isSuccessfulDelivery: vi.fn((code: number) => code >= 200 && code < 300),
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn().mockResolvedValue("job-int-123"),
  enqueueDeadLetter: vi.fn().mockResolvedValue("dlq-int-123"),
}));

const mockRedisStore = new Set<string>();

vi.mock("@/server/redis", () => ({
  getRedis: () => ({
    exists: vi.fn((key: string) => Promise.resolve(mockRedisStore.has(key) ? 1 : 0)),
    set: vi.fn((...args: unknown[]) => {
      const key = args[0] as string;
      const hasNx = args.includes("NX");
      if (hasNx && mockRedisStore.has(key)) return Promise.resolve(null);
      mockRedisStore.add(key);
      return Promise.resolve("OK");
    }),
    scan: vi.fn(() => {
      const keys = [...mockRedisStore].filter((k) => k.startsWith("hookrelay:alert:"));
      return Promise.resolve(["0", keys]);
    }),
    del: vi.fn((...keys: string[]) => {
      keys.forEach((k) => mockRedisStore.delete(k));
      return Promise.resolve(keys.length);
    }),
  }),
}));

vi.mock("@/server/services/email", async () => {
  const actual = await vi.importActual<typeof import("@/server/services/email")>(
    "@/server/services/email",
  );
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
  updateFanoutEventStatus,
} from "@/server/db/queries";
import { deliverWebhook } from "@/server/services/delivery";
import { signPayload, verifySignature } from "@/server/services/signing";
import {
  getRetryDelay,
  getNextRetryAt,
  hasRetriesRemaining,
} from "@/server/services/retry";
import { enqueueDelivery, enqueueDeadLetter } from "@/server/queue/producer";
import { sendFailureAlert, resetRateLimits } from "@/server/services/email";
import { RETRY_SCHEDULE, MAX_RETRY_ATTEMPTS, CIRCUIT_BREAKER_THRESHOLD } from "@/lib/constants";

const mockEvent = {
  id: "evt-int-001",
  userId: "user-001",
  endpointId: "ep-001",
  endpointGroupId: null,
  deliveryMode: "direct" as const,
  eventType: "payment.created",
  payload: { amount: 5000, currency: "usd", id: "pay_123" },
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
  url: "https://api.customer.com/webhooks",
  name: "Production Webhook",
  description: null,
  signingSecret: "whsec_testsecret123abc",
  status: "active" as const,
  customHeaders: { "X-Api-Version": "2024-01" },
  isActive: true,
  disabledReason: null,
  consecutiveFailures: 0,
  maxRetries: 5,
  retrySchedule: [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000],
  rateLimit: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const delivery200 = {
  statusCode: 200,
  responseBody: '{"received": true}',
  responseHeaders: { "content-type": "application/json" },
  durationMs: 145,
  requestHeaders: {
    "content-type": "application/json",
    "x-hookrelay-signature": "t=1700000000,v1=abc",
    "x-hookrelay-event-id": "evt-int-001",
  },
};

const delivery500 = {
  statusCode: 500,
  responseBody: "Internal Server Error",
  responseHeaders: { "content-type": "text/plain" },
  durationMs: 302,
  requestHeaders: {
    "content-type": "application/json",
    "x-hookrelay-signature": "t=1700000000,v1=abc",
    "x-hookrelay-event-id": "evt-int-001",
  },
};

beforeEach(async () => {
  mockRedisStore.clear();
  vi.clearAllMocks();
  await resetRateLimits();

  vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
  vi.mocked(getEventById).mockResolvedValue(mockEvent);
  vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
  vi.mocked(deliverWebhook).mockResolvedValue(delivery500);
  vi.mocked(createDelivery).mockResolvedValue({} as never);
  vi.mocked(updateEventStatus).mockResolvedValue(undefined as never);
  vi.mocked(getConsecutiveFailures).mockResolvedValue(0);
  vi.mocked(updateEndpoint).mockResolvedValue(undefined as never);
  vi.mocked(getUserById).mockResolvedValue({
    id: "user-001",
    email: "dev@example.com",
    name: "Dev",
  });
  vi.mocked(getLastErrorForEndpoint).mockResolvedValue("HTTP 500");
  vi.mocked(enqueueDelivery).mockResolvedValue("job-int-123");
  vi.mocked(enqueueDeadLetter).mockResolvedValue("dlq-int-123");
  vi.mocked(sendFailureAlert).mockResolvedValue({ success: true, provider: "log" });

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("HMAC-SHA256 signing integration", () => {
  it("signs payload with correct HMAC-SHA256 format", () => {
    const payload = JSON.stringify({ hello: "world" });
    const secret = "whsec_testsecret";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(payload, secret, timestamp);

    expect(signature).toMatch(/^t=\d+,v1=[a-f0-9]{64}$/);
    expect(signature).toContain(`t=${timestamp}`);
  });

  it("produces verifiable signatures", () => {
    const payload = JSON.stringify({ event: "test", data: { id: 1 } });
    const secret = "whsec_verify_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(payload, secret, timestamp);

    expect(verifySignature(payload, secret, signature)).toBe(true);
  });

  it("rejects tampered payload", () => {
    const payload = JSON.stringify({ amount: 100 });
    const tampered = JSON.stringify({ amount: 999 });
    const secret = "whsec_tamper_test";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(payload, secret, timestamp);

    expect(verifySignature(tampered, secret, signature)).toBe(false);
  });

  it("rejects wrong secret", () => {
    const payload = JSON.stringify({ test: true });
    const secret = "whsec_correct";
    const wrongSecret = "whsec_wrong";
    const timestamp = Math.floor(Date.now() / 1000);
    const signature = signPayload(payload, secret, timestamp);

    expect(verifySignature(payload, wrongSecret, signature)).toBe(false);
  });

  it("signs using t.timestamp.payload format internally", () => {
    const payload = "test-payload";
    const secret = "whsec_internal_test";
    const timestamp = 1700000000;
    const signature = signPayload(payload, secret, timestamp);

    const expectedSignedPayload = `${timestamp}.${payload}`;
    const expectedHash = createHmac("sha256", secret)
      .update(expectedSignedPayload)
      .digest("hex");

    expect(signature).toBe(`t=${timestamp},v1=${expectedHash}`);
  });

  it("signatures differ for different timestamps", () => {
    const payload = JSON.stringify({ data: "test" });
    const secret = "whsec_ts_test";
    const sig1 = signPayload(payload, secret, 1700000000);
    const sig2 = signPayload(payload, secret, 1700000001);

    expect(sig1).not.toBe(sig2);
  });
});

describe("exponential backoff retry scheduling", () => {
  it("default schedule follows exponential backoff pattern", () => {
    const schedule = RETRY_SCHEDULE;
    for (let i = 1; i < schedule.length; i++) {
      expect(schedule[i]!).toBeGreaterThan(schedule[i - 1]!);
    }
  });

  it("default schedule is: 1m, 5m, 30m, 2h, 12h", () => {
    expect(RETRY_SCHEDULE).toEqual([
      60_000,
      300_000,
      1_800_000,
      7_200_000,
      43_200_000,
    ]);
  });

  it("getRetryDelay returns increasing delays for each attempt", () => {
    for (let i = 2; i <= MAX_RETRY_ATTEMPTS; i++) {
      expect(getRetryDelay(i)).toBeGreaterThan(getRetryDelay(i - 1));
    }
  });

  it("getNextRetryAt returns dates in increasing order", () => {
    const retries = [];
    for (let i = 1; i <= MAX_RETRY_ATTEMPTS; i++) {
      retries.push(getNextRetryAt(i));
    }
    for (let i = 1; i < retries.length; i++) {
      expect(retries[i]!.getTime()).toBeGreaterThan(retries[i - 1]!.getTime());
    }
  });

  it("custom endpoint schedule overrides default", () => {
    const customSchedule = [10_000, 60_000, 300_000];
    expect(getRetryDelay(1, customSchedule)).toBe(10_000);
    expect(getRetryDelay(2, customSchedule)).toBe(60_000);
    expect(getRetryDelay(3, customSchedule)).toBe(300_000);
    expect(getRetryDelay(4, customSchedule)).toBe(300_000);
  });

  it("custom maxRetries overrides default", () => {
    expect(hasRetriesRemaining(3, 3)).toBe(true);
    expect(hasRetriesRemaining(4, 3)).toBe(false);
    expect(hasRetriesRemaining(7, 10)).toBe(true);
  });
});

describe("full delivery flow — success path", () => {
  it("completes delivery on first attempt with 2xx response", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue(delivery200);
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 3,
      retrySchedule: [10_000, 30_000, 60_000],
    });

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-int-001", "ep-001");
    expect(getEventById).toHaveBeenCalledWith("evt-int-001");
    expect(getEndpointById).toHaveBeenCalledWith("ep-001");
    expect(updateEventStatus).toHaveBeenCalledWith("evt-int-001", "delivering");
    expect(updateEventStatus).toHaveBeenCalledWith("evt-int-001", "delivered");
    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-int-001",
        endpointId: "ep-001",
        userId: "user-001",
        attemptNumber: 1,
        status: "success",
        completedAt: expect.any(Date),
      }),
    );
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });
});

describe("full delivery flow — retry sequence with exponential backoff", () => {
  it("enqueues retry with increasing delay from endpoint schedule on failures", async () => {
    const endpointSchedule = [5_000, 15_000, 60_000];
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 3,
      retrySchedule: endpointSchedule,
    });

    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-int-001", endpointId: "ep-001", attemptNumber: 2 },
      expect.any(Number),
    );
    const delay1 = vi.mocked(enqueueDelivery).mock.calls[0]![1]!;
    expect(delay1).toBeGreaterThanOrEqual(4_900);
    expect(delay1).toBeLessThanOrEqual(5_100);

    vi.clearAllMocks();
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 3,
      retrySchedule: endpointSchedule,
    });
    vi.mocked(createDelivery).mockResolvedValue({} as never);
    vi.mocked(getConsecutiveFailures).mockResolvedValue(1);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 2,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-int-001", endpointId: "ep-001", attemptNumber: 3 },
      expect.any(Number),
    );
    const delay2 = vi.mocked(enqueueDelivery).mock.calls[0]![1]!;
    expect(delay2).toBeGreaterThanOrEqual(14_900);
    expect(delay2).toBeLessThanOrEqual(15_100);
  });

  it("respects endpoint-specific maxRetries (lower than default)", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 2,
      retrySchedule: [10_000, 20_000],
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 2,
    });

    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      { eventId: "evt-int-001", endpointId: "ep-001", attemptNumber: 2 },
      "Max retries (2) exhausted",
    );
    expect(enqueueDelivery).not.toHaveBeenCalled();
  });

  it("moves to dead-letter after exhausting all retries", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 3,
      retrySchedule: [10_000, 20_000, 30_000],
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(3);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 3,
    });

    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      { eventId: "evt-int-001", endpointId: "ep-001", attemptNumber: 3 },
      "Max retries (3) exhausted",
    );
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(updateEventStatus).toHaveBeenCalledWith("evt-int-001", "failed");
  });

  it("full retry sequence: attempt 1 through 5 then dead-letter", async () => {
    const schedule = mockEndpoint.retrySchedule!;

    for (let attempt = 1; attempt <= 5; attempt++) {
      vi.clearAllMocks();
      vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
      vi.mocked(getEventById).mockResolvedValue(mockEvent);
      vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
      vi.mocked(createDelivery).mockResolvedValue({} as never);
      vi.mocked(getConsecutiveFailures).mockResolvedValue(attempt);

      await handleDelivery({
        eventId: "evt-int-001",
        endpointId: "ep-001",
        attemptNumber: attempt,
      });

      if (attempt < 5) {
        expect(enqueueDelivery).toHaveBeenCalledWith(
          expect.objectContaining({ attemptNumber: attempt + 1 }),
          expect.any(Number),
        );
        expect(enqueueDeadLetter).not.toHaveBeenCalled();
      } else {
        expect(enqueueDelivery).not.toHaveBeenCalled();
        expect(enqueueDeadLetter).toHaveBeenCalled();
      }
    }
  });
});

describe("idempotency — prevents double delivery", () => {
  it("skips delivery when a successful delivery already exists", async () => {
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(true);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-int-001", "ep-001");
    expect(getEventById).not.toHaveBeenCalled();
    expect(createDelivery).not.toHaveBeenCalled();
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });

  it("skips delivery even if attemptNumber differs when already delivered", async () => {
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(true);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 3,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-int-001", "ep-001");
    expect(createDelivery).not.toHaveBeenCalled();
  });
});

describe("circuit breaker and alerting", () => {
  it("triggers circuit breaker at threshold and sends alert", async () => {
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "degraded",
    });
    expect(sendFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: "ep-001",
        endpointName: "Production Webhook",
        endpointUrl: "https://api.customer.com/webhooks",
        failureCount: CIRCUIT_BREAKER_THRESHOLD,
        userEmail: "dev@example.com",
      }),
    );
  });

  it("recovers circuit breaker on successful delivery", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue(delivery200);
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      status: "degraded",
    });

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-001", {
      status: "active",
    });
  });

  it("does not send duplicate alerts within rate limit window", async () => {
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).toHaveBeenCalledTimes(1);

    vi.clearAllMocks();
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
    vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
    vi.mocked(createDelivery).mockResolvedValue({} as never);
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD + 1);

    await handleDelivery({
      eventId: "evt-int-002",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).not.toHaveBeenCalled();
  });
});

describe("fanout event handling", () => {
  it("updates fanout event status on success", async () => {
    vi.mocked(deliverWebhook).mockResolvedValue(delivery200);
    const fanoutEvent = {
      ...mockEvent,
      endpointGroupId: "eg-001",
      deliveryMode: "fanout" as const,
    };
    vi.mocked(getEventById).mockResolvedValue(fanoutEvent);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateFanoutEventStatus).toHaveBeenCalledWith("evt-int-001");
    expect(updateEventStatus).not.toHaveBeenCalledWith("evt-int-001", "delivered");
  });

  it("updates fanout event status on permanent failure", async () => {
    const fanoutEvent = {
      ...mockEvent,
      endpointGroupId: "eg-001",
      deliveryMode: "fanout" as const,
    };
    vi.mocked(getEventById).mockResolvedValue(fanoutEvent);
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 5,
    });

    expect(enqueueDeadLetter).toHaveBeenCalled();
    expect(updateFanoutEventStatus).toHaveBeenCalledWith("evt-int-001");
    expect(updateEventStatus).not.toHaveBeenCalledWith("evt-int-001", "failed");
  });
});

describe("edge cases", () => {
  it("handles network error (throw) by recording error and scheduling retry", async () => {
    vi.mocked(deliverWebhook).mockRejectedValue(new Error("ECONNREFUSED"));
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        errorMessage: expect.any(String),
      }),
    );
    expect(enqueueDelivery).toHaveBeenCalled();
  });

  it("handles endpoint with default-like retrySchedule", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      retrySchedule: [100, 200, 300, 400, 500],
      maxRetries: 5,
    });
    vi.mocked(getConsecutiveFailures).mockResolvedValue(0);

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      expect.objectContaining({ attemptNumber: 2 }),
      expect.any(Number),
    );
  });

  it("handles disabled endpoint by marking event failed", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      status: "disabled",
    });

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-int-001", "failed");
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("handles inactive endpoint by marking event failed", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      isActive: false,
    });

    await handleDelivery({
      eventId: "evt-int-001",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-int-001", "failed");
    expect(createDelivery).not.toHaveBeenCalled();
  });

  it("handles missing event gracefully", async () => {
    vi.mocked(getEventById).mockResolvedValue(null);

    await handleDelivery({
      eventId: "evt-missing",
      endpointId: "ep-001",
      attemptNumber: 1,
    });

    expect(createDelivery).not.toHaveBeenCalled();
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });
});
