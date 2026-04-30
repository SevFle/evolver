import dns from "node:dns/promises";

const BLOCKED_METADATA_HOSTNAMES = new Set([
  "metadata.google.internal",
  "metadata.azure.com",
  "169.254.169.254",
]);

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

function isRawIpv4(hostname: string): boolean {
  return /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
}

function isRawIpv6(hostname: string): boolean {
  return hostname.includes(":");
}

function stripBrackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;
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

  const hostname = stripBrackets(parsed.hostname.toLowerCase());

  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    throw new SsrfValidationError(
      `Blocked metadata endpoint: ${hostname}`,
    );
  }

  // Raw-IP literals (including hex/octal/decimal-encoded forms which the
  // WHATWG URL parser normalizes to dotted-decimal). DNS resolve would fail
  // with ENOTFOUND on raw IPs, so check explicitly to avoid bypass via the
  // "could not resolve" path being misinterpreted at higher layers.
  if (isRawIpv4(hostname)) {
    if (isPrivateIpv4(hostname)) {
      throw new SsrfValidationError(
        `URL hostname is a private IP address: ${hostname}`,
      );
    }
    return;
  }

  if (isRawIpv6(hostname) && isPrivateIpv6(hostname)) {
    throw new SsrfValidationError(
      `URL hostname is a private IPv6 address: ${hostname}`,
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

export function validateEndpointUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new SsrfValidationError(`Invalid URL: ${url}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new SsrfValidationError(
      `Only HTTP and HTTPS URLs are allowed, got: ${parsed.protocol}`,
    );
  }

  const hostname = stripBrackets(parsed.hostname.toLowerCase());

  if (BLOCKED_METADATA_HOSTNAMES.has(hostname)) {
    throw new SsrfValidationError(
      `Blocked metadata endpoint: ${hostname}`,
    );
  }

  if (isRawIpv4(hostname) && isPrivateIpv4(hostname)) {
    throw new SsrfValidationError(
      `URL hostname is a private IP address: ${hostname}`,
    );
  }

  if (isRawIpv6(hostname) && isPrivateIpv6(hostname)) {
    throw new SsrfValidationError(
      `URL hostname is a private IPv6 address: ${hostname}`,
    );
  }
}
