import { eq, desc, and, isNull, inArray, sql, ne, gte, lte, lt } from "drizzle-orm";
import { db } from "@/server/db";
import {
  users,
  endpoints,
  events,
  deliveries,
  apiKeys,
  endpointGroups,
  endpointGroupMembers,
  endpointSubscriptions,
} from "@/server/db/schema";
import type { CreateEndpointRequest, SendEventRequest } from "@/types";
import type { DeliveryStatus } from "@/server/db/schema/enums";
import { generateSigningSecret } from "@/server/services/signing";
import { generateApiKey, hashApiKey } from "@/server/auth/api-keys";
import { validateEndpointUrl, SsrfValidationError } from "@/server/services/ssrf";
import { TRPCError } from "@trpc/server";

export function globMatch(pattern: string, input: string): boolean {
  const pLen = pattern.length;
  const iLen = input.length;
  if (pLen === 0) return iLen === 0;

  let prev = new Uint8Array(iLen + 1);
  let curr = new Uint8Array(iLen + 1);

  prev[0] = 1;
  for (let j = 1; j <= iLen; j++) prev[j] = 0;

  for (let i = 1; i <= pLen; i++) {
    curr[0] = prev[0] === 1 && pattern[i - 1] === "*" ? 1 : 0;
    for (let j = 1; j <= iLen; j++) {
      if (pattern[i - 1] === "*") {
        curr[j] = curr[j - 1] === 1 || prev[j] === 1 ? 1 : 0;
      } else {
        curr[j] = prev[j - 1] === 1 && pattern[i - 1] === input[j - 1] ? 1 : 0;
      }
    }
    const tmp = prev;
    prev = curr;
    curr = tmp;
  }

  return prev[iLen] === 1;
}

export async function createEndpoint(
  userId: string,
  data: CreateEndpointRequest,
) {
  const secret = generateSigningSecret();
  let hostname: string;
  try {
    validateEndpointUrl(data.url);
    hostname = new URL(data.url).hostname;
  } catch (err) {
    if (err instanceof SsrfValidationError) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: err.message,
      });
    }
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Invalid URL: ${data.url}`,
    });
  }
  const name = data.name ?? hostname;
  const [endpoint] = await db
    .insert(endpoints)
    .values({
      userId,
      url: data.url,
      name,
      description: data.description ?? null,
      signingSecret: secret,
      customHeaders: data.customHeaders ?? null,
    })
    .returning();
  return endpoint;
}

export async function getEndpointsByUserId(userId: string) {
  return db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.userId, userId), isNull(endpoints.deletedAt)))
    .orderBy(desc(endpoints.createdAt));
}

export async function getEndpointById(id: string, userId?: string) {
  const conditions = userId
    ? and(eq(endpoints.id, id), eq(endpoints.userId, userId), isNull(endpoints.deletedAt))
    : and(eq(endpoints.id, id), isNull(endpoints.deletedAt));
  const [endpoint] = await db
    .select()
    .from(endpoints)
    .where(conditions);
  return endpoint ?? null;
}

export async function getActiveEndpointsByIds(ids: string[], userId?: string) {
  if (ids.length === 0) return [];
  const conditions = userId
    ? and(
        inArray(endpoints.id, ids),
        eq(endpoints.userId, userId),
        isNull(endpoints.deletedAt),
        eq(endpoints.isActive, true),
        ne(endpoints.status, "disabled"),
      )
    : and(
        inArray(endpoints.id, ids),
        isNull(endpoints.deletedAt),
        eq(endpoints.isActive, true),
        ne(endpoints.status, "disabled"),
      );
  return db.select().from(endpoints).where(conditions);
}

export async function updateEndpoint(
  id: string,
  data: Partial<Pick<typeof endpoints.$inferInsert, "url" | "description" | "customHeaders" | "status">>,
  userId?: string,
) {
  if (data.url) {
    try {
      validateEndpointUrl(data.url);
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid URL: ${data.url}`,
      });
    }
  }
  const conditions = userId
    ? and(eq(endpoints.id, id), eq(endpoints.userId, userId), isNull(endpoints.deletedAt))
    : and(eq(endpoints.id, id), isNull(endpoints.deletedAt));
  const [endpoint] = await db
    .update(endpoints)
    .set({ ...data, updatedAt: new Date() })
    .where(conditions)
    .returning();
  return endpoint;
}

