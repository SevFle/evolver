import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import fp from "fastify-plugin";
import crypto from "crypto";

const CSRF_TOKEN_PREFIX = "csrf_";
const CSRF_SECRET_LENGTH = 32;

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

const PUBLIC_PATH_PREFIXES = ["/api/health", "/api/tracking-pages"];

function isPublicPath(url: string): boolean {
  return PUBLIC_PATH_PREFIXES.some((prefix) => url.startsWith(prefix));
}

export function generateCsrfSecret(): string {
  return crypto.randomBytes(CSRF_SECRET_LENGTH).toString("hex");
}

export function createCsrfToken(secret: string): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(nonce)
    .digest("hex");
  return `${CSRF_TOKEN_PREFIX}${nonce}.${signature}`;
}

export function verifyCsrfToken(token: string, secret: string): boolean {
  if (!token || !token.startsWith(CSRF_TOKEN_PREFIX)) {
    return false;
  }

  const payload = token.slice(CSRF_TOKEN_PREFIX.length);
  const dotIndex = payload.indexOf(".");
  if (dotIndex === -1) {
    return false;
  }

  const nonce = payload.slice(0, dotIndex);
  const providedSignature = payload.slice(dotIndex + 1);
  if (!nonce || !providedSignature) {
    return false;
  }

  const expectedSignature = crypto
    .createHmac("sha256", secret)
    .update(nonce)
    .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature, "hex"),
    Buffer.from(providedSignature, "hex")
  );
}

async function csrfProtection(server: FastifyInstance) {
  const csrfSecret =
    process.env.CSRF_SECRET || process.env.JWT_SECRET || generateCsrfSecret();

  server.decorate("generateCsrfToken", () => createCsrfToken(csrfSecret));

  server.addHook(
    "onRequest",
    async (request: FastifyRequest, reply: FastifyReply) => {
      if (SAFE_METHODS.has(request.method)) {
        return;
      }

      if (isPublicPath(request.url)) {
        return;
      }

      const csrfToken = request.headers["x-csrf-token"] as string | undefined;
      if (!csrfToken) {
        return reply.status(403).send({
          success: false,
          error: "CSRF token missing",
        });
      }

      if (!verifyCsrfToken(csrfToken, csrfSecret)) {
        return reply.status(403).send({
          success: false,
          error: "CSRF token invalid",
        });
      }
    }
  );
}

export const csrfPlugin = fp(csrfProtection, {
  name: "shiplens-csrf",
});

declare module "fastify" {
  interface FastifyInstance {
    generateCsrfToken(): string;
  }
}
