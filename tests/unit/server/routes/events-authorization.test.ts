import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/middleware", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getEndpointById: vi.fn(),
  createEvent: vi.fn(),
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(),
}));

vi.mock("@/lib/constants", () => ({
  MAX_PAYLOAD_SIZE_BYTES: 1024 * 1024,
}));

import { authenticateApiKey } from "@/server/auth/middleware";
import { getEndpointById, createEvent } from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";

const mockedAuth = vi.mocked(authenticateApiKey);
const mockedGetEndpoint = vi.mocked(getEndpointById);
const mockedCreateEvent = vi.mocked(createEvent);
const mockedEnqueue = vi.mocked(enqueueDelivery);

function makeReq(body: unknown, headers: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body),
  } as unknown as import("next/server").NextRequest;
}

describe("POST /api/v1/events authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(401);
  });

  it("returns 404 when endpoint belongs to another user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({
      id: "11111111-1111-1111-1111-111111111111",
      userId: "user-b",
      url: "https://example.com",
      status: "active",
    } as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointId: "11111111-1111-1111-1111-111111111111",
        payload: { test: true },
        eventType: "test.event",
      }),
    );
    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
    expect(mockedEnqueue).not.toHaveBeenCalled();
  });

  it("returns 404 when endpoint does not exist", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(null);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointId: "22222222-2222-2222-2222-222222222222",
        payload: { test: true },
        eventType: "test.event",
      }),
    );
    expect(res.status).toBe(404);
  });

  it("returns 404 when endpoint is disabled", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({
      id: "33333333-3333-3333-3333-333333333333",
      userId: "user-a",
      url: "https://example.com",
      status: "disabled",
    } as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointId: "33333333-3333-3333-3333-333333333333",
        payload: { test: true },
        eventType: "test.event",
      }),
    );
    expect(res.status).toBe(404);
    expect(mockedCreateEvent).not.toHaveBeenCalled();
  });

  it("returns 202 when authorized and owns the endpoint", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({
      id: "44444444-4444-4444-4444-444444444444",
      userId: "user-a",
      url: "https://example.com",
      status: "active",
    } as never);
    mockedCreateEvent.mockResolvedValue({
      id: "evt-1",
      status: "queued",
      eventType: "test.event",
      createdAt: new Date(),
    } as never);
    mockedEnqueue.mockResolvedValue(null as never);

    const { POST } = await import("@/app/api/v1/events/route");
    const res = await POST(
      makeReq({
        endpointId: "44444444-4444-4444-4444-444444444444",
        payload: { test: true },
        eventType: "test.event",
      }),
    );
    expect(res.status).toBe(202);
    expect(mockedCreateEvent).toHaveBeenCalled();
    expect(mockedEnqueue).toHaveBeenCalled();
  });
});
