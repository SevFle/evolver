import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { eq, and, isNull, desc } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  apiKeys,
  endpoints,
  events,
  deliveries,
  deliveryStatusEnum,
} from "@/server/db/schema";

const TEST_PREFIX = `test_${Date.now()}_`;

const testIds: { userId: string; apiKeyId: string; endpointId: string; eventId: string } = {
  userId: "",
  apiKeyId: "",
  endpointId: "",
  eventId: "",
};

const createdIds: string[] = [];

function hasDatabase(): boolean {
  return !!process.env.DATABASE_URL;
}

const skipIfNoDb = hasDatabase() ? describe : describe.skip;

beforeAll(async () => {
  if (!hasDatabase()) return;

  const [user] = await db
    .insert(users)
    .values({
      email: `${TEST_PREFIX}integration@test.hookrelay.dev`,
      passwordHash: "scrypt:test_hash_not_for_production",
      name: "Integration Test User",
    })
    .returning();
  testIds.userId = user!.id;
  createdIds.push(user!.id);

  const [apiKey] = await db
    .insert(apiKeys)
    .values({
      userId: testIds.userId,
      name: "Integration Test Key",
      keyHash: `${TEST_PREFIX}fake_hash_for_testing`,
      keyPrefix: "hr_test_",
    })
    .returning();
  testIds.apiKeyId = apiKey!.id;

  const [endpoint] = await db
    .insert(endpoints)
    .values({
      userId: testIds.userId,
      url: "https://example.test/webhook",
      name: "Integration Test Endpoint",
      description: "Created by integration tests",
      signingSecret: "whsec_test_secret_integration",
    })
    .returning();
  testIds.endpointId = endpoint!.id;

  const [event] = await db
    .insert(events)
    .values({
      userId: testIds.userId,
      endpointId: testIds.endpointId,
      eventType: "test.event",
      payload: { test: true, nested: { key: "value" }, array: [1, 2, 3] },
      metadata: { source: "integration-test", traceId: "trace_123" },
    })
    .returning();
  testIds.eventId = event!.id;
});

afterAll(async () => {
  if (!hasDatabase()) return;

  await db.delete(users).where(eq(users.id, testIds.userId));
});

