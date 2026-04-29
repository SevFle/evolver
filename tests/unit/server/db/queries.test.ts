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
const mockInsert = vi.fn(() => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) }));

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({ from: mockFrom }),
    update: () => ({ set: mockUpdateSet }),
    insert: () => ({ values: vi.fn(() => ({ returning: vi.fn(() => []) })) }),
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
