import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

vi.mock("@/server/db/queries", () => ({
  createEndpoint: vi.fn(),
  getEndpointsByUserId: vi.fn(),
  getEndpointById: vi.fn(),
  updateEndpoint: vi.fn(),
  deleteEndpoint: vi.fn(),
}));

import { createCallerFactory } from "@/server/trpc/init";
import {
  createEndpoint,
  getEndpointsByUserId,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
} from "@/server/db/queries";
import { endpointRouter } from "@/server/trpc/routers/endpoints";

const mockedCreate = vi.mocked(createEndpoint);
const mockedList = vi.mocked(getEndpointsByUserId);
const mockedGet = vi.mocked(getEndpointById);
const mockedUpdate = vi.mocked(updateEndpoint);
const mockedDelete = vi.mocked(deleteEndpoint);

const createCaller = createCallerFactory(endpointRouter);

const sampleEndpoint = {
  id: "550e8400-e29b-41d4-a716-446655440000",
  userId: "user-a",
  url: "https://example.com/webhook",
  name: "Example Endpoint",
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

describe("endpoint router — create", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(
      caller.create({ url: "https://example.com" }),
    ).rejects.toThrow("Authentication required");
  });

  it("creates an endpoint and returns it with signingSecret", async () => {
    mockedCreate.mockResolvedValue(sampleEndpoint as never);
    const caller = createCaller({ userId: "user-a" });

    const result = await caller.create({
      url: "https://example.com/webhook",
      name: "Example Endpoint",
    });

    expect(mockedCreate).toHaveBeenCalledWith("user-a", {
      url: "https://example.com/webhook",
      name: "Example Endpoint",
    });
    expect(result.id).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(result.signingSecret).toBe("whsec_testsecret");
  });

  it("rejects invalid URL", async () => {
    const caller = createCaller({ userId: "user-a" });
    await expect(
      caller.create({ url: "not-a-url" }),
    ).rejects.toThrow();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it("throws INTERNAL_SERVER_ERROR when create fails", async () => {
    mockedCreate.mockResolvedValue(undefined as never);
    const caller = createCaller({ userId: "user-a" });

    await expect(
      caller.create({ url: "https://example.com" }),
    ).rejects.toThrow("Failed to create endpoint");
  });
});

describe("endpoint router — list", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(caller.list()).rejects.toThrow("Authentication required");
  });

  it("returns endpoints for the authenticated user", async () => {
    mockedList.mockResolvedValue([sampleEndpoint] as never);
    const caller = createCaller({ userId: "user-a" });

    const result = await caller.list();
    expect(mockedList).toHaveBeenCalledWith("user-a");
    expect(result).toHaveLength(1);
    expect(result[0]!.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("endpoint router — get", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(
      caller.get({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    ).rejects.toThrow("Authentication required");
  });

  it("returns null when endpoint belongs to another user", async () => {
    mockedGet.mockResolvedValue(null);
    const caller = createCaller({ userId: "user-b" });

    const result = await caller.get({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(mockedGet).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "user-b");
    expect(result).toBeNull();
  });

  it("returns endpoint when owner requests it", async () => {
    mockedGet.mockResolvedValue(sampleEndpoint as never);
    const caller = createCaller({ userId: "user-a" });

    const result = await caller.get({ id: "550e8400-e29b-41d4-a716-446655440000" });
    expect(mockedGet).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "user-a");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("550e8400-e29b-41d4-a716-446655440000");
  });
});

describe("endpoint router — update", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(
      caller.update({ id: "550e8400-e29b-41d4-a716-446655440000", url: "https://new.example.com" }),
    ).rejects.toThrow("Authentication required");
  });

  it("throws NOT_FOUND when endpoint belongs to another user", async () => {
    mockedGet.mockResolvedValue(null);
    const caller = createCaller({ userId: "user-b" });

    await expect(
      caller.update({ id: "550e8400-e29b-41d4-a716-446655440000", url: "https://new.example.com" }),
    ).rejects.toThrow("Endpoint not found");
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it("updates endpoint when owner requests it", async () => {
    mockedGet.mockResolvedValue(sampleEndpoint as never);
    const updated = { ...sampleEndpoint, url: "https://new.example.com" };
    mockedUpdate.mockResolvedValue(updated as never);
    const caller = createCaller({ userId: "user-a" });

    const result = await caller.update({
      id: "550e8400-e29b-41d4-a716-446655440000",
      url: "https://new.example.com",
    });

    expect(mockedGet).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "user-a");
    expect(mockedUpdate).toHaveBeenCalledWith(
      "550e8400-e29b-41d4-a716-446655440000",
      { url: "https://new.example.com" },
      "user-a",
    );
    expect(result.url).toBe("https://new.example.com");
  });

  it("rejects invalid URL on update", async () => {
    mockedGet.mockResolvedValue(sampleEndpoint as never);
    const caller = createCaller({ userId: "user-a" });
    await expect(
      caller.update({
        id: "550e8400-e29b-41d4-a716-446655440000",
        url: "not-a-url",
      }),
    ).rejects.toThrow();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });
});

describe("endpoint router — delete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws UNAUTHORIZED without userId", async () => {
    const caller = createCaller({});
    await expect(
      caller.delete({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    ).rejects.toThrow("Authentication required");
  });

  it("throws NOT_FOUND when endpoint belongs to another user", async () => {
    mockedGet.mockResolvedValue(null);
    const caller = createCaller({ userId: "user-b" });

    await expect(
      caller.delete({ id: "550e8400-e29b-41d4-a716-446655440000" }),
    ).rejects.toThrow("Endpoint not found");
    expect(mockedDelete).not.toHaveBeenCalled();
  });

  it("deletes endpoint when owner requests it", async () => {
    mockedGet.mockResolvedValue(sampleEndpoint as never);
    mockedDelete.mockResolvedValue(undefined as never);
    const caller = createCaller({ userId: "user-a" });

    const result = await caller.delete({ id: "550e8400-e29b-41d4-a716-446655440000" });

    expect(mockedGet).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "user-a");
    expect(mockedDelete).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000", "user-a");
    expect(result).toEqual({ success: true });
  });
});
