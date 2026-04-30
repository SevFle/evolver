import { DELIVERY_TIMEOUT_MS } from "@/lib/constants";
import { signPayload } from "./signing";
import {
  isPrivateIpv4,
  isPrivateIpv6,
  SsrfValidationError,
  validateDeliveryUrl,
} from "./ssrf";

export {
  isPrivateIpv4,
  isPrivateIpv6,
  SsrfValidationError,
  validateDeliveryUrl,
};

const BLOCKED_HEADERS = new Set([
  "authorization",
  "host",
  "cookie",
  "set-cookie",
  "proxy-authorization",
  "proxy-authenticate",
  "www-authenticate",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-forwarded-proto",
  "content-type",
  "x-hookrelay-signature",
  "x-hookrelay-event-id",
]);

export function filterBlockedHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (
      !BLOCKED_HEADERS.has(lower) &&
      !lower.startsWith("x-hookrelay-")
    ) {
      filtered[key] = value;
    }
  }
  return filtered;
}

export interface DeliveryResult {
  statusCode: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  durationMs: number;
  requestHeaders: Record<string, string>;
}

export async function deliverWebhook(
  url: string,
  payload: Record<string, unknown>,
  signingSecret: string,
  eventId: string,
  customHeaders?: Record<string, string> | null,
): Promise<DeliveryResult> {
  await validateDeliveryUrl(url);

  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(body, signingSecret, timestamp);

  const filteredHeaders = customHeaders
    ? filterBlockedHeaders(customHeaders)
    : {};

  const headers: Record<string, string> = {
    ...filteredHeaders,
    "Content-Type": "application/json",
    "X-HookRelay-Signature": signature,
    "X-HookRelay-Event-ID": eventId,
  };

  const start = performance.now();

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
    redirect: "error",
    signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
  });

  const durationMs = Math.round(performance.now() - start);
  const responseBody = await response.text();

  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    statusCode: response.status,
    responseBody,
    responseHeaders,
    durationMs,
    requestHeaders: headers,
  };
}

export function isSuccessfulDelivery(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}
