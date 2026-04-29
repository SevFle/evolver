import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/auth/middleware", () => ({
  authenticateApiKey: vi.fn(),
}));

vi.mock("@/server/db/queries", () => ({
  getEndpointById: vi.fn(),
  updateEndpoint: vi.fn(),
  deleteEndpoint: vi.fn(),
}));

import { authenticateApiKey } from "@/server/auth/middleware";
import { getEndpointById, updateEndpoint, deleteEndpoint } from "@/server/db/queries";

const mockedAuth = vi.mocked(authenticateApiKey);
const mockedGetEndpoint = vi.mocked(getEndpointById);
const mockedUpdateEndpoint = vi.mocked(updateEndpoint);
const mockedDeleteEndpoint = vi.mocked(deleteEndpoint);

function makeReq(body?: unknown, headers: Record<string, string> = {}) {
  return {
    headers: { get: (n: string) => headers[n] ?? null },
    json: () => Promise.resolve(body ?? {}),
  } as unknown as import("next/server").NextRequest;
}

const endpointOwner = {
  id: "ep-1",
  userId: "user-a",
  url: "https://example.com",
  description: null,
  signingSecret: "whsec_test",
  status: "active" as const,
  customHeaders: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("GET /api/v1/endpoints/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when endpoint belongs to another user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-b", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({ ...endpointOwner, userId: "user-a" } as never);

    const { GET } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns endpoint when owner requests it", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(endpointOwner as never);

    const { GET } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await GET(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(200);
  });
});

describe("PATCH /api/v1/endpoints/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { PATCH } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await PATCH(makeReq({ url: "https://new.example.com" }), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when endpoint belongs to another user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-b", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({ ...endpointOwner, userId: "user-a" } as never);

    const { PATCH } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await PATCH(makeReq({ url: "https://new.example.com" }), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockedUpdateEndpoint).not.toHaveBeenCalled();
  });

  it("passes userId to updateEndpoint when authorized", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(endpointOwner as never);
    mockedUpdateEndpoint.mockResolvedValue({ ...endpointOwner, url: "https://new.example.com" } as never);

    const { PATCH } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await PATCH(makeReq({ url: "https://new.example.com" }), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockedUpdateEndpoint).toHaveBeenCalledWith(
      "ep-1",
      { url: "https://new.example.com" },
      "user-a",
    );
  });
});

describe("DELETE /api/v1/endpoints/[id] authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 without authentication", async () => {
    mockedAuth.mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when endpoint belongs to another user", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-b", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue({ ...endpointOwner, userId: "user-a" } as never);

    const { DELETE } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(404);
    expect(mockedDeleteEndpoint).not.toHaveBeenCalled();
  });

  it("passes userId to deleteEndpoint when authorized", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(endpointOwner as never);
    mockedDeleteEndpoint.mockResolvedValue(undefined as never);

    const { DELETE } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await DELETE(makeReq(), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(204);
    expect(mockedDeleteEndpoint).toHaveBeenCalledWith("ep-1", "user-a");
  });

  it("PATCH rejects invalid URL with 400", async () => {
    mockedAuth.mockResolvedValue({ userId: "user-a", apiKeyId: "key-1" });
    mockedGetEndpoint.mockResolvedValue(endpointOwner as never);

    const { PATCH } = await import("@/app/api/v1/endpoints/[id]/route");
    const res = await PATCH(makeReq({ url: "not-a-url" }), {
      params: Promise.resolve({ id: "ep-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockedUpdateEndpoint).not.toHaveBeenCalled();
  });
});
