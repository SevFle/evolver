import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import type { NextRequest } from "next/server";
import { appRouter } from "@/server/trpc/router";

export async function POST(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (): { userId?: string } => ({
      userId: req.headers.get("x-user-id") ?? undefined,
    }),
  });
}

export async function GET(req: NextRequest) {
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: (): { userId?: string } => ({
      userId: req.headers.get("x-user-id") ?? undefined,
    }),
  });
}
