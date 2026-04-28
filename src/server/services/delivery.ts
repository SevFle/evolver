import dns from "node:dns/promises";
import { DELIVERY_TIMEOUT_MS } from "@/lib/constants";
import { signPayload } from "./signing";

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

const BLOCKED_METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "169.254.169.254",
]);

export function filterBlockedHeaders(
  headers: Record<string, string>,
): Record<string, string> {
  const filtered: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!BLOCKED_HEADERS.has(key.toLowerCase())) {
      filtered[key] = value;
    }
  }
  return filtered;
}

function ipv4ToNumber(ip: string): number {
  const [a = 0, b = 0, c = 0, d = 0] = ip.split(".").map(Number);
  return ((a << 24) | (b << 16) | (c << 8) | d) >>> 0;
}

interface IpRange {
  start: number;
  end: number;
}

const PRIVATE_IP_RANGES: IpRange[] = [
  { start: 0x0a000000, end: 0x0affffff },
  { start: 0xac100000, end: 0xac1fffff },
  { start: 0xc0a80000, end: 0xc0a8ffff },
  { start: 0x7f000000, end: 0x7fffffff },
  { start: 0xa9fe0000, end: 0xa9feffff },
];

export function isPrivateIpv4(ip: string): boolean {
  const num = ipv4ToNumber(ip);
  return PRIVATE_IP_RANGES.some(
    (range) => num >= range.start && num <= range.end,
  );
}

export function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  if (lower === "::1" || lower === "::") return true;
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true;
  if (lower.startsWith("fe80")) return true;
  if (lower.startsWith("fec0")) return true;
  return false;
}

export class SsrfValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfValidationError";
  }
}

export async function validateDeliveryUrl(url: string): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfValidationError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "https:") {
    throw new SsrfValidationError(
      `Only HTTPS URLs are allowed, got: ${parsed.protocol}`,
    );
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    throw new SsrfValidationError(
      `Blocked metadata endpoint: ${hostname}`,
    );
  }

  let resolved = false;

  try {
    const v4Addresses = await dns.resolve4(hostname);
    resolved = true;
    for (const addr of v4Addresses) {
      if (isPrivateIpv4(addr)) {
        throw new SsrfValidationError(
          `Hostname resolves to private IP: ${addr}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof SsrfValidationError) throw err;
  }

  try {
    const v6Addresses = await dns.resolve6(hostname);
    resolved = true;
    for (const addr of v6Addresses) {
      if (isPrivateIpv6(addr)) {
        throw new SsrfValidationError(
          `Hostname resolves to private IPv6: ${addr}`,
        );
      }
    }
  } catch (err) {
    if (err instanceof SsrfValidationError) throw err;
  }

  if (!resolved) {
    throw new SsrfValidationError(
      `Could not resolve hostname: ${hostname}`,
    );
  }
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