skipIfNoDb("Schema integration tests", () => {
  describe("users table", () => {
    it("persists all columns with timezone-aware timestamps", async () => {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.id, testIds.userId));

      expect(row).toBeDefined();
      expect(row!.id).toBe(testIds.userId);
      expect(row!.email).toContain(TEST_PREFIX);
      expect(row!.passwordHash).toBe("scrypt:test_hash_not_for_production");
      expect(row!.name).toBe("Integration Test User");
      expect(row!.emailVerifiedAt).toBeNull();
      expect(row!.createdAt).toBeInstanceOf(Date);
      expect(row!.updatedAt).toBeInstanceOf(Date);
    });

    it("enforces unique email constraint", async () => {
      await expect(
        db.insert(users).values({
          email: `${TEST_PREFIX}integration@test.hookrelay.dev`,
          passwordHash: "dup",
        }),
      ).rejects.toThrow();
    });
  });

  describe("api_keys table", () => {
    it("stores hashed key with prefix and allows null revoked_at", async () => {
      const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, testIds.apiKeyId));

      expect(row).toBeDefined();
      expect(row!.userId).toBe(testIds.userId);
      expect(row!.name).toBe("Integration Test Key");
      expect(row!.keyHash).toBe(`${TEST_PREFIX}fake_hash_for_testing`);
      expect(row!.keyPrefix).toBe("hr_test_");
      expect(row!.permissions).toEqual([]);
      expect(row!.revokedAt).toBeNull();
      expect(row!.lastUsedAt).toBeNull();
      expect(row!.expiresAt).toBeNull();
    });

    it("allows revocation via revoked_at timestamp", async () => {
      const revokedAt = new Date();
      await db
        .update(apiKeys)
        .set({ revokedAt })
        .where(eq(apiKeys.id, testIds.apiKeyId));

      const [row] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.id, testIds.apiKeyId));

      expect(row!.revokedAt).toBeInstanceOf(Date);

      await db
        .update(apiKeys)
        .set({ revokedAt: null })
        .where(eq(apiKeys.id, testIds.apiKeyId));
    });

    it("partial unique index allows same hash when one is revoked", async () => {
      const sameHash = `${TEST_PREFIX}partial_idx_test_hash`;

      await db.insert(apiKeys).values({
        userId: testIds.userId,
        name: "Key A",
        keyHash: sameHash,
        keyPrefix: "hr_a_",
        revokedAt: new Date(),
      });

      const [revokedKey] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.keyHash, sameHash));

      await db.insert(apiKeys).values({
        userId: testIds.userId,
        name: "Key B",
        keyHash: sameHash,
        keyPrefix: "hr_b_",
      });

      const activeKeys = await db
        .select()
        .from(apiKeys)
        .where(and(eq(apiKeys.keyHash, sameHash), isNull(apiKeys.revokedAt)));

      expect(activeKeys).toHaveLength(1);
      expect(activeKeys[0]!.name).toBe("Key B");

      await db
        .delete(apiKeys)
        .where(eq(apiKeys.keyHash, sameHash));
    });
  });

  describe("endpoints table", () => {
    it("stores endpoint with JSONB defaults", async () => {
      const [row] = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.id, testIds.endpointId));

      expect(row).toBeDefined();
      expect(row!.userId).toBe(testIds.userId);
      expect(row!.url).toBe("https://example.test/webhook");
      expect(row!.name).toBe("Integration Test Endpoint");
      expect(row!.signingSecret).toBe("whsec_test_secret_integration");
      expect(row!.status).toBe("active");
      expect(row!.isActive).toBe(true);
      expect(row!.customHeaders).toEqual({});
      expect(row!.retrySchedule).toEqual([60, 300, 1800, 7200, 43200]);
      expect(row!.consecutiveFailures).toBe(0);
      expect(row!.maxRetries).toBe(5);
      expect(row!.deletedAt).toBeNull();
    });

    it("supports soft delete via deleted_at", async () => {
      const now = new Date();
      await db
        .update(endpoints)
        .set({ deletedAt: now })
        .where(eq(endpoints.id, testIds.endpointId));

      const [deleted] = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.id, testIds.endpointId));

      expect(deleted!.deletedAt).toBeInstanceOf(Date);

      const active = await db
        .select()
        .from(endpoints)
        .where(
          and(
            eq(endpoints.userId, testIds.userId),
            isNull(endpoints.deletedAt),
          ),
        );

      expect(active.find((e) => e.id === testIds.endpointId)).toBeUndefined();

      await db
        .update(endpoints)
        .set({ deletedAt: null })
        .where(eq(endpoints.id, testIds.endpointId));
    });

    it("stores custom headers as JSONB", async () => {
      await db
        .update(endpoints)
        .set({
          customHeaders: {
            "X-Custom-Auth": "Bearer token123",
            "X-Webhook-Version": "v2",
          },
        })
        .where(eq(endpoints.id, testIds.endpointId));

      const [row] = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.id, testIds.endpointId));

      expect(row!.customHeaders).toEqual({
        "X-Custom-Auth": "Bearer token123",
        "X-Webhook-Version": "v2",
      });

      await db
        .update(endpoints)
        .set({ customHeaders: {} })
        .where(eq(endpoints.id, testIds.endpointId));
    });
  });

  describe("events table", () => {
    it("stores JSONB payload with nested objects and arrays", async () => {
      const [row] = await db
        .select()
        .from(events)
        .where(eq(events.id, testIds.eventId));

      expect(row).toBeDefined();
      expect(row!.userId).toBe(testIds.userId);
      expect(row!.endpointId).toBe(testIds.endpointId);
      expect(row!.eventType).toBe("test.event");
      expect(row!.payload).toEqual({
        test: true,
        nested: { key: "value" },
        array: [1, 2, 3],
      });
      expect(row!.metadata).toEqual({
        source: "integration-test",
        traceId: "trace_123",
      });
      expect(row!.status).toBe("queued");
      expect(row!.createdAt).toBeInstanceOf(Date);
    });

    it("events are append-only (no updated_at column)", () => {
      const columns = Object.keys(events);
      expect(columns).not.toContain("updatedAt");
    });

    it("enforces idempotency key uniqueness", async () => {
      const idemKey = `${TEST_PREFIX}idem_unique`;

      await db.insert(events).values({
        userId: testIds.userId,
        endpointId: testIds.endpointId,
        eventType: "test.idempotent",
        payload: { attempt: 1 },
        idempotencyKey: idemKey,
      });

      await expect(
        db.insert(events).values({
          userId: testIds.userId,
          endpointId: testIds.endpointId,
          eventType: "test.idempotent",
          payload: { attempt: 2 },
          idempotencyKey: idemKey,
        }),
      ).rejects.toThrow();
    });
  });

  describe("deliveries table", () => {
    let deliveryId: string;

    beforeEach(async () => {
      const [delivery] = await db
        .insert(deliveries)
        .values({
          eventId: testIds.eventId,
          endpointId: testIds.endpointId,
          userId: testIds.userId,
          status: "pending",
          attemptNumber: 1,
        })
        .returning();
      deliveryId = delivery!.id;
    });

    it("creates delivery with default values", async () => {
      const [row] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, deliveryId));

      expect(row).toBeDefined();
      expect(row!.eventId).toBe(testIds.eventId);
      expect(row!.endpointId).toBe(testIds.endpointId);
      expect(row!.userId).toBe(testIds.userId);
      expect(row!.status).toBe("pending");
      expect(row!.attemptNumber).toBe(1);
      expect(row!.maxAttempts).toBe(5);
      expect(row!.nextRetryAt).toBeNull();
      expect(row!.responseStatusCode).toBeNull();
      expect(row!.durationMs).toBeNull();
      expect(row!.completedAt).toBeNull();
      expect(row!.createdAt).toBeInstanceOf(Date);
      expect(row!.updatedAt).toBeInstanceOf(Date);
    });

    it("supports all delivery_status enum values", async () => {
      const statuses: typeof deliveryStatusEnum.enumValues = [
        "pending",
        "processing",
        "success",
        "failed",
        "retry_scheduled",
        "circuit_open",
        "dead_letter",
      ];

      for (const status of statuses) {
        await db
          .update(deliveries)
          .set({ status })
          .where(eq(deliveries.id, deliveryId));

        const [row] = await db
          .select({ status: deliveries.status })
          .from(deliveries)
          .where(eq(deliveries.id, deliveryId));

        expect(row!.status).toBe(status);
      }
    });

    it("stores response data and timing", async () => {
      const completedAt = new Date();
      await db
        .update(deliveries)
        .set({
          status: "success",
          responseStatusCode: 200,
          responseBody: '{"received": true}',
          responseHeaders: { "content-type": "application/json" },
          requestHeaders: {
            "content-type": "application/json",
            "x-hookrelay-signature": "t=1234,v1=abc",
          },
          durationMs: 245,
          completedAt,
        })
        .where(eq(deliveries.id, deliveryId));

      const [row] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, deliveryId));

      expect(row!.status).toBe("success");
      expect(row!.responseStatusCode).toBe(200);
      expect(row!.responseBody).toBe('{"received": true}');
      expect(row!.responseHeaders).toEqual({
        "content-type": "application/json",
      });
      expect(row!.requestHeaders).toEqual({
        "content-type": "application/json",
        "x-hookrelay-signature": "t=1234,v1=abc",
      });
      expect(row!.durationMs).toBe(245);
      expect(row!.completedAt).toBeInstanceOf(Date);
    });

    it("stores retry scheduling with next_retry_at", async () => {
      const nextRetry = new Date(Date.now() + 60_000);
      await db
        .update(deliveries)
        .set({
          status: "retry_scheduled",
          nextRetryAt: nextRetry,
          attemptNumber: 2,
          errorMessage: "Connection timeout",
        })
        .where(eq(deliveries.id, deliveryId));

      const [row] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.id, deliveryId));

      expect(row!.status).toBe("retry_scheduled");
      expect(row!.nextRetryAt).toBeInstanceOf(Date);
      expect(row!.attemptNumber).toBe(2);
      expect(row!.errorMessage).toBe("Connection timeout");
    });
  });

  describe("cascade deletes", () => {
    it("deleting a user removes all related records", async () => {
      const [cascadeUser] = await db
        .insert(users)
        .values({
          email: `${TEST_PREFIX}cascade@test.hookrelay.dev`,
          passwordHash: "cascade_hash",
          name: "Cascade Test User",
        })
        .returning();

      const cascadeUserId = cascadeUser!.id;

      await db.insert(apiKeys).values({
        userId: cascadeUserId,
        name: "Cascade Key",
        keyHash: `${TEST_PREFIX}cascade_hash`,
        keyPrefix: "hr_casc_",
      });

      const [cascadeEp] = await db
        .insert(endpoints)
        .values({
          userId: cascadeUserId,
          url: "https://cascade.test/webhook",
          name: "Cascade Endpoint",
          signingSecret: "whsec_cascade",
        })
        .returning();

      const [cascadeEvt] = await db
        .insert(events)
        .values({
          userId: cascadeUserId,
          endpointId: cascadeEp!.id,
          eventType: "cascade.event",
          payload: { cascade: true },
        })
        .returning();

      await db.insert(deliveries).values({
        eventId: cascadeEvt!.id,
        endpointId: cascadeEp!.id,
        userId: cascadeUserId,
        status: "pending",
      });

      await db.delete(users).where(eq(users.id, cascadeUserId));

      const [deletedUser] = await db
        .select()
        .from(users)
        .where(eq(users.id, cascadeUserId));
      expect(deletedUser).toBeUndefined();

      const [deletedKey] = await db
        .select()
        .from(apiKeys)
        .where(eq(apiKeys.userId, cascadeUserId));
      expect(deletedKey).toBeUndefined();

      const [deletedEp] = await db
        .select()
        .from(endpoints)
        .where(eq(endpoints.userId, cascadeUserId));
      expect(deletedEp).toBeUndefined();

      const [deletedEvt] = await db
        .select()
        .from(events)
        .where(eq(events.userId, cascadeUserId));
      expect(deletedEvt).toBeUndefined();

      const [deletedDel] = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.userId, cascadeUserId));
      expect(deletedDel).toBeUndefined();
    });
  });

  describe("relational queries", () => {
    it("fetches user with nested relations", async () => {
      const result = await db.query.users.findFirst({
        where: eq(users.id, testIds.userId),
        with: {
          apiKeys: true,
          endpoints: true,
          events: true,
          deliveries: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.apiKeys.length).toBeGreaterThanOrEqual(1);
      expect(result!.endpoints.length).toBeGreaterThanOrEqual(1);
      expect(result!.events.length).toBeGreaterThanOrEqual(1);
    });

    it("fetches event with endpoint and deliveries", async () => {
      const [delivery] = await db
        .insert(deliveries)
        .values({
          eventId: testIds.eventId,
          endpointId: testIds.endpointId,
          userId: testIds.userId,
          status: "success",
          responseStatusCode: 200,
        })
        .returning();

      const result = await db.query.events.findFirst({
        where: eq(events.id, testIds.eventId),
        with: {
          endpoint: true,
          deliveries: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.endpoint).toBeDefined();
      expect(result!.endpoint!.name).toBe("Integration Test Endpoint");
      expect(result!.deliveries.length).toBeGreaterThanOrEqual(1);

      await db.delete(deliveries).where(eq(deliveries.id, delivery!.id));
    });

    it("fetches delivery with event, endpoint, and user", async () => {
      const [delivery] = await db
        .insert(deliveries)
        .values({
          eventId: testIds.eventId,
          endpointId: testIds.endpointId,
          userId: testIds.userId,
          status: "pending",
        })
        .returning();

      const result = await db.query.deliveries.findFirst({
        where: eq(deliveries.id, delivery!.id),
        with: {
          event: true,
          endpoint: true,
          user: true,
        },
      });

      expect(result).toBeDefined();
      expect(result!.event).toBeDefined();
      expect(result!.event!.eventType).toBe("test.event");
      expect(result!.endpoint).toBeDefined();
      expect(result!.endpoint!.name).toBe("Integration Test Endpoint");
      expect(result!.user).toBeDefined();
      expect(result!.user!.email).toContain(TEST_PREFIX);

      await db.delete(deliveries).where(eq(deliveries.id, delivery!.id));
    });
  });

  describe("pagination and ordering", () => {
    it("queries recent deliveries sorted by created_at desc", async () => {
      const result = await db
        .select()
        .from(deliveries)
        .where(eq(deliveries.userId, testIds.userId))
        .orderBy(desc(deliveries.createdAt))
        .limit(50);

      expect(result.length).toBeGreaterThanOrEqual(0);

      if (result.length > 1) {
        for (let i = 1; i < result.length; i++) {
          expect(result[i - 1]!.createdAt >= result[i]!.createdAt).toBe(true);
        }
      }
    });
  });
});
