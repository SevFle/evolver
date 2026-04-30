import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/middleware", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getEndpointById: vi.fn(),
  createEvent: vi.fn(),
  resolveFanoutEndpoints: vi.fn(),
  resolveSubscribedEndpoints: vi.fn(),
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  MAX_PAYLOAD_SIZE_BYTES: 512 * 1024,
}));

import { authenticateApiKey } from "@/server/auth/middleware";
import {
  getEndpointById,
  createEvent,
  resolveFanoutEndpoints,
  resolveSubscribedEndpoints,
} from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { TRPCError } from "@trpc/server";

const mockedAuth = vi.mocked(authenticateApiKey);
const mockedGetEndpoint = vi.mocked(getEndpointById);
const mockedCreateEvent = vi.mocked(createEvent);
const mockedEnqueue = vi.mocked(enqueueDelivery);
const mockedResolveFanout = vi.mocked(resolveFanoutEndpoints);
const mockedResolveSubscribed = vi.mocked(resolveSubscribedEndpoints);

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

const mockEndpoint = (overrides: Record<string, unknown> = {}) => ({
  id: "44444444-4444-4444-4444-444444444444",
  userId: "user-a",
  url: "https://example.com/webhook",
  name: "Test Endpoint",
  description: null,
  signingSecret: "whsec_test",
  status: "active",
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
  ...overrides,
});

const mockEvent = (overrides: Record<string, unknown> = {}) => ({
  id: "evt-001",
  userId: "user-a",
  endpointId: "44444444-4444-4444-4444-444444444444",
  endpointGroupId: null,
  deliveryMode: "direct",
  eventType: "test.event",
  payload: { test: true },
  metadata: {},
  source: null,
  idempotencyKey: null,
  status: "queued",
  replayedFromEventId: null,
  createdAt: new Date("2025-01-01T00:00:00Z"),
  ...overrides,
});

const fanoutEndpoints = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", url: "https://a.example.com", name: "A", signingSecret: "s1", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", url: "https://b.example.com", name: "B", signingSecret: "s2", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", url: "https://c.example.com", name: "C", signingSecret: "s3", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
];

describe("POST /api/events — authentication failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 when no Authorization header is provided", async () => {
    mockedAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
    expect(body.message).toBeDefined();
  });

  it("returns 401 when API key is invalid", async () => {
    mockedAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq(
        { eventType: "test", payload: {} },
        { authorization: "Bearer invalid_key" },
      ),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("Unauthorized");
  });

  it("does not call createEvent or enqueueDelivery on auth failure", async () => {
    mockedAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq(
        { eventType: "test", payload: {}, endpointId: "44444444-4444-4444-4444-444444444444" },
        { authorization: "Bearer bad_key" },
      ),
    );
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});

describe("POST /api/events — payload validation failures", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
  });

  it("returns 400 when eventType is missing", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({ payload: { test: true } }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(body.details).toBeDefined();
  });

  it("returns 400 when payload is missing", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({ eventType: "test.event" }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when eventType exceeds 255 characters", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({
      eventType: "a".repeat(256),
      payload: { test: true },
    }));
    expect(res.status).toBe(400);
  });

  it("returns 400 when no target is specified (no endpointId, groupId, ids, or subscribe)", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({
      eventType: "test.event",
      payload: { test: true },
    }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toContain("endpointId");
  });

  it("returns 400 when endpointId is not a valid UUID", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(makeReq({
      eventType: "test.event",
      payload: { test: true },
      endpointId: "not-a-uuid",
    }));
    expect(res.status).toBe(400);
  });

  it("returns 413 when content-length exceeds MAX_PAYLOAD_SIZE_BYTES", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq(
        { eventType: "test.event", payload: { test: true }, endpointId: "44444444-4444-4444-4444-444444444444" },
        { "content-length": String(600 * 1024) },
      ),
    );
    expect(res.status).toBe(413);
    const body = await res.json();
    expect(body.error).toBe("Payload too large");
  });

  it("returns 400 when body is not valid JSON", async () => {
    const { POST } = await import("@/app/api/events/route");
    const req = {
      headers: { get: () => null },
      json: async () => { throw new SyntaxError("Unexpected token"); },
    } as unknown as import("next/server").NextRequest;
    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid JSON");
  });
});

