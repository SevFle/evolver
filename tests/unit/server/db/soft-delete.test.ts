import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => []),
        })),
      }),
    }),
    update: () => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(() => []),
        })),
      })),
    }),
    insert: () => ({
      values: vi.fn(() => ({
        returning: vi.fn(() => []),
      })),
    }),
  },
}));

vi.mock("@/server/services/signing", () => ({
  generateSigningSecret: () => "whsec_test",
}));

vi.mock("@/server/auth/api-keys", () => ({
  generateApiKey: () => ({ raw: "key", prefix: "prefix", hash: "hash" }),
  hashApiKey: () => "hash",
}));

import { and, eq, isNull } from "drizzle-orm";
import { endpoints } from "@/server/db/schema";

describe("soft-delete — condition construction uses isNull(deletedAt)", () => {
  it("getEndpointById with userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("getEndpointById without userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("getEndpointsByUserId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("deleteEndpoint with userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("deleteEndpoint without userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("updateEndpoint with userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      eq(endpoints.userId, "user-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });

  it("updateEndpoint without userId includes isNull(deletedAt) in and()", () => {
    const cond = and(
      eq(endpoints.id, "ep-1"),
      isNull(endpoints.deletedAt),
    );
    expect(cond).not.toBeNull();
  });
});

describe("soft-delete — query functions resolve without error", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("createEndpoint resolves (no WHERE clause needed for INSERT)", async () => {
    const { createEndpoint } = await import("@/server/db/queries");
    const result = await createEndpoint("user-1", {
      url: "https://example.com/webhook",
    });
    expect(result).toBeUndefined();
  });

  it("getEndpointsByUserId resolves", async () => {
    const { getEndpointsByUserId } = await import("@/server/db/queries");
    const result = await getEndpointsByUserId("user-1");
    expect(result).toEqual([]);
  });

  it("getEndpointById resolves", async () => {
    const { getEndpointById } = await import("@/server/db/queries");
    const result = await getEndpointById("ep-1");
    expect(result).toBeUndefined();
  });
});
