import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import {
  createEndpoint,
  getEndpointsByUserId,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
} from "@/server/db/queries";

const createEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  name: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

const updateEndpointSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url("Must be a valid URL").optional(),
  name: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

export const endpointRouter = router({
  create: protectedProcedure
    .input(createEndpointSchema)
    .mutation(async ({ input, ctx }) => {
      const endpoint = await createEndpoint(ctx.userId, input);
      if (!endpoint) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create endpoint",
        });
      }
      return endpoint;
    }),

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

  update: protectedProcedure
    .input(updateEndpointSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const endpoint = await getEndpointById(id, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      const updated = await updateEndpoint(id, data, ctx.userId);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      await deleteEndpoint(input.id, ctx.userId);
      return { success: true };
    }),
});
