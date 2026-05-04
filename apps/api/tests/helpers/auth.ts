import jwt from "jsonwebtoken";
import crypto from "crypto";

const DEFAULT_SECRET = "test-secret-for-auth";

export interface TestJwtPayload {
  tenantId: string;
  [key: string]: unknown;
}

export function createTestJwt(
  payload: TestJwtPayload,
  secret: string = DEFAULT_SECRET,
  options?: jwt.SignOptions
): string {
  return jwt.sign(payload, secret, {
    expiresIn: "1h",
    ...options,
  });
}

export function createExpiredJwt(
  payload: TestJwtPayload,
  secret: string = DEFAULT_SECRET
): string {
  return jwt.sign(payload, secret, { expiresIn: "-1s" });
}

export function authBearerHeader(
  tenantId: string,
  extra?: Record<string, unknown>,
  secret?: string
): { authorization: string } {
  const payload: TestJwtPayload = { tenantId, ...extra };
  return {
    authorization: `Bearer ${createTestJwt(payload, secret)}`,
  };
}

export function apiKeyHeader(apiKey: string): { "x-api-key": string } {
  return { "x-api-key": apiKey };
}

export function createCsrfToken(secret: string = DEFAULT_SECRET): string {
  const nonce = crypto.randomBytes(16).toString("hex");
  const signature = crypto
    .createHmac("sha256", secret)
    .update(nonce)
    .digest("hex");
  return `csrf_${nonce}.${signature}`;
}

export function authHeadersWithCsrf(
  tenantId: string,
  csrfSecret: string = DEFAULT_SECRET
): { authorization: string; "x-csrf-token": string } {
  return {
    ...authBearerHeader(tenantId),
    "x-csrf-token": createCsrfToken(csrfSecret),
  };
}

export function apiKeyHeadersWithCsrf(
  apiKey: string,
  csrfSecret: string = DEFAULT_SECRET
): { "x-api-key": string; "x-csrf-token": string } {
  return {
    ...apiKeyHeader(apiKey),
    "x-csrf-token": createCsrfToken(csrfSecret),
  };
}

export { DEFAULT_SECRET };
