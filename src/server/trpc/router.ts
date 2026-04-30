import { z } from "zod";
import { router, protectedProcedure } from "./init";
import { endpointRouter } from "./routers/endpoints";
import { eventRouter } from "./routers/events";
import { analyticsRouter } from "./routers/analytics";
import { subscriptionRouter } from "./routers/subscriptions";
import {
  getDeliveriesByEventId,
  getRecentDeliveriesByEndpoint,
  getDeliveriesByUserId,
  getApiKeysByUserId,
  getFilteredDeliveriesByUserId,
  getDeliveryById,
  getEndpointsByUserId,
} from "@/server/db/queries";
import type { DeliveryStatus } from "@/server/db/schema/enums";

const DELIVERY_STATUSES: [DeliveryStatus, ...DeliveryStatus[]] = [
  "pending",
  "processing",
  "success",
  "failed",
  "retry_scheduled",
  "circuit_open",
  "dead_letter",
];

const deliveryRouter = router({
  listByEvent: protectedProcedure
    .input(z.object({ eventId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return getDeliveriesByEventId(input.eventId, ctx.userId);
    }),
  listByEndpoint: protectedProcedure
    .input(z.object({ endpointId: z.string().uuid() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.endpointId) {
        return getRecentDeliveriesByEndpoint(input.endpointId, ctx.userId);
      }
      return getDeliveriesByUserId(ctx.userId);
    }),
  list: protectedProcedure
    .input(
      z
        .object({
          status: z.array(z.enum(DELIVERY_STATUSES)).optional(),
          endpointId: z.string().uuid().optional(),
          from: z.string().optional(),
          to: z.string().optional(),
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(100).optional(),
        })
        .optional(),
    )
    .query(async ({ input, ctx }) => {
      return getFilteredDeliveriesByUserId(ctx.userId, {
        status: input?.status,
        endpointId: input?.endpointId,
        from: input?.from ? new Date(input.from) : undefined,
        to: input?.to ? new Date(input.to) : undefined,
        cursor: input?.cursor,
        limit: input?.limit,
      });
    }),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      return getDeliveryById(input.id, ctx.userId);
    }),
  filterOptions: protectedProcedure.query(async ({ ctx }) => {
    const endpoints = await getEndpointsByUserId(ctx.userId);
    return {
      statuses: DELIVERY_STATUSES,
      endpoints: endpoints.map((e) => ({ id: e.id, name: e.name, url: e.url })),
    };
  }),
});

const apiKeyRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getApiKeysByUserId(ctx.userId);
  }),
});

export const appRouter = router({
  endpoints: endpointRouter,
  events: eventRouter,
  deliveries: deliveryRouter,
  apiKeys: apiKeyRouter,
  analytics: analyticsRouter,
  subscriptions: subscriptionRouter,
});

export type AppRouter = typeof appRouter;
