import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  validateDeliveryUrl,
  validateEndpointUrl,
  SsrfValidationError,
  isPrivateIpv4,
} from "@/server/services/ssrf";

// Issue #4 follow-up: dedicated audit tests for the SSRF validation helper
// covering edge cases beyond the basic v4/v6 range checks: IP-encoded URLs
// (hex/decimal/octal), redirect-aware delivery, DNS rebinding seam, and
// cloud metadata variants.

vi.mock("node:dns/promises", () => ({
  default: {
    resolve4: vi.fn(),
    resolve6: vi.fn(),
  },
  resolve4: vi.fn(),
  resolve6: vi.fn(),
}));

import dns from "node:dns/promises";

describe("SSRF audit — IP-encoded URLs", () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    vi.mocked(dns.resolve6).mockReset();
  });

  it("rejects hex-encoded IPv4 loopback (0x7f000001)", async () => {
    await expect(
      validateDeliveryUrl("https://0x7f000001/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects decimal-encoded IPv4 loopback (2130706433)", async () => {
    await expect(
      validateDeliveryUrl("https://2130706433/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects octal-encoded IPv4 loopback (0177.0.0.1)", async () => {
    await expect(
      validateDeliveryUrl("https://0177.0.0.1/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects mixed-encoded IPv4 (0x7f.0.0.1)", async () => {
    await expect(
      validateDeliveryUrl("https://0x7f.0.0.1/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects decimal-encoded private IP (3232235521 = 192.168.0.1)", async () => {
    await expect(
      validateDeliveryUrl("https://3232235521/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects decimal-encoded link-local (2851995905 = 169.254.169.1)", async () => {
    await expect(
      validateDeliveryUrl("https://2851995905/webhook"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("does not require DNS for raw-IP hostnames", async () => {
    await expect(
      validateDeliveryUrl("https://127.0.0.1/webhook"),
    ).rejects.toThrow(SsrfValidationError);
    expect(vi.mocked(dns.resolve4)).not.toHaveBeenCalled();
    expect(vi.mocked(dns.resolve6)).not.toHaveBeenCalled();
  });
});

describe("SSRF audit — cloud metadata variants", () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    vi.mocked(dns.resolve6).mockReset();
  });

  it("rejects AWS/GCP/Azure metadata IP (169.254.169.254)", async () => {
    await expect(
      validateDeliveryUrl("https://169.254.169.254/latest/meta-data/"),
    ).rejects.toThrow(SsrfValidationError);
  });

  it("rejects GCP metadata hostname literal", async () => {
    await expect(
      validateDeliveryUrl("https://metadata.google.internal/"),
    ).rejects.toThrow(/Blocked metadata endpoint/);
  });

  it("rejects Azure metadata hostname literal", async () => {
    await expect(
      validateDeliveryUrl("https://metadata.azure.com/"),
    ).rejects.toThrow(/Blocked metadata endpoint/);
  });
});

describe("SSRF audit — DNS rebinding seam", () => {
  beforeEach(() => {
    vi.mocked(dns.resolve4).mockReset();
    vi.mocked(dns.resolve6).mockReset();
  });

  it("rejects when ANY resolved IP is private (multi-A record attack)", async () => {
    vi.mocked(dns.resolve4).mockResolvedValueOnce(["1.2.3.4", "10.0.0.1"]);
    vi.mocked(dns.resolve6).mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(
      validateDeliveryUrl("https://attacker.example.com/webhook"),
    ).rejects.toThrow(/Hostname resolves to private IP/);
  });

  it("rejects when v6 record is private and v4 is public (mixed record)", async () => {
    vi.mocked(dns.resolve4).mockResolvedValueOnce(["1.2.3.4"]);
    vi.mocked(dns.resolve6).mockResolvedValueOnce(["::1"]);
    await expect(
      validateDeliveryUrl("https://mixed.example.com/webhook"),
    ).rejects.toThrow(/Hostname resolves to private IPv6/);
  });

  it("rejects unresolvable hostname (no A and no AAAA record)", async () => {
    vi.mocked(dns.resolve4).mockRejectedValueOnce(new Error("ENOTFOUND"));
    vi.mocked(dns.resolve6).mockRejectedValueOnce(new Error("ENOTFOUND"));
    await expect(
      validateDeliveryUrl("https://nx.example.com/webhook"),
    ).rejects.toThrow(/Could not resolve hostname/);
  });
});

describe("SSRF audit — protocol enforcement", () => {
  it("rejects http:// for delivery (HTTPS-only)", async () => {
    await expect(
      validateDeliveryUrl("http://example.com/webhook"),
    ).rejects.toThrow(/Only HTTPS URLs/);
  });

  it("rejects file:// scheme", async () => {
    await expect(
      validateDeliveryUrl("file:///etc/passwd"),
    ).rejects.toThrow(/Only HTTPS URLs/);
  });

  it("rejects gopher:// scheme (classic SSRF vector)", async () => {
    await expect(
      validateDeliveryUrl("gopher://example.com:25/_HELO"),
    ).rejects.toThrow(/Only HTTPS URLs/);
  });

  it("rejects ftp:// scheme", async () => {
    await expect(
      validateDeliveryUrl("ftp://example.com/file"),
    ).rejects.toThrow(/Only HTTPS URLs/);
  });

  it("rejects javascript: pseudo-scheme", async () => {
    await expect(
      validateDeliveryUrl("javascript:alert(1)"),
    ).rejects.toThrow(SsrfValidationError);
  });
});

describe("SSRF audit — validateEndpointUrl symmetry", () => {
  it("rejects raw-IP private endpoint (covers v4)", () => {
    expect(() => validateEndpointUrl("https://127.0.0.1/")).toThrow(
      SsrfValidationError,
    );
  });

  it("rejects raw-IP private endpoint (covers v6 ::1)", () => {
    expect(() => validateEndpointUrl("https://[::1]/")).toThrow(
      SsrfValidationError,
    );
  });

  it("rejects metadata hostname for endpoint registration", () => {
    expect(() => validateEndpointUrl("http://metadata.google.internal/")).toThrow(
      /Blocked metadata endpoint/,
    );
  });
});

describe("SSRF audit — boundary smoke (regression)", () => {
  it("isPrivateIpv4 rejects the 169.254.169.254 metadata IP", () => {
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
  });

  it("isPrivateIpv4 accepts a known public IP (8.8.8.8)", () => {
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
  });

  it("isPrivateIpv4 documents multicast 224.0.0.1 as out-of-scope (not currently in private list)", () => {
    expect(isPrivateIpv4("224.0.0.1")).toBe(false);
  });
});