export async function deleteEndpoint(id: string, userId?: string) {
  const conditions = userId
    ? and(eq(endpoints.id, id), eq(endpoints.userId, userId), isNull(endpoints.deletedAt))
    : and(eq(endpoints.id, id), isNull(endpoints.deletedAt));
  await db
    .update(endpoints)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(conditions);
}

export async function createEvent(data: SendEventRequest) {
  const endpointId = data.endpointId ?? null;
  const endpointGroupId = data.endpointGroupId ?? null;
  if (!endpointId && !endpointGroupId && !data.allowNoTarget) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Must provide endpointId or endpointGroupId",
    });
  }
  const [event] = await db
    .insert(events)
    .values({
      userId: data.userId,
      endpointId,
      endpointGroupId,
      payload: data.payload,
      eventType: data.eventType,
      idempotencyKey: data.idempotencyKey ?? null,
      metadata: data.metadata ?? {},
      source: data.source ?? null,
    })
    .returning();
  return event;
}

export async function getEventById(id: string, userId?: string) {
  const conditions = userId
    ? and(eq(events.id, id), eq(events.userId, userId))
    : eq(events.id, id);
  const [event] = await db
    .select()
    .from(events)
    .where(conditions);
  return event ?? null;
}

export async function getEventsByEndpointId(endpointId: string, userId?: string, limit = 50) {
  const conditions = userId
    ? and(eq(events.endpointId, endpointId), eq(events.userId, userId))
    : eq(events.endpointId, endpointId);
  return db
    .select()
    .from(events)
    .where(conditions)
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function getEventsByUserId(userId: string, limit = 50) {
  return db
    .select()
    .from(events)
    .where(eq(events.userId, userId))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function createReplayEvent(data: {
  userId: string;
  endpointId: string | null;
  endpointGroupId?: string | null;
  payload: Record<string, unknown>;
  eventType: string;
  metadata?: Record<string, unknown>;
  source?: string | null;
  idempotencyKey: string;
  replayedFromEventId: string;
}) {
  const endpointId = data.endpointId ?? null;
  const endpointGroupId = data.endpointGroupId ?? null;
  if (!endpointId && !endpointGroupId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Must provide endpointId or endpointGroupId",
    });
  }
  const [event] = await db
    .insert(events)
    .values({
      userId: data.userId,
      endpointId,
      endpointGroupId,
      payload: data.payload,
      eventType: data.eventType,
      metadata: data.metadata ?? {},
      source: data.source ?? null,
      idempotencyKey: data.idempotencyKey,
      replayedFromEventId: data.replayedFromEventId,
    })
    .returning();
  return event;
}

export async function getDeliveriesByUserId(userId: string, limit = 50) {
  return db
    .select()
    .from(deliveries)
    .where(eq(deliveries.userId, userId))
    .orderBy(desc(deliveries.createdAt))
    .limit(limit);
}

export type DeliveryFilter = {
  status?: DeliveryStatus[];
  endpointId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: number;
};

export type DeliveryWithDetails = {
  id: string;
  status: DeliveryStatus;
  attemptNumber: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  isReplay: boolean;
  createdAt: Date | null;
  completedAt: Date | null;
  nextRetryAt: Date | null;
  eventId: string;
  endpointId: string;
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  endpointName: string;
  endpointUrl: string;
};

