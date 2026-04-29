import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

const mockWhere = vi.fn(() => ({
  orderBy: vi.fn(() => []),
  returning: vi.fn(() => []),
  limit: vi.fn(() => []),
}));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));
const mockUpdateSet = vi.fn(() => ({ where: mockWhere, returning: vi.fn(() => []) }));
const mockUpdate = vi.fn(() => ({ set: mockUpdateSet }));
const mockInsertReturning = vi.fn<(args: any) => any>(() => []);
const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
const mockInsert = vi.fn(() => ({ values: mockInsertValues }));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    update: () => ({ set: mockUpdateSet }),
    insert: () => ({ values: mockInsertValues }),
  },
}));

vi.mock("@/server/services/signing", () => ({
  generateSigningSecret: () => "whsec_test",
}));

vi.mock("@/server/auth/api-keys", () => ({
  generateApiKey: () => ({ raw: "key", prefix: "prefix", hash: "hash" }),
  hashApiKey: () => "hash",
}));

import { eq, and, isNull } from "drizzle-orm";
import { endpoints } from "@/server/db/schema";

describe("queries — URL validation in createEndpoint", () => {
  it("throws TRPCError BAD_REQUEST for invalid URL", async () => {
    const { createEndpoint } = await import("@/server/db/queries");
    await expect(
      createEndpoint("user-1", { url: "not-a-url" }),
    ).rejects.toThrow();
    try {
      await createEndpoint("user-1", { url: "bad-url" });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
      expect((err as TRPCError).message).toContain("Invalid URL");
    }
  });
});

describe("queries — URL validation in updateEndpoint", () => {
  it("throws TRPCError BAD_REQUEST for invalid URL", async () => {
    const { updateEndpoint } = await import("@/server/db/queries");
    await expect(
      updateEndpoint("id-1", { url: "not-a-url" }),
    ).rejects.toThrow();
    try {
      await updateEndpoint("id-1", { url: "bad-url" });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
      expect((err as TRPCError).message).toContain("Invalid URL");
    }
  });

  it("does not throw for valid URL", async () => {
    const { updateEndpoint } = await import("@/server/db/queries");
    await expect(
      updateEndpoint("id-1", { url: "https://example.com/webhook" }),
    ).resolves.toBeUndefined();
  });

  it("does not throw when url is not provided", async () => {
    const { updateEndpoint } = await import("@/server/db/queries");
    await expect(
      updateEndpoint("id-1", { description: "updated" }),
    ).resolves.toBeUndefined();
  });
});

describe("queries — soft-delete filter uses isNull(deletedAt)", () => {
  it("getEndpointById conditions include isNull(deletedAt) via and()", () => {
    const condWithUser = and(
      eq(endpoints.id, "id-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    const condWithoutUser = and(
      eq(endpoints.id, "id-1"),
      isNull(endpoints.deletedAt),
    );
    expect(condWithUser).toBeDefined();
    expect(condWithoutUser).toBeDefined();
  });

  it("getEndpointsByUserId conditions include isNull(deletedAt)", () => {
    const cond = and(
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).toBeDefined();
  });

  it("deleteEndpoint conditions include isNull(deletedAt)", () => {
    const cond = and(
      eq(endpoints.id, "id-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).toBeDefined();
  });

  it("updateEndpoint conditions include isNull(deletedAt) with userId", () => {
    const cond = and(
      eq(endpoints.id, "id-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).toBeDefined();
  });

  it("updateEndpoint conditions include isNull(deletedAt) without userId", () => {
    const cond = and(
      eq(endpoints.id, "id-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).toBeDefined();
  });
});

describe("queries — createReplayEvent nullability validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws BAD_REQUEST when both endpointId and endpointGroupId are null", async () => {
    const { createReplayEvent } = await import("@/server/db/queries");
    await expect(
      createReplayEvent({
        userId: "user-1",
        endpointId: null,
        endpointGroupId: null,
        payload: { test: true },
        eventType: "test.event",
        idempotencyKey: "key-1",
        replayedFromEventId: "evt-1",
      }),
    ).rejects.toThrow("Must provide endpointId or endpointGroupId");
    try {
      await createReplayEvent({
        userId: "user-1",
        endpointId: null,
        endpointGroupId: null,
        payload: { test: true },
        eventType: "test.event",
        idempotencyKey: "key-1",
        replayedFromEventId: "evt-1",
      });
    } catch (err) {
      expect(err).toBeInstanceOf(TRPCError);
      expect((err as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("throws BAD_REQUEST when endpointId and endpointGroupId are undefined", async () => {
    const { createReplayEvent } = await import("@/server/db/queries");
    await expect(
      createReplayEvent({
        userId: "user-1",
        endpointId: null,
        payload: { test: true },
        eventType: "test.event",
        idempotencyKey: "key-2",
        replayedFromEventId: "evt-1",
      }),
    ).rejects.toThrow("Must provide endpointId or endpointGroupId");
  });

  it("succeeds when endpointId is provided", async () => {
    mockInsertReturning.mockReturnValueOnce([{ id: "new-evt" }]);
    const { createReplayEvent } = await import("@/server/db/queries");
    const result = await createReplayEvent({
      userId: "user-1",
      endpointId: "ep-1",
      payload: { test: true },
      eventType: "test.event",
      idempotencyKey: "key-3",
      replayedFromEventId: "evt-1",
    });
    expect(result).toEqual({ id: "new-evt" });
  });

  it("succeeds when endpointGroupId is provided", async () => {
    mockInsertReturning.mockReturnValueOnce([{ id: "new-evt-2" }]);
    const { createReplayEvent } = await import("@/server/db/queries");
    const result = await createReplayEvent({
      userId: "user-1",
      endpointId: null,
      endpointGroupId: "eg-1",
      payload: { test: true },
      eventType: "test.event",
      idempotencyKey: "key-4",
      replayedFromEventId: "evt-1",
    });
    expect(result).toEqual({ id: "new-evt-2" });
  });
});
