import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import jwt from "jsonwebtoken";
import crypto from "crypto";

declare module "fastify" {
  interface FastifyRequest {
    tenantId?: string;
  }
}

export interface JwtPayload {
  tenantId: string;
  [key: string]: unknown;
}

export type ApiKeyResolver = (keyHash: string) => Promise<string | null>;

export interface AuthPluginOptions {
  apiKeyResolver?: ApiKeyResolver;
}

const PUBLIC_PATH_PREFIXES = ["/api/health", "/api/tracking-pages"];

function isPublicPath(url: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function verifyToken(token: string, secret: string): JwtPayload {
  return jwt.verify(token, secret) as JwtPayload;
}

export function hashApiKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function auth(server: FastifyInstance, options: AuthPluginOptions = {}) {
  const { apiKeyResolver } = options;

  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (request.method === "OPTIONS") {
        return;
      }

      if (isPublicPath(request.url)) {
        return;
      }

      const apiKey = request.headers["x-api-key"] as string | undefined;
      const authHeader = request.headers.authorization;

      if (apiKey) {
        const keyHash = hashApiKey(apiKey);

        if (!apiKeyResolver) {
          return reply
            .status(401)
            .send({ success: false, error: "Invalid API key" });
        }

        const tenantId = await apiKeyResolver(keyHash);
        if (!tenantId) {
          return reply
            .status(401)
            .send({ success: false, error: "Invalid API key" });
        }
        request.tenantId = tenantId;
        return;
      }

      if (authHeader?.startsWith("Bearer ")) {
        const token = authHeader.substring(7);
        if (!token) {
          return reply
            .status(401)
            .send({ success: false, error: "Missing token" });
        }

        const secret = process.env.JWT_SECRET;
        if (!secret) {
          return reply
            .status(500)
            .send({ success: false, error: "Server configuration error" });
        }

        try {
          const decoded = verifyToken(token, secret);
          if (!decoded.tenantId) {
            return reply
              .status(401)
              .send({
                success: false,
                error: "Invalid token: missing tenantId claim",
              });
          }
          request.tenantId = decoded.tenantId;
        } catch {
          return reply
            .status(401)
            .send({ success: false, error: "Invalid or expired token" });
        }
        return;
      }

      return reply
        .status(401)
        .send({ success: false, error: "Authentication required" });
    }
  );
}

export const authPlugin = fp(auth, { name: "shiplens-auth" });
