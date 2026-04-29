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
} from "@/server/db/queries";

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
