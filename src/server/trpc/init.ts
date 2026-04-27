import { initTRPC, TRPCError } from "@trpc/server";
import { NextRequest } from "next/server";

export interface Context {
  req?: NextRequest;
  userId?: string;
}

const t = initTRPC.context<Context>().create();

export const router = t.router;
export const publicProcedure = t.procedure;
export const createCallerFactory = t.createCallerFactory;

export const protectedProcedure = t.procedure.use(async (opts) => {
  if (!opts.ctx.userId) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Authentication required",
    });
  }
  return opts.next({
    ctx: { ...opts.ctx, userId: opts.ctx.userId },
  });
});

export const middleware = t.middleware;
