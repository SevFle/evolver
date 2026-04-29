import { eq, desc, and, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { users, endpoints, events, deliveries, apiKeys } from "@/server/db/schema";
import type { CreateEndpointRequest, SendEventRequest } from "@/types";
import type { DeliveryStatus } from "@/server/db/schema/enums";
import { generateSigningSecret } from "@/server/services/signing";
import { generateApiKey, hashApiKey } from "@/server/auth/api-keys";
import { TRPCError } from "@trpc/server";

export async function createEndpoint(
  userId: string,
  data: CreateEndpointRequest,
) {
  const secret = generateSigningSecret();
  let hostname: string;
  try {
    hostname = new URL(data.url).hostname;
  } catch {
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

export async function updateEndpoint(
  id: string,
  data: Partial<Pick<typeof endpoints.$inferInsert, "url" | "description" | "customHeaders" | "status">>,
  userId?: string,
) {
  if (data.url) {
    try {
      new URL(data.url);
    } catch {
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
  const [event] = await db
    .insert(events)
    .values({
      userId: data.userId,
      endpointId: data.endpointId,
      payload: data.payload,
      eventType: data.eventType,
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
  endpointId: string;
  payload: Record<string, unknown>;
  eventType: string;
  metadata?: Record<string, unknown>;
  source?: string | null;
  idempotencyKey: string;
  replayedFromEventId: string;
}) {
  const [event] = await db
    .insert(events)
    .values({
      userId: data.userId,
      endpointId: data.endpointId,
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
