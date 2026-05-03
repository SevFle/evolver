import jwt from "jsonwebtoken";

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

export { DEFAULT_SECRET };