export async function getFilteredDeliveriesByUserId(
  userId: string,
  filter: DeliveryFilter = {},
): Promise<{ items: DeliveryWithDetails[]; nextCursor: string | null }> {
  const limit = filter.limit ?? 50;
  const conditions = [eq(deliveries.userId, userId)];

  if (filter.status && filter.status.length > 0) {
    conditions.push(inArray(deliveries.status, filter.status));
  }
  if (filter.endpointId) {
    conditions.push(eq(deliveries.endpointId, filter.endpointId));
  }
  if (filter.from) {
    conditions.push(gte(deliveries.createdAt, filter.from));
  }
  if (filter.to) {
    conditions.push(lte(deliveries.createdAt, filter.to));
  }
  if (filter.cursor) {
    conditions.push(lt(deliveries.createdAt, new Date(filter.cursor)));
  }

  const rows = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      attemptNumber: deliveries.attemptNumber,
      responseStatusCode: deliveries.responseStatusCode,
      errorMessage: deliveries.errorMessage,
      durationMs: deliveries.durationMs,
      isReplay: deliveries.isReplay,
      createdAt: deliveries.createdAt,
      completedAt: deliveries.completedAt,
      nextRetryAt: deliveries.nextRetryAt,
      eventId: deliveries.eventId,
      endpointId: deliveries.endpointId,
      eventType: events.eventType,
      eventPayload: events.payload,
      endpointName: endpoints.name,
      endpointUrl: endpoints.url,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(and(...conditions))
    .orderBy(desc(deliveries.createdAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore && items[items.length - 1]?.createdAt
    ? items[items.length - 1]!.createdAt!.toISOString()
    : null;

  return { items, nextCursor };
}

export type DeliveryDetail = DeliveryWithDetails & {
  requestHeaders: Record<string, string> | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  maxAttempts: number;
};

export async function getDeliveryById(
  deliveryId: string,
  userId: string,
): Promise<DeliveryDetail | null> {
  const [row] = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      attemptNumber: deliveries.attemptNumber,
      maxAttempts: deliveries.maxAttempts,
      responseStatusCode: deliveries.responseStatusCode,
      responseHeaders: deliveries.responseHeaders,
      responseBody: deliveries.responseBody,
      requestHeaders: deliveries.requestHeaders,
      errorMessage: deliveries.errorMessage,
      durationMs: deliveries.durationMs,
      isReplay: deliveries.isReplay,
      createdAt: deliveries.createdAt,
      completedAt: deliveries.completedAt,
      nextRetryAt: deliveries.nextRetryAt,
      eventId: deliveries.eventId,
      endpointId: deliveries.endpointId,
      eventType: events.eventType,
      eventPayload: events.payload,
      endpointName: endpoints.name,
      endpointUrl: endpoints.url,
    })
    .from(deliveries)
    .innerJoin(events, eq(deliveries.eventId, events.id))
    .innerJoin(endpoints, eq(deliveries.endpointId, endpoints.id))
    .where(and(eq(deliveries.id, deliveryId), eq(deliveries.userId, userId)));

  return row ?? null;
}

export async function getSuccessfulDelivery(
  eventId: string,
  endpointId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: deliveries.id })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.eventId, eventId),
        eq(deliveries.endpointId, endpointId),
        eq(deliveries.status, "success"),
      ),
    )
    .limit(1);
  return !!row;
}

export async function createDelivery(data: {
  eventId: string;
  endpointId: string;
  userId: string;
  attemptNumber: number;
  responseStatusCode?: number | null;
  responseBody?: string | null;
  responseHeaders?: Record<string, string> | null;
  requestHeaders?: Record<string, string> | null;
  durationMs?: number | null;
  errorMessage?: string | null;
  status: DeliveryStatus;
  nextRetryAt?: Date | null;
  completedAt?: Date | null;
  isReplay?: boolean;
}) {
  const [delivery] = await db
    .insert(deliveries)
    .values(data)
    .returning();
  return delivery;
}

export async function getDeliveriesByEventId(eventId: string, userId?: string) {
  const conditions = userId
    ? and(eq(deliveries.eventId, eventId), eq(deliveries.userId, userId))
    : eq(deliveries.eventId, eventId);
  return db
    .select()
    .from(deliveries)
    .where(conditions)
    .orderBy(desc(deliveries.createdAt));
}

export async function getRecentDeliveriesByEndpoint(
  endpointId: string,
  userId?: string,
  limit = 20,
) {
  const conditions = userId
    ? and(eq(deliveries.endpointId, endpointId), eq(deliveries.userId, userId))
    : eq(deliveries.endpointId, endpointId);
  return db
    .select()
    .from(deliveries)
    .where(conditions)
    .orderBy(desc(deliveries.createdAt))
    .limit(limit);
}

export async function getConsecutiveFailures(endpointId: string): Promise<number> {
  const recent = await db
    .select({ status: deliveries.status })
    .from(deliveries)
    .where(eq(deliveries.endpointId, endpointId))
    .orderBy(desc(deliveries.createdAt))
    .limit(10);

  let count = 0;
  for (const d of recent) {
    if (d.status === "failed") {
      count++;
    } else {
      break;
    }
  }
  return count;
}

