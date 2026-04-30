import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac } from "node:crypto";

vi.mock("@/server/services/ssrf", () => ({
  validateDeliveryUrl: vi.fn().mockResolvedValue(undefined),
  isPrivateIpv4: vi.fn(),
  isPrivateIpv6: vi.fn(),
  SsrfValidationError: class extends Error {},
}));

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

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(),
  enqueueDeadLetter: vi.fn(),
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

import { handleDelivery } from "@/server/queue/handlers";
import { deliverWebhook } from "@/server/services/delivery";
import { signPayload, verifySignature } from "@/server/services/signing";
import { getRetryDelay, getNextRetryAt, hasRetriesRemaining } from "@/server/services/retry";
import {
  shouldBreakCircuit,
  getEndpointStatusAfterFailure,
} from "@/server/services/circuit";
import { enqueueDelivery, enqueueDeadLetter } from "@/server/queue/producer";
import {
  getSuccessfulDelivery,
  getEventById,
  getEndpointById,
  createDelivery,
  updateEventStatus,
  getConsecutiveFailures,
  updateEndpoint,
  getUserById,
} from "@/server/db/queries";
import { sendFailureAlert, resetRateLimits } from "@/server/services/email";
import {
  RETRY_SCHEDULE,
  MAX_RETRY_ATTEMPTS,
  CIRCUIT_BREAKER_THRESHOLD,
} from "@/lib/constants";

const mockEvent = {
  id: "evt-flow-001",
  userId: "user-001",
  endpointId: "ep-flow-001",
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
  id: "ep-flow-001",
  userId: "user-001",
  url: "https://api.customer.com/webhooks",
  name: "Production Webhook",
  description: null,
  signingSecret: "whsec_integration_test_secret",
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

beforeEach(async () => {
  mockRedisStore.clear();
  vi.clearAllMocks();
  await resetRateLimits();

  vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
  vi.mocked(getEventById).mockResolvedValue(mockEvent);
  vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
  vi.mocked(createDelivery).mockResolvedValue({} as never);
  vi.mocked(updateEventStatus).mockResolvedValue(undefined as never);
  vi.mocked(getConsecutiveFailures).mockResolvedValue(0);
  vi.mocked(updateEndpoint).mockResolvedValue(undefined as never);
  vi.mocked(getUserById).mockResolvedValue({
    id: "user-001",
    email: "dev@example.com",
    name: "Dev",
  });
  vi.mocked(enqueueDelivery).mockResolvedValue("job-flow-001");
  vi.mocked(enqueueDeadLetter).mockResolvedValue("dlq-flow-001");

  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("integration: successful delivery marks complete", () => {
  it("delivers webhook with correct HMAC signature in HTTP headers", async () => {
    const secret = mockEndpoint.signingSecret;
    const eventId = mockEvent.id;
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: RequestInit) => {
        capturedHeaders = opts.headers as Record<string, string>;
        return new Response('{"received":true}', { status: 200 });
      }),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    const sig = capturedHeaders["X-HookRelay-Signature"];
    expect(sig).toBeDefined();

    const body = JSON.stringify(mockEvent.payload);
    const tsMatch = sig!.match(/^t=(\d+),/);
    expect(tsMatch).not.toBeNull();
    const ts = Number(tsMatch![1]);

    const expectedV1 = createHmac("sha256", secret)
      .update(`${ts}.${body}`)
      .digest("hex");

    expect(sig).toBe(`t=${ts},v1=${expectedV1}`);
    expect(verifySignature(body, secret, sig!)).toBe(true);
  });

  it("marks event as delivered after 2xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(updateEventStatus).toHaveBeenCalledWith("evt-flow-001", "delivering");
    expect(updateEventStatus).toHaveBeenCalledWith("evt-flow-001", "delivered");
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });

  it("creates a successful delivery record", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response('{"ok":true}', { status: 200 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "evt-flow-001",
        endpointId: "ep-flow-001",
        attemptNumber: 1,
        status: "success",
        responseStatusCode: 200,
        completedAt: expect.any(Date),
      }),
    );
  });

  it("does not update endpoint status when already active", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).not.toHaveBeenCalled();
  });

  it("recovers degraded endpoint to active on success", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      status: "degraded",
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-flow-001", { status: "active" });
  });
});

