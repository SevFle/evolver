import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "@/server/trpc/init";
import {
  createEndpoint,
  getEndpointsByUserId,
  getEndpointById,
  updateEndpoint,
  deleteEndpoint,
  getEndpointDeliveryStats,
  getEndpointsWithStats,
  rotateEndpointSecret,
  updateEndpointConfig,
  getRecentDeliveriesByEndpoint,
} from "@/server/db/queries";

const createEndpointSchema = z.object({
  url: z.string().url("Must be a valid URL"),
  name: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retrySchedule: z.array(z.number().int().min(0)).max(10).optional(),
});

const updateEndpointSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url("Must be a valid URL").optional(),
  name: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
});

const updateEndpointConfigSchema = z.object({
  id: z.string().uuid(),
  url: z.string().url("Must be a valid URL").optional(),
  name: z.string().max(255).optional(),
  description: z.string().max(500).optional(),
  customHeaders: z.record(z.string(), z.string()).optional(),
  isActive: z.boolean().optional(),
  maxRetries: z.number().int().min(0).max(10).optional(),
  retrySchedule: z.array(z.number().int().min(0)).max(10).optional(),
  rateLimit: z.number().int().min(1).nullable().optional(),
});

function stripSecret<T extends Record<string, unknown>>(endpoint: T): Omit<T, "signingSecret"> {
  const { signingSecret: _, ...rest } = endpoint;
  return rest;
}

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
    const endpoints = await getEndpointsByUserId(ctx.userId);
    return endpoints.map(stripSecret);
  }),

  listWithStats: protectedProcedure.query(async ({ ctx }) => {
    const endpoints = await getEndpointsWithStats(ctx.userId);
    return endpoints.map((ep) => stripSecret(ep));
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) return null;
      return stripSecret(endpoint);
    }),

  getWithStats: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) return null;
      const stats = await getEndpointDeliveryStats(input.id, ctx.userId);
      return { ...stripSecret(endpoint), stats };
    }),

  getDeliveries: protectedProcedure
    .input(z.object({ id: z.string().uuid() }).optional())
    .query(async ({ input, ctx }) => {
      if (input?.id) {
        return getRecentDeliveriesByEndpoint(input.id, ctx.userId);
      }
      return [];
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
      return stripSecret(updated);
    }),

  updateConfig: protectedProcedure
    .input(updateEndpointConfigSchema)
    .mutation(async ({ input, ctx }) => {
      const { id, ...data } = input;
      const endpoint = await getEndpointById(id, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      const updated = await updateEndpointConfig(id, ctx.userId, data);
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      return stripSecret(updated);
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

  revealSecret: protectedProcedure
    .input(z.object({
      id: z.string().uuid(),
      confirm: z.literal(true),
    }))
    .query(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      return { signingSecret: endpoint.signingSecret };
    }),

  rotateSecret: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ input, ctx }) => {
      const endpoint = await getEndpointById(input.id, ctx.userId);
      if (!endpoint) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Endpoint not found",
        });
      }
      const updated = await rotateEndpointSecret(input.id, ctx.userId);
      if (!updated) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to rotate secret",
        });
      }
      return { signingSecret: updated.signingSecret };
    }),
});