export async function updateEventStatus(
  eventId: string,
  status: "queued" | "delivering" | "delivered" | "failed",
) {
  await db.update(events).set({ status }).where(eq(events.id, eventId));
}

export async function countPendingDeliveries(eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.eventId, eventId),
        sql`${deliveries.status} in ('pending', 'processing', 'retry_scheduled', 'circuit_open')`,
      ),
    );
  return row?.count ?? 0;
}

export async function countCircuitOpenRetries(
  eventId: string,
  endpointId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.eventId, eventId),
        eq(deliveries.endpointId, endpointId),
        eq(deliveries.status, "circuit_open"),
      ),
    );
  return row?.count ?? 0;
}

export async function deleteDeliveryById(id: string): Promise<void> {
  await db.delete(deliveries).where(eq(deliveries.id, id));
}

export async function atomicCircuitOpenCountAndCreate(data: {
  eventId: string;
  endpointId: string;
  userId: string;
  attemptNumber: number;
  isReplay: boolean;
}): Promise<{ count: number; delivery: { id: string } }> {
  return await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(deliveries)
      .where(
        and(
          eq(deliveries.eventId, data.eventId),
          eq(deliveries.endpointId, data.endpointId),
          eq(deliveries.status, "circuit_open"),
        ),
      );
    const count = row?.count ?? 0;

    if (count > 0) {
      await tx
        .update(deliveries)
        .set({
          status: "failed",
          errorMessage: "Superseded by newer circuit_open delivery",
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(deliveries.eventId, data.eventId),
            eq(deliveries.endpointId, data.endpointId),
            eq(deliveries.status, "circuit_open"),
          ),
        );
    }

    const [delivery] = await tx
      .insert(deliveries)
      .values({
        eventId: data.eventId,
        endpointId: data.endpointId,
        userId: data.userId,
        attemptNumber: data.attemptNumber,
        status: "circuit_open",
        errorMessage: "Circuit breaker open - endpoint is degraded",
        isReplay: data.isReplay,
      })
      .returning();

    if (!delivery) {
      throw new Error("Failed to create circuit_open delivery record");
    }
    return { count, delivery: { id: delivery.id } };
  });
}

export async function updateDeliveryStatus(
  id: string,
  status: DeliveryStatus,
  errorMessage?: string | null,
): Promise<void> {
  const updates: Record<string, unknown> = { status, updatedAt: new Date() };
  if (errorMessage != null) {
    updates.errorMessage = errorMessage;
  }
  await db
    .update(deliveries)
    .set(updates)
    .where(eq(deliveries.id, id));
}

export async function countSuccessfulDeliveries(eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.eventId, eventId),
        eq(deliveries.status, "success"),
      ),
    );
  return row?.count ?? 0;
}

export async function countTotalDeliveries(eventId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(deliveries)
    .where(eq(deliveries.eventId, eventId));
  return row?.count ?? 0;
}

export async function updateFanoutEventStatus(eventId: string): Promise<void> {
  const pending = await countPendingDeliveries(eventId);
  if (pending > 0) return;

  const total = await countTotalDeliveries(eventId);
  if (total === 0) return;

  const succeeded = await countSuccessfulDeliveries(eventId);
  const status = succeeded === total ? "delivered" : "failed";
  await updateEventStatus(eventId, status);
}

export async function createApiKeyForUser(userId: string, name: string) {
  const { raw, prefix, hash } = await generateApiKey();
  await db.insert(apiKeys).values({
    userId,
    keyHash: hash,
    keyPrefix: prefix,
    name,
  });
  return { raw, prefix };
}

export async function getApiKeyByHash(hash: string) {
  const [key] = await db
    .select()
    .from(apiKeys)
    .where(eq(apiKeys.keyHash, hash));
  return key ?? null;
}

export async function getApiKeysByUserId(userId: string) {
  return db
    .select({
      id: apiKeys.id,
      prefix: apiKeys.keyPrefix,
      name: apiKeys.name,
      lastUsedAt: apiKeys.lastUsedAt,
      createdAt: apiKeys.createdAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.userId, userId))
    .orderBy(desc(apiKeys.createdAt));
}

export async function touchApiKeyLastUsed(id: string) {
  await db
    .update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, id));
}

export async function getUserById(id: string) {
  const [user] = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
    })
    .from(users)
    .where(eq(users.id, id));
  return user ?? null;
}

