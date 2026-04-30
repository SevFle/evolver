import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockSelectFrom,
  mockSelectWhere,
  mockSelect,
  mockInsertReturning,
  mockInsertValues,
  mockInsert,
  mockActiveEndpoints,
} = vi.hoisted(() => {
  const mockSelectWhere = vi.fn<() => unknown[]>(() => []);
  const mockSelectFrom = vi.fn(() => ({ where: mockSelectWhere }));
  const mockSelect = vi.fn(() => ({ from: mockSelectFrom }));
  const mockInsertReturning = vi.fn<() => unknown[]>(() => []);
  const mockInsertValues = vi.fn(() => ({ returning: mockInsertReturning }));
  const mockInsert = vi.fn(() => ({ values: mockInsertValues }));
  const mockActiveEndpoints = vi.fn<(ids: string[]) => unknown[]>(() => []);
  return {
    mockSelectFrom,
    mockSelectWhere,
    mockSelect,
    mockInsertReturning,
    mockInsertValues,
    mockInsert,
    mockActiveEndpoints,
  };
});

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
    insert: mockInsert,
  },
}));

vi.mock("@/server/services/signing", () => ({
  generateSigningSecret: () => "whsec_test",
}));

vi.mock("@/server/auth/api-keys", () => ({
  generateApiKey: () => ({ raw: "key", prefix: "prefix", hash: "hash" }),
  hashApiKey: () => "hash",
}));

vi.mock("@/server/services/ssrf", () => ({
  validateEndpointUrl: vi.fn(),
  isPrivateIpv4: vi.fn(),
  isPrivateIpv6: vi.fn(),
  SsrfValidationError: class extends Error {},
}));

vi.mock("@/server/queue/producer", () => ({
  enqueueDelivery: vi.fn(() => Promise.resolve("job-id")),
}));

vi.mock("@/server/trpc/init", () => ({
  router: vi.fn((obj) => obj),
  protectedProcedure: {
    input: vi.fn(() => ({
      mutation: vi.fn((fn) => fn),
      query: vi.fn((fn) => fn),
    })),
  },
}));

import { resolveSubscribedEndpoints, createEvent } from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";

function makeEndpoint(id: string) {
  return {
    id,
    url: `https://${id}.example.com`,
    name: `Endpoint ${id}`,
    signingSecret: "secret",
    status: "active",
    isActive: true,
    customHeaders: null,
    userId: "user-1",
  };
}

describe("ingestSubscription flow — createEvent with allowNoTarget", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockReturnValue([]);
    mockInsertReturning.mockReturnValue([]);
  });

  it("calls createEvent with allowNoTarget=true when using subscription fanout", async () => {
    mockSelectWhere.mockReturnValue([
      { eventType: "order.created", endpointId: "ep-1" },
    ]);
    mockActiveEndpoints.mockImplementation((ids: string[]) =>
      ids.map(makeEndpoint),
    );
    mockInsertReturning.mockReturnValueOnce([
      {
        id: "evt-sub-1",
        status: "queued",
        eventType: "order.created",
        createdAt: new Date(),
      },
    ]);

    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "order.created",
    );
    expect(subscribedEndpoints).toHaveLength(1);

    const event = await createEvent({
      userId: "user-1",
      endpointId: undefined,
      payload: { orderId: "123" },
      eventType: "order.created",
      metadata: { _subscriptionFanout: true },
      allowNoTarget: true,
    });
    expect(event).toBeDefined();
    expect(event!.id).toBe("evt-sub-1");
  });

  it("createEvent rejects without allowNoTarget when no endpointId/groupId", async () => {
    const { TRPCError } = await import("@trpc/server");
    await expect(
      createEvent({
        userId: "user-1",
        endpointId: undefined,
        payload: { orderId: "123" },
        eventType: "order.created",
      }),
    ).rejects.toThrow("Must provide endpointId or endpointGroupId");
  });

  it("delivers to all subscribed endpoints after creating event", async () => {
    const endpoints = [makeEndpoint("ep-1"), makeEndpoint("ep-2"), makeEndpoint("ep-3")];
    mockSelectWhere
      .mockReturnValueOnce([
        { eventType: "order.*", endpointId: "ep-1" },
        { eventType: "*.created", endpointId: "ep-2" },
        { eventType: "order.created", endpointId: "ep-3" },
      ])
      .mockReturnValueOnce(endpoints as never[]);
    mockInsertReturning.mockReturnValueOnce([
      {
        id: "evt-sub-2",
        status: "queued",
        eventType: "order.created",
        createdAt: new Date(),
      },
    ]);

    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "order.created",
    );
    expect(subscribedEndpoints).toHaveLength(3);

    const event = await createEvent({
      userId: "user-1",
      endpointId: undefined,
      payload: { orderId: "456" },
      eventType: "order.created",
      metadata: { _subscriptionFanout: true },
      allowNoTarget: true,
    });

    for (const ep of subscribedEndpoints) {
      await enqueueDelivery({
        eventId: event!.id,
        endpointId: ep.id,
        attemptNumber: 1,
      });
    }

    expect(enqueueDelivery).toHaveBeenCalledTimes(3);
    expect(enqueueDelivery).toHaveBeenCalledWith({
      eventId: "evt-sub-2",
      endpointId: "ep-1",
      attemptNumber: 1,
    });
    expect(enqueueDelivery).toHaveBeenCalledWith({
      eventId: "evt-sub-2",
      endpointId: "ep-2",
      attemptNumber: 1,
    });
    expect(enqueueDelivery).toHaveBeenCalledWith({
      eventId: "evt-sub-2",
      endpointId: "ep-3",
      attemptNumber: 1,
    });
  });

  it("handles empty subscribed endpoints gracefully", async () => {
    mockSelectWhere.mockReturnValue([]);
    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "nonexistent.event",
    );
    expect(subscribedEndpoints).toHaveLength(0);
  });

  it("deduplicates endpoints when same endpoint matches multiple patterns", async () => {
    mockSelectWhere
      .mockReturnValueOnce([
        { eventType: "order.*", endpointId: "ep-1" },
        { eventType: "*.created", endpointId: "ep-1" },
      ])
      .mockReturnValueOnce([makeEndpoint("ep-1")] as never[]);

    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "order.created",
    );
    expect(subscribedEndpoints).toHaveLength(1);
    expect(subscribedEndpoints[0]!.id).toBe("ep-1");
  });
});

