import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import {
  createSubscription,
  getSubscriptionsByEndpointId,
  getSubscriptionsByUserId,
  deleteSubscription,
  getEndpointById,
} from "@/server/db/queries";

export const subscriptionRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        endpointId: z.string().uuid(),
        eventType: z.string().min(1).max(255),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const subscription = await createSubscription(
        ctx.userId,
        input.endpointId,
        input.eventType,
      );

      if (!subscription) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "Subscription already exists for this endpoint and event type",
        });
      }

      return subscription;
    }),

  list: protectedProcedure.query(async ({ ctx }) => {
    return getSubscriptionsByUserId(ctx.userId);
  }),

  listByEndpoint: protectedProcedure
    .input(z.object({ endpointId: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.endpointId, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      return getSubscriptionsByEndpointId(input.endpointId, ctx.userId);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const deleted = await deleteSubscription(input.id, ctx.userId);
      if (!deleted) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Subscription not found",
        });
      }
      return { success: true };
    }),
});