export async function getLastActualDeliveryTimeByEndpoint(
  endpointId: string,
): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: deliveries.createdAt })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.endpointId, endpointId),
        ne(deliveries.status, "circuit_open"),
      ),
    )
    .orderBy(desc(deliveries.createdAt))
    .limit(1);
  return row?.createdAt ?? null;
}

export async function getLastErrorForEndpoint(endpointId: string): Promise<string | null> {
  const [row] = await db
    .select({ errorMessage: deliveries.errorMessage })
    .from(deliveries)
    .where(
      and(
        eq(deliveries.endpointId, endpointId),
        eq(deliveries.status, "failed"),
      ),
    )
    .orderBy(desc(deliveries.createdAt))
    .limit(1);
  return row?.errorMessage ?? null;
}

export async function getDeliveryEndpointIdsByEventId(eventId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ endpointId: deliveries.endpointId })
    .from(deliveries)
    .where(eq(deliveries.eventId, eventId));
  return rows.map((r) => r.endpointId);
}

// Endpoint Group CRUD

export async function createEndpointGroup(userId: string, data: { name: string; description?: string }) {
  const [group] = await db
    .insert(endpointGroups)
    .values({
      userId,
      name: data.name,
      description: data.description ?? null,
    })
    .returning();
  return group;
}

export async function getEndpointGroupById(id: string, userId?: string) {
  const conditions = userId
    ? and(eq(endpointGroups.id, id), eq(endpointGroups.userId, userId))
    : eq(endpointGroups.id, id);
  const [group] = await db
    .select()
    .from(endpointGroups)
    .where(conditions);
  return group ?? null;
}

export async function getEndpointGroupsByUserId(userId: string) {
  return db
    .select()
    .from(endpointGroups)
    .where(eq(endpointGroups.userId, userId))
    .orderBy(desc(endpointGroups.createdAt));
}

export async function updateEndpointGroup(
  id: string,
  data: { name?: string; description?: string },
  userId: string,
) {
  const [group] = await db
    .update(endpointGroups)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(endpointGroups.id, id), eq(endpointGroups.userId, userId)))
    .returning();
  return group ?? null;
}

export async function deleteEndpointGroup(id: string, userId: string) {
  await db
    .delete(endpointGroups)
    .where(and(eq(endpointGroups.id, id), eq(endpointGroups.userId, userId)));
}

export async function addEndpointToGroup(groupId: string, endpointId: string) {
  const [member] = await db
    .insert(endpointGroupMembers)
    .values({ groupId, endpointId })
    .returning();
  return member;
}

export async function removeEndpointFromGroup(groupId: string, endpointId: string) {
  await db
    .delete(endpointGroupMembers)
    .where(
      and(
        eq(endpointGroupMembers.groupId, groupId),
        eq(endpointGroupMembers.endpointId, endpointId),
      ),
    );
}

export async function getEndpointGroupMembers(groupId: string) {
  return db
    .select({
      id: endpointGroupMembers.id,
      groupId: endpointGroupMembers.groupId,
      endpointId: endpointGroupMembers.endpointId,
      createdAt: endpointGroupMembers.createdAt,
      endpoint: {
        id: endpoints.id,
        url: endpoints.url,
        name: endpoints.name,
        status: endpoints.status,
        isActive: endpoints.isActive,
      },
    })
    .from(endpointGroupMembers)
    .innerJoin(endpoints, eq(endpointGroupMembers.endpointId, endpoints.id))
    .where(
      and(
        eq(endpointGroupMembers.groupId, groupId),
        isNull(endpoints.deletedAt),
      ),
    );
}

export async function getGroupEndpointIds(groupId: string): Promise<string[]> {
  const rows = await db
    .select({ endpointId: endpointGroupMembers.endpointId })
    .from(endpointGroupMembers)
    .innerJoin(endpoints, eq(endpointGroupMembers.endpointId, endpoints.id))
    .where(
      and(
        eq(endpointGroupMembers.groupId, groupId),
        isNull(endpoints.deletedAt),
        eq(endpoints.isActive, true),
        ne(endpoints.status, "disabled"),
      ),
    );
  return rows.map((r) => r.endpointId);
}