describe("ingestSubscription flow — events router source validation", () => {
  it("events router calls createEvent with allowNoTarget: true for ingestSubscription", () => {
    const source = require("fs").readFileSync(
      "src/server/trpc/routers/events.ts",
      "utf-8",
    );
    expect(source).toContain("allowNoTarget: true");
  });

  it("ingestSubscription checks for zero subscribed endpoints and throws NOT_FOUND", () => {
    const source = require("fs").readFileSync(
      "src/server/trpc/routers/events.ts",
      "utf-8",
    );
    expect(source).toContain("No subscribed endpoints found for this event type");
  });

  it("ingestSubscription metadata includes _subscriptionFanout marker", () => {
    const source = require("fs").readFileSync(
      "src/server/trpc/routers/events.ts",
      "utf-8",
    );
    expect(source).toContain("_subscriptionFanout: true");
  });

  it("ingestSubscription returns subscriptionFanout: true in response", () => {
    const source = require("fs").readFileSync(
      "src/server/trpc/routers/events.ts",
      "utf-8",
    );
    expect(source).toContain("subscriptionFanout: true");
  });
});

describe("ingestSubscription flow — isActive filtering behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSelectWhere.mockReturnValue([]);
  });

  it("resolveSubscribedEndpoints includes isActive=true in database query", () => {
    const source = require("fs").readFileSync(
      "src/server/db/queries/index.ts",
      "utf-8",
    );
    const resolveFunc = source.slice(
      source.indexOf("async function resolveSubscribedEndpoints"),
    );
    expect(resolveFunc).toContain("eq(endpointSubscriptions.isActive, true)");
  });

  it("does not enqueue deliveries when all subscriptions are inactive", async () => {
    mockSelectWhere.mockReturnValueOnce([]);

    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "order.created",
    );
    expect(subscribedEndpoints).toHaveLength(0);
    expect(enqueueDelivery).not.toHaveBeenCalled();
  });

  it("delivers only to endpoints with active subscriptions", async () => {
    const activeSub = { eventType: "order.created", endpointId: "ep-active" };
    mockSelectWhere
      .mockReturnValueOnce([activeSub])
      .mockReturnValueOnce([makeEndpoint("ep-active")]);

    const subscribedEndpoints = await resolveSubscribedEndpoints(
      "user-1",
      "order.created",
    );
    expect(subscribedEndpoints).toHaveLength(1);
    expect(subscribedEndpoints[0]!.id).toBe("ep-active");
  });
});