describe("POST /api/events — successful direct ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(mockEndpoint() as never);
    mockedCreateEvent.mockResolvedValue(mockEvent() as never);
    mockedEnqueue.mockResolvedValue("job-001" as never);
  });

  it("returns 202 with event details and deliveryJobs: 1", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: { hello: "world" },
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.id).toBe("evt-001");
    expect(body.status).toBe("queued");
    expect(body.eventType).toBe("test.event");
    expect(body.deliveryJobs).toBe(1);
    expect(body.createdAt).toBeDefined();
  });

  it("persists event via createEvent with correct parameters", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "payment.created",
        payload: { amount: 100, currency: "USD" },
        endpointId: "44444444-4444-4444-4444-444444444444",
        idempotencyKey: "idem-123",
        metadata: { source: "stripe" },
        source: "stripe",
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith({
      userId: "user-a",
      endpointId: "44444444-4444-4444-4444-444444444444",
      payload: { amount: 100, currency: "USD" },
      eventType: "payment.created",
      idempotencyKey: "idem-123",
      metadata: { source: "stripe" },
      source: "stripe",
    });
  });

  it("enqueues exactly one delivery job", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "44444444-4444-4444-4444-444444444444",
      attemptNumber: 1,
    });
  });

  it("returns 404 when endpoint belongs to another user", async () => {
    mockedGetEndpoint.mockResolvedValue(mockEndpoint({ userId: "user-b" }) as never);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("returns 404 when endpoint does not exist", async () => {
    mockedGetEndpoint.mockResolvedValue(null);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointId: "00000000-0000-0000-0000-000000000000",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
  });

  it("returns 404 when endpoint is disabled", async () => {
    mockedGetEndpoint.mockResolvedValue(mockEndpoint({ status: "disabled" }) as never);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
  });

  it("returns 500 when createEvent fails", async () => {
    mockedCreateEvent.mockResolvedValue(null as never);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(res.status).toBe(500);
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});

describe("POST /api/events — successful fan-out ingestion via endpointGroupId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue(mockEvent({
      endpointId: null,
      endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      deliveryMode: "group",
    }) as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);
  });

  it("returns 202 with fanoutEndpoints count", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "order.created",
        payload: { orderId: "123" },
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.fanoutEndpoints).toBe(3);
    expect(body.deliveryJobs).toBe(3);
  });

  it("enqueues a delivery job for each resolved endpoint", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.created",
        payload: { orderId: "123" },
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledTimes(3);
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      attemptNumber: 1,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      attemptNumber: 1,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
      attemptNumber: 1,
    });
  });

  it("creates event with allowNoTarget and endpointGroupId", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.created",
        payload: {},
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        idempotencyKey: "unique-1",
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        endpointId: undefined,
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        allowNoTarget: true,
        idempotencyKey: "unique-1",
      }),
    );
  });

  it("returns 404 when endpoint group is not found", async () => {
    mockedResolveFanout.mockRejectedValue(
      new TRPCError({ code: "NOT_FOUND", message: "Endpoint group not found" }),
    );
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointGroupId: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("returns 400 when group has no active endpoints", async () => {
    mockedResolveFanout.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "Endpoint group has no active endpoints" }),
    );
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointGroupId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
      }),
    );

    expect(res.status).toBe(400);
  });
});

describe("POST /api/events — successful fan-out ingestion via endpointIds", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue(mockEvent({
      endpointId: null,
      endpointGroupId: null,
      deliveryMode: "fanout",
    }) as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);
  });

  it("returns 202 with correct delivery job count", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "order.shipped",
        payload: { orderId: "456" },
        endpointIds: [
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
        ],
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.fanoutEndpoints).toBe(3);
    expect(body.deliveryJobs).toBe(3);
  });

  it("creates event with endpointGroupId null for endpointIds fanout", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.shipped",
        payload: {},
        endpointIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1"],
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointGroupId: null,
        endpointId: undefined,
        allowNoTarget: true,
      }),
    );
  });
});

describe("POST /api/events — subscription fan-out ingestion", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveSubscribed.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue(mockEvent({
      endpointId: null,
      endpointGroupId: null,
      deliveryMode: "fanout",
      metadata: { _subscriptionFanout: true },
    }) as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);
  });

  it("returns 202 with subscriptionFanout flag", async () => {
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "order.created",
        payload: { orderId: "789" },
        subscribe: true,
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.subscriptionFanout).toBe(true);
    expect(body.fanoutEndpoints).toBe(3);
    expect(body.deliveryJobs).toBe(3);
  });

  it("enqueues delivery for each subscribed endpoint", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.created",
        payload: {},
        subscribe: true,
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledTimes(3);
  });

  it("includes _subscriptionFanout marker in metadata", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.created",
        payload: {},
        subscribe: true,
        metadata: { traceId: "abc" },
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { traceId: "abc", _subscriptionFanout: true },
      }),
    );
  });

  it("returns 404 when no subscribed endpoints match", async () => {
    mockedResolveSubscribed.mockResolvedValue([]);
    const { POST } = await import("@/app/api/events/route");
    const res = await POST(
      makeReq({
        eventType: "unknown.event",
        payload: {},
        subscribe: true,
      }),
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toContain("subscribed endpoints");
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("passes idempotencyKey through for subscription events", async () => {
    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "order.created",
        payload: {},
        subscribe: true,
        idempotencyKey: "sub-idem-456",
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "sub-idem-456",
      }),
    );
  });
});

describe("POST /api/events — queue enqueueing verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
  });

  it("enqueueDelivery receives correct DeliveryJobData structure", async () => {
    mockedGetEndpoint.mockResolvedValue(mockEndpoint() as never);
    mockedCreateEvent.mockResolvedValue(mockEvent() as never);
    mockedEnqueue.mockResolvedValue("job-abc" as never);

    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "payment.succeeded",
        payload: { amount: 5000 },
        endpointId: "44444444-4444-4444-4444-444444444444",
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "44444444-4444-4444-4444-444444444444",
      attemptNumber: 1,
    });
  });

  it("enqueues jobs in parallel for fan-out events", async () => {
    const endpoints = fanoutEndpoints.slice(0, 2);
    mockedResolveFanout.mockResolvedValue(endpoints as never);
    mockedCreateEvent.mockResolvedValue(mockEvent({ endpointId: null }) as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "batch.event",
        payload: {},
        endpointIds: [
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
          "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
        ],
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledTimes(2);
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      attemptNumber: 1,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-001",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      attemptNumber: 1,
    });
  });

  it("does not enqueue any jobs when event creation fails", async () => {
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/events/route");
    await POST(
      makeReq({
        eventType: "test.event",
        payload: {},
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      }),
    );

    expect(mockedEnqueue).not.toHaveBeenCalled();
  });
});
