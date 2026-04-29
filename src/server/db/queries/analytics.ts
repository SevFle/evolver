import { sql, eq, and, gte, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/server/db";
import { deliveries, endpoints } from "@/server/db/schema";

export type TimeRange = "24h" | "7d" | "30d";

export function getTimeRangeSince(range: TimeRange): Date {
  const now = new Date();
  switch (range) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }
}

function whereDeliveryConditions(
  userId: string,
  since: Date,
  endpointId?: string,
) {
  const conditions = [
    eq(deliveries.userId, userId),
    gte(deliveries.createdAt, since),
  ];
  if (endpointId) conditions.push(eq(deliveries.endpointId, endpointId));
  return and(...conditions);
}

export async function getAnalyticsOverview(
  userId: string,
  range: TimeRange,
  endpointId?: string,
) {
  const since = getTimeRangeSince(range);
  const where = whereDeliveryConditions(userId, since, endpointId);

  const [row] = await db
    .select({
      totalDeliveries: sql<number>`count(*)::int`,
      successful: sql<number>`count(*) filter (where ${deliveries.status} = 'success')::int`,
      failed: sql<number>`count(*) filter (where ${deliveries.status} = 'failed')::int`,
      pending: sql<number>`count(*) filter (where ${deliveries.status} in ('pending', 'processing', 'retry_scheduled'))::int`,
      avgLatencyMs: sql<number | null>`round(avg(${deliveries.durationMs}))::int`,
      p50Latency:
        sql<number | null>`percentile_cont(0.5) within group (order by ${deliveries.durationMs})::int`,
      p95Latency:
        sql<number | null>`percentile_cont(0.95) within group (order by ${deliveries.durationMs})::int`,
      p99Latency:
        sql<number | null>`percentile_cont(0.99) within group (order by ${deliveries.durationMs})::int`,
    })
    .from(deliveries)
    .where(where);

  const total = row?.totalDeliveries ?? 0;
  const successRate =
    total > 0 ? Math.round(((row?.successful ?? 0) / total) * 100) : null;

  return {
    totalDeliveries: total,
    successful: row?.successful ?? 0,
    failed: row?.failed ?? 0,
    pending: row?.pending ?? 0,
    successRate,
    avgLatencyMs: row?.avgLatencyMs ?? null,
    p50Latency: row?.p50Latency ?? null,
    p95Latency: row?.p95Latency ?? null,
    p99Latency: row?.p99Latency ?? null,
  };
}

export async function getDeliveryTimeline(
  userId: string,
  range: TimeRange,
  endpointId?: string,
) {
  const since = getTimeRangeSince(range);
  const where = whereDeliveryConditions(userId, since, endpointId);

  const bucketExpr =
    range === "24h"
      ? sql<Date>`date_trunc('hour', ${deliveries.createdAt})`
      : sql<Date>`date_trunc('day', ${deliveries.createdAt})`;

  return db
    .select({
      bucket: bucketExpr,
      totalCount: sql<number>`count(*)::int`,
      successCount:
        sql<number>`count(*) filter (where ${deliveries.status} = 'success')::int`,
      failedCount:
        sql<number>`count(*) filter (where ${deliveries.status} = 'failed')::int`,
    })
    .from(deliveries)
    .where(where)
    .groupBy(bucketExpr)
    .orderBy(bucketExpr);
}

export async function getStatusCodeBreakdown(
  userId: string,
  range: TimeRange,
  endpointId?: string,
) {
  const since = getTimeRangeSince(range);
  const conditions = [
    eq(deliveries.userId, userId),
    gte(deliveries.createdAt, since),
    isNotNull(deliveries.responseStatusCode),
  ];
  if (endpointId) conditions.push(eq(deliveries.endpointId, endpointId));
  const where = and(...conditions);

  return db
    .select({
      statusCode: deliveries.responseStatusCode,
      count: sql<number>`count(*)::int`,
    })
    .from(deliveries)
    .where(where)
    .groupBy(deliveries.responseStatusCode)
    .orderBy(sql`count(*) desc`);
}

export async function getLatencyHistogram(
  userId: string,
  range: TimeRange,
  endpointId?: string,
) {
  const since = getTimeRangeSince(range);
  const conditions = [
    eq(deliveries.userId, userId),
    gte(deliveries.createdAt, since),
    isNotNull(deliveries.durationMs),
  ];
  if (endpointId) conditions.push(eq(deliveries.endpointId, endpointId));
  const where = and(...conditions);

  const bucketExpr = sql<string>`
    case
      when ${deliveries.durationMs} < 50 then '0-50ms'
      when ${deliveries.durationMs} < 100 then '50-100ms'
      when ${deliveries.durationMs} < 200 then '100-200ms'
      when ${deliveries.durationMs} < 500 then '200-500ms'
      when ${deliveries.durationMs} < 1000 then '500ms-1s'
      when ${deliveries.durationMs} < 2000 then '1-2s'
      when ${deliveries.durationMs} < 5000 then '2-5s'
      else '5s+'
    end
  `;

  return db
    .select({
      bucket: bucketExpr,
      count: sql<number>`count(*)::int`,
      sortKey: sql<number>`min(${deliveries.durationMs})::int`,
    })
    .from(deliveries)
    .where(where)
    .groupBy(bucketExpr)
    .orderBy(sql`min(${deliveries.durationMs})`);
}

export async function getEndpointHealthSummary(
  userId: string,
  range: TimeRange,
) {
  const since = getTimeRangeSince(range);

  const rows = await db
    .select({
      id: endpoints.id,
      name: endpoints.name,
      url: endpoints.url,
      status: endpoints.status,
      isActive: endpoints.isActive,
      totalDeliveries: sql<number>`count(${deliveries.id})::int`,
      successCount:
        sql<number>`count(*) filter (where ${deliveries.status} = 'success')::int`,
      failedCount:
        sql<number>`count(*) filter (where ${deliveries.status} = 'failed')::int`,
      avgLatencyMs:
        sql<number | null>`round(avg(${deliveries.durationMs}))::int`,
      lastDeliveryAt: sql<Date | null>`max(${deliveries.createdAt})`,
    })
    .from(endpoints)
    .leftJoin(
      deliveries,
      and(
        eq(endpoints.id, deliveries.endpointId),
        gte(deliveries.createdAt, since),
        eq(deliveries.userId, userId),
      ),
    )
    .where(and(eq(endpoints.userId, userId), isNull(endpoints.deletedAt)))
    .groupBy(endpoints.id, endpoints.name, endpoints.url, endpoints.status, endpoints.isActive)
    .orderBy(endpoints.name);

  return rows.map((row) => ({
    ...row,
    successRate:
      row.totalDeliveries > 0
        ? Math.round((row.successCount / row.totalDeliveries) * 100)
        : null,
  }));
}