describe("integration: failed delivery schedules retry", () => {
  it("schedules retry with exponential backoff delay on 5xx response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    const expectedDelay = getRetryDelay(1);
    const before = Date.now();

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-flow-001", endpointId: "ep-flow-001", attemptNumber: 2 },
      expect.any(Number),
    );

    const actualDelay = vi.mocked(enqueueDelivery).mock.calls[0]![1]!;
    expect(actualDelay).toBeGreaterThanOrEqual(expectedDelay - 100);
    expect(actualDelay).toBeLessThanOrEqual(expectedDelay + 100);
  });

  it("increases delay for each retry attempt matching schedule", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    const delays: number[] = [];

    for (let attempt = 1; attempt <= 4; attempt++) {
      vi.mocked(enqueueDelivery).mockClear();
      vi.mocked(getConsecutiveFailures).mockResolvedValue(attempt);

      await handleDelivery({
        eventId: "evt-flow-001",
        endpointId: "ep-flow-001",
        attemptNumber: attempt,
      });

      const delay = vi.mocked(enqueueDelivery).mock.calls[0]![1]!;
      delays.push(delay);
    }

    for (let i = 1; i < delays.length; i++) {
      expect(delays[i]).toBeGreaterThan(delays[i - 1]!);
    }
  });

  it("creates a failed delivery record on non-2xx", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("Bad Gateway", { status: 502 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(createDelivery).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "failed",
        responseStatusCode: 502,
        completedAt: null,
      }),
    );
  });

  it("schedules retry on network error (fetch throws)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED");
      }),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(enqueueDelivery).toHaveBeenCalledWith(
      { eventId: "evt-flow-001", endpointId: "ep-flow-001", attemptNumber: 2 },
      expect.any(Number),
    );
    expect(enqueueDeadLetter).not.toHaveBeenCalled();
  });
});

describe("integration: dead-letter after exhaustion", () => {
  it("moves to dead-letter after all retries exhausted (attempt 5)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 5,
    });

    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      { eventId: "evt-flow-001", endpointId: "ep-flow-001", attemptNumber: 5 },
      "Max retries (5) exhausted",
    );
    expect(enqueueDelivery).not.toHaveBeenCalled();
    expect(updateEventStatus).toHaveBeenCalledWith("evt-flow-001", "failed");
  });

  it("respects endpoint-specific maxRetries lower than default", async () => {
    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      maxRetries: 2,
      retrySchedule: [10_000, 20_000],
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 2,
    });

    expect(enqueueDeadLetter).toHaveBeenCalledWith(
      { eventId: "evt-flow-001", endpointId: "ep-flow-001", attemptNumber: 2 },
      "Max retries (2) exhausted",
    );
  });

  it("full retry lifecycle: attempt 1 through 5 then dead-letter", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );

    for (let attempt = 1; attempt <= 5; attempt++) {
      vi.mocked(enqueueDelivery).mockClear();
      vi.mocked(enqueueDeadLetter).mockClear();
      vi.mocked(getConsecutiveFailures).mockResolvedValue(attempt);

      await handleDelivery({
        eventId: "evt-flow-001",
        endpointId: "ep-flow-001",
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

describe("integration: circuit breaker triggers after threshold", () => {
  it("marks endpoint as degraded at CIRCUIT_BREAKER_THRESHOLD failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD);

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(updateEndpoint).toHaveBeenCalledWith("ep-flow-001", { status: "degraded" });
  });

  it("sends failure alert email when circuit breaker triggers", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD);

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointId: "ep-flow-001",
        endpointName: "Production Webhook",
        failureCount: CIRCUIT_BREAKER_THRESHOLD,
        userEmail: "dev@example.com",
      }),
    );
  });

  it("does not send duplicate alerts within rate limit window", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("error", { status: 500 })),
    );
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD);

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });
    expect(sendFailureAlert).toHaveBeenCalledTimes(1);

    vi.mocked(sendFailureAlert).mockClear();
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(false);
    vi.mocked(getEventById).mockResolvedValue(mockEvent);
    vi.mocked(getEndpointById).mockResolvedValue(mockEndpoint);
    vi.mocked(createDelivery).mockResolvedValue({} as never);
    vi.mocked(getConsecutiveFailures).mockResolvedValue(CIRCUIT_BREAKER_THRESHOLD + 1);

    await handleDelivery({
      eventId: "evt-flow-002",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(sendFailureAlert).not.toHaveBeenCalled();
  });

  it("does not break circuit below threshold", async () => {
    expect(shouldBreakCircuit(4)).toBe(false);
    expect(getEndpointStatusAfterFailure(4)).toBe("active");
  });

  it("breaks circuit at exactly threshold", () => {
    expect(shouldBreakCircuit(CIRCUIT_BREAKER_THRESHOLD)).toBe(true);
    expect(getEndpointStatusAfterFailure(CIRCUIT_BREAKER_THRESHOLD)).toBe("degraded");
  });

  it("breaks circuit above threshold", () => {
    expect(shouldBreakCircuit(CIRCUIT_BREAKER_THRESHOLD + 5)).toBe(true);
    expect(getEndpointStatusAfterFailure(CIRCUIT_BREAKER_THRESHOLD + 5)).toBe("degraded");
  });
});

