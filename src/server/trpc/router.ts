import { z } from "zod";
import { router, protectedProcedure } from "./init";
import {
  getEndpointsByUserId,
  getEventsByEndpointId,
  getDeliveriesByEventId,
  getRecentDeliveriesByEndpoint,
  getApiKeysByUserId,
  getEndpointById,
} from "@/server/db/queries";

const endpointRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return getEndpointsByUserId(ctx.userId);
  }),
  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) return null;
      return endpoint;
    }),
});

const eventRouter = router({
  list: protectedProcedure
    .input(z.object({ endpointId: z.string().uuid() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.endpointId) {
        return getEventsByEndpointId(input.endpointId, ctx.userId);
      }
      return [];
    }),
});

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
      return [];
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
});

export type AppRouter = typeof appRouter;
