import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/middleware", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  createEndpoint: vi.fn(),
  getEndpointsByUserId: vi.fn(),
}));

import { authenticateApiKey } from "@/server/auth/middleware";
import { createEndpoint, getEndpointsByUserId } from "@/server/db/queries";

const mockedAuth = vi.mocked(authenticateApiKey);
const mockedCreate = vi.mocked(createEndpoint);
const mockedList = vi.mocked(getEndpointsByUserId);

function makeReq(body?: unknown, headers: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body ?? {}),
  } as unknown as import("next/server").NextRequest;
}

describe("POST /api/v1/endpoints — URL validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { POST } = await import("@/app/api/v1/endpoints/route");
    const res = await POST(makeReq({ url: "https://example.com" }));
    expect(res.status).toBe(401);
  });

  it("rejects invalid URL with 400", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    const { POST } = await import("@/app/api/v1/endpoints/route");
    const res = await POST(makeReq({ url: "not-a-url" }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Validation failed");
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects empty string URL with 400", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    const { POST } = await import("@/app/api/v1/endpoints/route");
    const res = await POST(makeReq({ url: "" }));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("rejects missing URL with 400", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    const { POST } = await import("@/app/api/v1/endpoints/route");
    const res = await POST(makeReq({}));
    expect(res.status).toBe(400);
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("creates endpoint with valid URL and returns 201", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedCreate.mockResolvedValue({
      id: "ep-1",
      url: "https://example.com/webhook",
      description: null,
      signingSecret: "whsec_test",
      status: "active",
      createdAt: new Date(),
    } as never);

    const { POST } = await import("@/app/api/v1/endpoints/route");
    const res = await POST(makeReq({ url: "https://example.com/webhook" }));
    expect(res.status).toBe(201);
    expect(mockedCreate).toHaveBeenCalledWith("user-a", {
      url: "https://example.com/webhook",
    });
    const body = await res.json();
    expect(body.url).toBe("https://example.com/webhook");
  });
});

describe("GET /api/v1/endpoints", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/endpoints/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(401);
  });

  it("returns list of endpoints for authenticated user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedList.mockResolvedValue([
      {
        id: "ep-1",
        url: "https://example.com",
        description: null,
        status: "active",
        createdAt: new Date(),
      },
    ] as never);

    const { GET } = await import("@/app/api/v1/endpoints/route");
    const res = await GET(makeReq());
    expect(res.status).toBe(200);
    expect(mockedList).toHaveBeenCalledWith("user-a");
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("ep-1");
  });
});