describe("integration: HMAC signing in actual delivery", () => {
  it("signature is verifiable by recipient", async () => {
    const secret = "whsec_recipient_test";
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: string = "";

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: RequestInit) => {
        capturedHeaders = opts.headers as Record<string, string>;
        capturedBody = opts.body as string;
        return new Response("ok", { status: 200 });
      }),
    );

    vi.mocked(getEndpointById).mockResolvedValue({
      ...mockEndpoint,
      signingSecret: secret,
    });

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    const sig = capturedHeaders["X-HookRelay-Signature"];
    expect(verifySignature(capturedBody, secret, sig!)).toBe(true);
  });

  it("signature timestamp reflects current time", async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: RequestInit) => {
        capturedHeaders = opts.headers as Record<string, string>;
        return new Response("ok", { status: 200 });
      }),
    );

    const beforeTs = Math.floor(Date.now() / 1000);
    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });
    const afterTs = Math.floor(Date.now() / 1000);

    const sig = capturedHeaders["X-HookRelay-Signature"]!;
    const tsMatch = sig.match(/^t=(\d+),/);
    const sigTs = Number(tsMatch![1]);

    expect(sigTs).toBeGreaterThanOrEqual(beforeTs);
    expect(sigTs).toBeLessThanOrEqual(afterTs);
  });

  it("signature includes X-HookRelay-Event-ID in request", async () => {
    let capturedHeaders: Record<string, string> = {};

    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, opts: RequestInit) => {
        capturedHeaders = opts.headers as Record<string, string>;
        return new Response("ok", { status: 200 });
      }),
    );

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(capturedHeaders["X-HookRelay-Event-ID"]).toBe("evt-flow-001");
  });
});

describe("integration: retry schedule verification", () => {
  it("default schedule matches spec: 1min, 5min, 30min, 2hr, 12hr", () => {
    expect(RETRY_SCHEDULE).toEqual([60_000, 300_000, 1_800_000, 7_200_000, 43_200_000]);
    expect(RETRY_SCHEDULE[0]).toBe(60_000);
    expect(RETRY_SCHEDULE[1]).toBe(300_000);
    expect(RETRY_SCHEDULE[2]).toBe(1_800_000);
    expect(RETRY_SCHEDULE[3]).toBe(7_200_000);
    expect(RETRY_SCHEDULE[4]).toBe(43_200_000);
  });

  it("getRetryDelay returns exact schedule values for each attempt", () => {
    expect(getRetryDelay(1)).toBe(60_000);
    expect(getRetryDelay(2)).toBe(300_000);
    expect(getRetryDelay(3)).toBe(1_800_000);
    expect(getRetryDelay(4)).toBe(7_200_000);
    expect(getRetryDelay(5)).toBe(43_200_000);
  });

  it("caps delay at last schedule value for attempts beyond schedule", () => {
    expect(getRetryDelay(6)).toBe(43_200_000);
    expect(getRetryDelay(10)).toBe(43_200_000);
    expect(getRetryDelay(100)).toBe(43_200_000);
  });

  it("each delay is strictly greater than the previous", () => {
    for (let i = 1; i < RETRY_SCHEDULE.length; i++) {
      expect(RETRY_SCHEDULE[i]!).toBeGreaterThan(RETRY_SCHEDULE[i - 1]!);
    }
  });

  it("max retry attempts is 5", () => {
    expect(MAX_RETRY_ATTEMPTS).toBe(5);
  });

  it("hasRetriesRemaining allows attempts 1 through 5", () => {
    for (let i = 1; i <= 5; i++) {
      expect(hasRetriesRemaining(i)).toBe(true);
    }
  });

  it("hasRetriesRemaining rejects attempt 6 and beyond", () => {
    expect(hasRetriesRemaining(6)).toBe(false);
    expect(hasRetriesRemaining(10)).toBe(false);
  });

  it("getNextRetryAt returns dates in strictly increasing order", () => {
    const dates = [];
    for (let i = 1; i <= 5; i++) {
      dates.push(getNextRetryAt(i));
    }
    for (let i = 1; i < dates.length; i++) {
      expect(dates[i]!.getTime()).toBeGreaterThan(dates[i - 1]!.getTime());
    }
  });
});

describe("integration: idempotency check prevents double delivery", () => {
  it("skips delivery when already successfully delivered", async () => {
    vi.mocked(getSuccessfulDelivery).mockResolvedValue(true);

    await handleDelivery({
      eventId: "evt-flow-001",
      endpointId: "ep-flow-001",
      attemptNumber: 1,
    });

    expect(getSuccessfulDelivery).toHaveBeenCalledWith("evt-flow-001", "ep-flow-001");
    expect(createDelivery).not.toHaveBeenCalled();
    expect(enqueueDelivery).not.toHaveBeenCalled();
  });
});
