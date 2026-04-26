import { DELIVERY_TIMEOUT_MS } from "@/lib/constants";
import { signPayload } from "./signing";

export interface DeliveryResult {
  statusCode: number;
  responseBody: string;
  responseHeaders: Record<string, string>;
  durationMs: number;
}

export async function deliverWebhook(
  url: string,
  payload: Record<string, unknown>,
  signingSecret: string,
  eventId: string,
  customHeaders?: Record<string, string> | null,
): Promise<DeliveryResult> {
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signPayload(body, signingSecret, timestamp);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-HookRelay-Signature": signature,
    "X-HookRelay-Event-ID": eventId,
    ...customHeaders,
  };

  const start = performance.now();

  const response = await fetch(url, {
    method: "POST",
    headers,
    body,
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
  };
}

export function isSuccessfulDelivery(statusCode: number): boolean {
  return statusCode >= 200 && statusCode < 300;
}
