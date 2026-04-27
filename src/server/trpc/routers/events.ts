import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import {
  createEvent,
  getEndpointById,
  getEventById,
  getEventsByEndpointId,
} from "@/server/db/queries";
import { enqueueDelivery } from "@/server/queue/producer";

const ingestEventSchema = z.object({
  endpointId: z.string().uuid(),
  eventType: z.string().min(1).max(255),
  payload: z.record(z.unknown()),
  metadata: z.record(z.unknown()).optional(),
  source: z.string().max(255).optional(),
  idempotencyKey: z.string().max(255).optional(),
});

export const eventRouter = router({
  ingest: protectedProcedure
    .input(ingestEventSchema)
    .mutation(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.endpointId, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }

      if (endpoint.status === "disabled") {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found or disabled",
        });
      }

      const event = await createEvent({
        userId: ctx.userId,
        endpointId: input.endpointId,
        payload: input.payload,
        eventType: input.eventType,
      });

      if (!event) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create event",
        });
      }

      await enqueueDelivery({
        eventId: event.id,
        endpointId: endpoint.id,
        attemptNumber: 1,
      });

      return {
        id: event.id,
        status: event.status,
        eventType: event.eventType,
        createdAt: event.createdAt,
      };
    }),

  list: protectedProcedure
    .input(z.object({ endpointId: z.string().uuid() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.endpointId) {
        return getEventsByEndpointId(input.endpointId, ctx.userId);
      }
      return [];
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const event = await getEventById(input.id, ctx.userId);
      return event ?? null;
    }),
});
