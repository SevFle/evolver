import type { NextRequest } from "next/server";
import { getApiKeyByHash, touchApiKeyLastUsed } from "@/server/db/queries";
import { hashApiKey } from "@/server/auth/api-keys";

interface AuthResult {
  userId: string;
  apiKeyId: string;
}

export async function authenticateApiKey(
  req: NextRequest,
): Promise<AuthResult | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return null;

  const hash = hashApiKey(token);
  const apiKey = await getApiKeyByHash(hash);
  if (!apiKey) return null;

  await touchApiKeyLastUsed(apiKey.id).catch(() => {});

  return { userId: apiKey.userId, apiKeyId: apiKey.id };
}
