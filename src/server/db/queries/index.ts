import { eq, desc, and } from "drizzle-orm";
import { db } from "@/server/db";
import { endpoints, events, deliveries, apiKeys } from "@/server/db/schema";
import type { CreateEndpointRequest, SendEventRequest } from "@/types";
import { generateSigningSecret } from "@/server/services/signing";
import { generateApiKey, hashApiKey } from "@/server/auth/api-keys";

export async function createEndpoint(
  userId: string,
  data: CreateEndpointRequest,
) {
  const secret = generateSigningSecret();
  const name = data.name ?? new URL(data.url).hostname;
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
    .where(eq(endpoints.userId, userId))
    .orderBy(desc(endpoints.createdAt));
}

export async function getEndpointById(id: string) {
  const [endpoint] = await db
    .select()
    .from(endpoints)
    .where(eq(endpoints.id, id));
  return endpoint ?? null;
}

export async function updateEndpoint(
  id: string,
  data: Partial<Pick<typeof endpoints.$inferInsert, "url" | "description" | "customHeaders" | "status">>,
) {
  const [endpoint] = await db
    .update(endpoints)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(endpoints.id, id))
    .returning();
  return endpoint;
}

export async function deleteEndpoint(id: string) {
  await db.delete(endpoints).where(eq(endpoints.id, id));
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

export async function getEventById(id: string) {
  const [event] = await db
    .select()
    .from(events)
    .where(eq(events.id, id));
  return event ?? null;
}

export async function getEventsByEndpointId(endpointId: string, limit = 50) {
  return db
    .select()
    .from(events)
    .where(eq(events.endpointId, endpointId))
    .orderBy(desc(events.createdAt))
    .limit(limit);
}

export async function createDelivery(data: {
  eventId: string;
  endpointId: string;
  userId: string;
  attemptNumber: number;
  statusCode?: number | null;
  responseBody?: string | null;
  responseHeaders?: Record<string, string> | null;
  durationMs?: number | null;
  status: "pending" | "success" | "failed";
  nextRetryAt?: Date | null;
}) {
  const [delivery] = await db
    .insert(deliveries)
    .values(data)
    .returning();
  return delivery;
}

export async function getDeliveriesByEventId(eventId: string) {
  return db
    .select()
    .from(deliveries)
    .where(eq(deliveries.eventId, eventId))
    .orderBy(desc(deliveries.createdAt));
}

export async function getRecentDeliveriesByEndpoint(
  endpointId: string,
  limit = 20,
) {
  return db
    .select()
    .from(deliveries)
    .where(eq(deliveries.endpointId, endpointId))
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
