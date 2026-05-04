import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { db, shipments, milestones, shipmentStatusEnum } from "@shiplens/db";
import {
  eq,
  and,
  or,
  like,
  inArray,
  gte,
  lte,
  desc,
  asc,
  sql,
  type SQL,
} from "drizzle-orm";
import type { ShipmentStatus } from "@shiplens/shared";

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

interface ListQuerystring {
  page?: string;
  pageSize?: string;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: string;
}

export async function shipmentRoutes(server: FastifyInstance) {
  server.get(
    "/",
    async (
      request: FastifyRequest<{ Querystring: ListQuerystring }>,
      reply: FastifyReply
    ) => {
      const tenantId = request.tenantId;
      if (!tenantId) {
        return reply
          .status(401)
          .send({ success: false, error: "Authentication required" });
      }

      const {
        page: rawPage,
        pageSize: rawPageSize,
        status: rawStatus,
        search,
        dateFrom,
        dateTo,
        sortBy: rawSortBy,
        sortOrder: rawSortOrder,
      } = request.query;

      const page = Math.max(1, parseInt(rawPage ?? "1", 10) || 1);
      const pageSize = Math.min(
        MAX_PAGE_SIZE,
        Math.max(
          1,
          parseInt(rawPageSize ?? String(DEFAULT_PAGE_SIZE), 10) ||
            DEFAULT_PAGE_SIZE
        )
      );

      const statuses: ShipmentStatus[] = (rawStatus ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter((s): s is ShipmentStatus =>
          (shipmentStatusEnum.enumValues as readonly string[]).includes(s)
        );

      const orderFn = rawSortOrder === "asc" ? asc : desc;

      try {
        const conditions: (SQL | undefined)[] = [
          eq(shipments.tenantId, tenantId),
        ];

        if (statuses.length > 0) {
          conditions.push(inArray(shipments.status, statuses));
        }

        if (search && search.trim().length > 0) {
          const term = `%${search.trim()}%`;
          conditions.push(
            or(
              like(shipments.trackingId, term),
              like(shipments.customerName, term),
              like(shipments.customerEmail, term)
            )
          );
        }

        if (dateFrom) {
          const from = new Date(dateFrom);
          if (!isNaN(from.getTime())) {
            conditions.push(gte(shipments.estimatedDelivery, from));
          }
        }

        if (dateTo) {
          const to = new Date(dateTo);
          if (!isNaN(to.getTime())) {
            to.setHours(23, 59, 59, 999);
            conditions.push(lte(shipments.estimatedDelivery, to));
          }
        }

        const where = and(...conditions);

        const [{ count: totalStr }] = await db
          .select({ count: sql<string>`count(*)::int` })
          .from(shipments)
          .where(where);
        const total = Number(totalStr);

        const offset = (page - 1) * pageSize;

        const shipmentRows = await db
          .select()
          .from(shipments)
          .where(where)
          .orderBy(
            rawSortBy === "trackingId"
              ? orderFn(shipments.trackingId)
              : rawSortBy === "customerName"
                ? orderFn(shipments.customerName)
                : rawSortBy === "origin"
                  ? orderFn(shipments.origin)
                  : rawSortBy === "destination"
                    ? orderFn(shipments.destination)
                    : rawSortBy === "status"
                      ? orderFn(shipments.status)
                      : rawSortBy === "estimatedDelivery"
                        ? orderFn(shipments.estimatedDelivery)
                        : orderFn(shipments.createdAt)
          )
          .limit(pageSize)
          .offset(offset);

        let lastMilestoneMap: Record<
          string,
          (typeof milestones.$inferSelect)[]
        > = {};
        if (shipmentRows.length > 0) {
          const ids = shipmentRows.map((s) => s.id);
          const milestoneRows = await db
            .select()
            .from(milestones)
            .where(inArray(milestones.shipmentId, ids))
            .orderBy(desc(milestones.occurredAt));

          for (const m of milestoneRows) {
            if (!lastMilestoneMap[m.shipmentId]) {
              lastMilestoneMap[m.shipmentId] = [];
            }
            if (lastMilestoneMap[m.shipmentId].length === 0) {
              lastMilestoneMap[m.shipmentId].push(m);
            }
          }
        }

        const data = shipmentRows.map((s) => {
          const ms = lastMilestoneMap[s.id]?.[0];
          return {
            id: s.id,
            trackingId: s.trackingId,
            reference: s.reference,
            origin: s.origin,
            destination: s.destination,
            carrier: s.carrier,
            serviceType: s.serviceType,
            status: s.status,
            customerName: s.customerName,
            customerEmail: s.customerEmail,
            estimatedDelivery: s.estimatedDelivery?.toISOString() ?? null,
            actualDelivery: s.actualDelivery?.toISOString() ?? null,
            lastMilestone: ms
              ? {
                  type: ms.type,
                  description: ms.description,
                  location: ms.location,
                  occurredAt: ms.occurredAt.toISOString(),
                }
              : null,
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          };
        });

        return reply.status(200).send({
          success: true,
          data,
          total,
          page,
          pageSize,
        });
      } catch (err) {
        request.log.error(err, "Failed to list shipments");
        return reply
          .status(500)
          .send({ success: false, error: "Failed to retrieve shipments" });
      }
    }
  );

  server.post("/", async (request, reply) => {
    return reply
      .status(201)
      .send({ success: true, data: null, message: "Shipment created" });
  });

  server.get("/:trackingId", async (request, reply) => {
    const { trackingId } = request.params as { trackingId: string };
    return reply
      .status(200)
      .send({ success: true, data: { trackingId } });
  });
}