export async function getEndpointDeliveryStats(endpointId: string, userId?: string) {
  const conditions = userId
    ? and(eq(deliveries.endpointId, endpointId), eq(deliveries.userId, userId))
    : eq(deliveries.endpointId, endpointId);

  const [stats] = await db
    .select({
      totalDeliveries: sql<number>`count(*)::int`,
      successfulDeliveries: sql<number>`count(*) filter (where ${deliveries.status} = 'success')::int`,
      failedDeliveries: sql<number>`count(*) filter (where ${deliveries.status} = 'failed')::int`,
      lastDeliveryAt: sql<Date | null>`max(${deliveries.createdAt})`,
      avgDurationMs: sql<number | null>`avg(${deliveries.durationMs})::int`,
    })
    .from(deliveries)
    .where(conditions);

  const successRate =
    stats && stats.totalDeliveries > 0
      ? Math.round((stats.successfulDeliveries / stats.totalDeliveries) * 100)
      : null;

  return {
    totalDeliveries: stats?.totalDeliveries ?? 0,
    successfulDeliveries: stats?.successfulDeliveries ?? 0,
    failedDeliveries: stats?.failedDeliveries ?? 0,
    successRate,
    lastDeliveryAt: stats?.lastDeliveryAt ?? null,
    avgDurationMs: stats?.avgDurationMs ?? null,
  };
}

export async function getEndpointsWithStats(userId: string) {
  const userEndpoints = await db
    .select()
    .from(endpoints)
    .where(and(eq(endpoints.userId, userId), isNull(endpoints.deletedAt)))
    .orderBy(desc(endpoints.createdAt));

  const statsMap = new Map<string, Awaited<ReturnType<typeof getEndpointDeliveryStats>>>();

  for (const ep of userEndpoints) {
    const stats = await getEndpointDeliveryStats(ep.id, userId);
    statsMap.set(ep.id, stats);
  }

  return userEndpoints.map((ep) => ({
    ...ep,
    stats: statsMap.get(ep.id) ?? {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      successRate: null,
      lastDeliveryAt: null,
      avgDurationMs: null,
    },
  }));
}

export async function rotateEndpointSecret(id: string, userId: string) {
  const secret = generateSigningSecret();
  const conditions = and(
    eq(endpoints.id, id),
    eq(endpoints.userId, userId),
    isNull(endpoints.deletedAt),
  );
  const [updated] = await db
    .update(endpoints)
    .set({ signingSecret: secret, updatedAt: new Date() })
    .where(conditions)
    .returning();
  return updated ?? null;
}

export async function updateEndpointConfig(
  id: string,
  userId: string,
  data: {
    url?: string;
    name?: string;
    description?: string | null;
    customHeaders?: Record<string, string> | null;
    isActive?: boolean;
    maxRetries?: number;
    retrySchedule?: number[];
    rateLimit?: number | null;
  },
) {
  if (data.url) {
    try {
      validateEndpointUrl(data.url);
    } catch (err) {
      if (err instanceof SsrfValidationError) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: err.message,
        });
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: `Invalid URL: ${data.url}`,
      });
    }
  }
  const conditions = and(
    eq(endpoints.id, id),
    eq(endpoints.userId, userId),
    isNull(endpoints.deletedAt),
  );
  const [updated] = await db
    .update(endpoints)
    .set({ ...data, updatedAt: new Date() })
    .where(conditions)
    .returning();
  return updated ?? null;
}

export async function resolveFanoutEndpoints(
  userId: string,
  options: { endpointId?: string; endpointIds?: string[]; endpointGroupId?: string },
): Promise<{ id: string; url: string; name: string; signingSecret: string; status: string; isActive: boolean; customHeaders: Record<string, string> | null; userId: string }[]> {
  if (options.endpointGroupId) {
    const group = await getEndpointGroupById(options.endpointGroupId, userId);
    if (!group) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint group not found" });
    }
    const endpointIds = await getGroupEndpointIds(options.endpointGroupId);
    if (endpointIds.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Endpoint group has no active endpoints",
      });
    }
    const activeEndpoints = await getActiveEndpointsByIds(endpointIds, userId);
    if (activeEndpoints.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No active endpoints found in group",
      });
    }
    return activeEndpoints;
  }

  if (options.endpointIds && options.endpointIds.length > 0) {
    const activeEndpoints = await getActiveEndpointsByIds(options.endpointIds, userId);
    if (activeEndpoints.length !== options.endpointIds.length) {
      const foundIds = new Set(activeEndpoints.map((e) => e.id));
      const missing = options.endpointIds.filter((id) => !foundIds.has(id));
      throw new TRPCError({
        code: "NOT_FOUND",
        message: `Endpoints not found or inactive: ${missing.join(", ")}`,
      });
    }
    return activeEndpoints;
  }

  if (options.endpointId) {
    const endpoint = await getEndpointById(options.endpointId, userId);
    if (!endpoint) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint not found" });
    }
    if (endpoint.status === "disabled") {
      throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint not found or disabled" });
    }
    return [endpoint];
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "Must provide endpointId, endpointIds, or endpointGroupId",
  });
}

