import { z } from "zod";
import { router, protectedProcedure } from "@/server/trpc/init";
import {
  getAnalyticsOverview,
  getDeliveryTimeline,
  getStatusCodeBreakdown,
  getLatencyHistogram,
  getEndpointHealthSummary,
} from "@/server/db/queries/analytics";
import type { TimeRange } from "@/server/db/queries/analytics";

const timeRangeSchema = z.enum(["24h", "7d", "30d"]);
const optionalEndpointFilter = z.object({ endpointId: z.string().uuid() }).optional();

export const analyticsRouter = router({
  overview: protectedProcedure
    .input(
      z.object({
        range: timeRangeSchema,
        endpointId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return getAnalyticsOverview(
        ctx.userId,
        input.range as TimeRange,
        input.endpointId,
      );
    }),

  timeline: protectedProcedure
    .input(
      z.object({
        range: timeRangeSchema,
        endpointId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return getDeliveryTimeline(
        ctx.userId,
        input.range as TimeRange,
        input.endpointId,
      );
    }),

  statusCodes: protectedProcedure
    .input(
      z.object({
        range: timeRangeSchema,
        endpointId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return getStatusCodeBreakdown(
        ctx.userId,
        input.range as TimeRange,
        input.endpointId,
      );
    }),

  latencyHistogram: protectedProcedure
    .input(
      z.object({
        range: timeRangeSchema,
        endpointId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      return getLatencyHistogram(
        ctx.userId,
        input.range as TimeRange,
        input.endpointId,
      );
    }),

  endpointHealth: protectedProcedure
    .input(
      z.object({
        range: timeRangeSchema,
      }),
    )
    .query(async ({ input, ctx }) => {
      return getEndpointHealthSummary(ctx.userId, input.range as TimeRange);
    }),
});
