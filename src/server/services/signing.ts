import { createHmac } from "node:crypto";

export function generateSigningSecret(): string {
  const bytes = new Uint8Array(32);
  globalThis.crypto.getRandomValues(bytes);
  return `whsec_${Buffer.from(bytes).toString("base64url")}`;
}

export function signPayload(
  payload: string,
  secret: string,
  timestamp: number,
): string {
  const signedPayload = `${timestamp}.${payload}`;
  const signature = createHmac("sha256", secret)
    .update(signedPayload)
    .digest("hex");
  return `t=${timestamp},v1=${signature}`;
}

export function verifySignature(
  payload: string,
  secret: string,
  signature: string,
  toleranceMs = 5 * 60 * 1000,
): boolean {
  const parts = signature.split(",");
  let timestamp: number | null = null;
  let v1: string | null = null;

  for (const part of parts) {
    const [key, value] = part.split("=");
    if (key === "t") timestamp = Number(value);
    if (key === "v1") v1 = value ?? null;
  }

  if (!timestamp || !v1) return false;

  const age = Date.now() - timestamp * 1000;
  if (age > toleranceMs) return false;

  const expected = signPayload(payload, secret, timestamp);
  const expectedV1 = expected.split(",").find((p) => p.startsWith("v1="))?.split("=")[1];
  return expectedV1 === v1;
}
