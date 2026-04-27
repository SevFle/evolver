import { describe, it, expect } from "vitest";
import * as schema from "@/server/db/schema";
import * as dbModule from "@/server/db";

describe("schema module", () => {
  it("exports all required tables", () => {
    expect(schema.users).toBeDefined();
    expect(schema.endpoints).toBeDefined();
    expect(schema.events).toBeDefined();
    expect(schema.deliveries).toBeDefined();
    expect(schema.apiKeys).toBeDefined();
    expect(schema.teams).toBeDefined();
  });

  it("exports all enum types", () => {
    expect(schema.deliveryStatusEnum).toBeDefined();
    expect(schema.eventStatusEnum).toBeDefined();
    expect(schema.endpointStatusEnum).toBeDefined();
    expect(schema.userRoleEnum).toBeDefined();
  });

  it("exports all relations", () => {
    expect(schema.usersRelations).toBeDefined();
    expect(schema.apiKeysRelations).toBeDefined();
    expect(schema.endpointsRelations).toBeDefined();
    expect(schema.eventsRelations).toBeDefined();
    expect(schema.deliveriesRelations).toBeDefined();
    expect(schema.teamsRelations).toBeDefined();
  });

  it("exports inferred types", () => {
    const userType: schema.User = {
      id: "test",
      email: "test@test.com",
      passwordHash: "hash",
      name: null,
      emailVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(userType.id).toBe("test");

    const endpointType: schema.Endpoint = {
      id: "test",
      userId: "user1",
      url: "https://example.com",
      name: "test",
      description: null,
      signingSecret: "secret",
      status: "active",
      customHeaders: null,
      isActive: true,
      disabledReason: null,
      consecutiveFailures: 0,
      maxRetries: 5,
      retrySchedule: [60, 300, 1800, 7200, 43200],
      rateLimit: null,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    expect(endpointType.name).toBe("test");
  });
});

describe("db module safety", () => {
  it("does not export rawSql or sql", () => {
    expect("rawSql" in dbModule).toBe(false);
    expect("sql" in dbModule).toBe(false);
  });

  it("exports db instance", () => {
    expect(dbModule.db).toBeDefined();
  });
});
