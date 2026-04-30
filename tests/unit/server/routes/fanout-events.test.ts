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
  MAX_PAYLOAD_SIZE_BYTES: 1024 * 1024,
}));

import { authenticateApiKey } from "@/server/auth/middleware";
import { createEvent, resolveFanoutEndpoints } from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";
import { TRPCError } from "@trpc/server";

const mockedAuth = vi.mocked(authenticateApiKey);
const mockedCreateEvent = vi.mocked(createEvent);
const mockedEnqueue = vi.mocked(enqueueDelivery);
const mockedResolveFanout = vi.mocked(resolveFanoutEndpoints);

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

const fanoutEndpoints = [
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", url: "https://a.example.com", name: "A", signingSecret: "s1", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", url: "https://b.example.com", name: "B", signingSecret: "s2", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
  { id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3", url: "https://c.example.com", name: "C", signingSecret: "s3", status: "active", isActive: true, customHeaders: null, userId: "user-a" },
];

describe("POST /api/v1/events — fan-out via endpointGroupId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 202 with fanoutEndpoints count when using endpointGroupId", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-1",
      status: "queued",
      eventType: "order.created",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        payload: { orderId: "123" },
        eventType: "order.created",
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.fanoutEndpoints).toBe(3);
    expect(body.deliveryJobs).toBe(3);
    expect(mockedEnqueue).toHaveBeenCalledTimes(3);
    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: "user-a",
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
      }),
    );
  });

  it("returns 202 with fanoutEndpoints count when using endpointIds", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-2",
      status: "queued",
      eventType: "order.shipped",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointIds: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2", "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3"],
        payload: { orderId: "456" },
        eventType: "order.shipped",
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.fanoutEndpoints).toBe(3);
    expect(mockedEnqueue).toHaveBeenCalledTimes(3);
    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        endpointGroupId: null,
      }),
    );
  });

  it("enqueues delivery for each endpoint in the group", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-3",
      status: "queued",
      eventType: "test.event",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/v1/events/route");
    await POST(
      makeReq({
        endpointGroupId: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb1",
        payload: {},
        eventType: "test.event",
      }),
    );

    expect(mockedEnqueue).toHaveBeenCalledTimes(3);
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-3",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1",
      attemptNumber: 1,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-3",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa2",
      attemptNumber: 1,
    });
    expect(mockedEnqueue).toHaveBeenCalledWith({
      eventId: "evt-3",
      endpointId: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa3",
      attemptNumber: 1,
    });
  });

  it("returns 404 when endpoint group not found", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockRejectedValue(
      new TRPCError({ code: "NOT_FOUND", message: "Endpoint group not found" }),
    );

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointGroupId: "cccccccc-cccc-cccc-cccc-ccccccccccc1",
        payload: {},
        eventType: "test.event",
      }),
    );

    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("returns 400 when endpoint group has no active endpoints", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockRejectedValue(
      new TRPCError({ code: "BAD_REQUEST", message: "Endpoint group has no active endpoints" }),
    );

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointGroupId: "dddddddd-dddd-dddd-dddd-dddddddddddd",
        payload: {},
        eventType: "test.event",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("returns 400 when neither endpointGroupId nor endpointIds provided for fanout", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        payload: {},
        eventType: "test.event",
      }),
    );

    expect(res.status).toBe(400);
  });

  it("passes idempotencyKey through for fan-out events", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedResolveFanout.mockResolvedValue(fanoutEndpoints as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-4",
      status: "queued",
      eventType: "test.event",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/v1/events/route");
    await POST(
      makeReq({
        endpointGroupId: "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee1",
        payload: {},
        eventType: "test.event",
        idempotencyKey: "unique-key-123",
      }),
    );

    expect(mockedCreateEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: "unique-key-123",
      }),
    );
  });
});

describe("POST /api/v1/events — single endpoint still works", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to single event handler when endpointId provided", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    const { getEndpointById } = await import("@/server/db/queries");
    const mockedGetEndpoint = vi.mocked(getEndpointById);
    mockedGetEndpoint.mockResolvedValue({
      id: "55555555-5555-5555-5555-555555555555",
      userId: "user-a",
      url: "https://example.com",
      status: "active",
    } as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-5",
      status: "queued",
      eventType: "test.event",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue("job-id" as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointId: "55555555-5555-5555-5555-555555555555",
        payload: { test: true },
        eventType: "test.event",
      }),
    );

    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.deliveryJobs).toBe(1);
    expect(mockedResolveFanout).not.toHaveBeenCalled();
    expect(mockedEnqueue).toHaveBeenCalledTimes(1);
  });
});