export async function createSubscription(
  userId: string,
  endpointId: string,
  eventType: string,
) {
  const endpoint = await getEndpointById(endpointId, userId);
  if (!endpoint) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Endpoint not found" });
  }

  const [subscription] = await db
    .insert(endpointSubscriptions)
    .values({
      userId,
      endpointId,
      eventType,
    })
    .onConflictDoUpdate({
      target: [endpointSubscriptions.endpointId, endpointSubscriptions.eventType],
      set: { isActive: true, updatedAt: new Date() },
    })
    .returning();

  return subscription ?? null;
}

export async function getSubscriptionsByEndpointId(endpointId: string, userId: string) {
  return db
    .select()
    .from(endpointSubscriptions)
    .where(
      and(
        eq(endpointSubscriptions.endpointId, endpointId),
        eq(endpointSubscriptions.userId, userId),
        eq(endpointSubscriptions.isActive, true),
      ),
    )
    .orderBy(desc(endpointSubscriptions.createdAt));
}

export async function getSubscriptionsByUserId(userId: string) {
  return db
    .select()
    .from(endpointSubscriptions)
    .where(
      and(
        eq(endpointSubscriptions.userId, userId),
        eq(endpointSubscriptions.isActive, true),
      ),
    )
    .orderBy(desc(endpointSubscriptions.createdAt));
}

export async function deleteSubscription(id: string, userId: string) {
  const [deleted] = await db
    .update(endpointSubscriptions)
    .set({ isActive: false, updatedAt: new Date() })
    .where(
      and(
        eq(endpointSubscriptions.id, id),
        eq(endpointSubscriptions.userId, userId),
      ),
    )
    .returning();
  return deleted ?? null;
}

export async function getSubscribedEndpointsForEventType(
  userId: string,
  eventType: string,
): Promise<{ id: string; url: string; name: string; signingSecret: string; status: string; isActive: boolean; customHeaders: Record<string, string> | null; userId: string }[]> {
  const subs = await db
    .selectDistinct({ endpointId: endpointSubscriptions.endpointId })
    .from(endpointSubscriptions)
    .where(
      and(
        eq(endpointSubscriptions.userId, userId),
        eq(endpointSubscriptions.isActive, true),
        sql`(${endpointSubscriptions.eventType} = ${eventType} OR ${eventType} LIKE replace(${endpointSubscriptions.eventType}, '*', '%'))`,
      ),
    );

  if (subs.length === 0) return [];

  const ids = subs.map((s) => s.endpointId).filter((id): id is string => id !== null);
  return getActiveEndpointsByIds(ids, userId);
}

export async function resolveSubscribedEndpoints(
  userId: string,
  eventType: string,
): Promise<{ id: string; url: string; name: string; signingSecret: string; status: string; isActive: boolean; customHeaders: Record<string, string> | null; userId: string }[]> {
  const allSubs = await db
    .select({
      eventType: endpointSubscriptions.eventType,
      endpointId: endpointSubscriptions.endpointId,
    })
    .from(endpointSubscriptions)
    .where(
      and(
        eq(endpointSubscriptions.userId, userId),
        eq(endpointSubscriptions.isActive, true),
      ),
    );

  const matchingEndpointIds = new Set<string>();
  for (const sub of allSubs) {
    if (globMatch(sub.eventType, eventType) && sub.endpointId !== null) {
      matchingEndpointIds.add(sub.endpointId);
    }
  }

  if (matchingEndpointIds.size === 0) return [];

  return getActiveEndpointsByIds([...matchingEndpointIds], userId);
}
