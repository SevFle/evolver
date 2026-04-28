import { describe, it, expect, vi, beforeEach } from "vitest";
import dns from "node:dns/promises";
import {
  validateDeliveryUrl,
  isPrivateIpv4,
  isPrivateIpv6,
  SsrfValidationError,
} from "@/server/services/delivery";

vi.mock("node:dns/promises");

describe("SSRF validation", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("isPrivateIpv4", () => {
    it("rejects 10.0.0.0/8 range", () => {
      expect(isPrivateIpv4("10.0.0.1")).toBe(true);
      expect(isPrivateIpv4("10.255.255.255")).toBe(true);
      expect(isPrivateIpv4("10.123.45.67")).toBe(true);
    });

    it("rejects 172.16.0.0/12 range", () => {
      expect(isPrivateIpv4("172.16.0.1")).toBe(true);
      expect(isPrivateIpv4("172.31.255.255")).toBe(true);
      expect(isPrivateIpv4("172.20.10.5")).toBe(true);
    });

    it("rejects 192.168.0.0/16 range", () => {
      expect(isPrivateIpv4("192.168.0.1")).toBe(true);
      expect(isPrivateIpv4("192.168.255.255")).toBe(true);
      expect(isPrivateIpv4("192.168.1.100")).toBe(true);
    });

    it("rejects 127.0.0.0/8 range", () => {
      expect(isPrivateIpv4("127.0.0.1")).toBe(true);
      expect(isPrivateIpv4("127.255.255.255")).toBe(true);
      expect(isPrivateIpv4("127.0.0.53")).toBe(true);
    });

    it("rejects 169.254.0.0/16 (link-local/metadata)", () => {
      expect(isPrivateIpv4("169.254.169.254")).toBe(true);
      expect(isPrivateIpv4("169.254.0.1")).toBe(true);
      expect(isPrivateIpv4("169.254.255.255")).toBe(true);
    });

    it("allows public IPs", () => {
      expect(isPrivateIpv4("8.8.8.8")).toBe(false);
      expect(isPrivateIpv4("1.1.1.1")).toBe(false);
      expect(isPrivateIpv4("203.0.113.1")).toBe(false);
      expect(isPrivateIpv4("142.250.80.46")).toBe(false);
    });
  });

  describe("isPrivateIpv6", () => {
    it("rejects loopback", () => {
      expect(isPrivateIpv6("::1")).toBe(true);
    });

    it("rejects unspecified", () => {
      expect(isPrivateIpv6("::")).toBe(true);
    });

    it("rejects unique local (fc/d)", () => {
      expect(isPrivateIpv6("fc00::1")).toBe(true);
      expect(isPrivateIpv6("fd12:3456::1")).toBe(true);
    });

    it("rejects link-local", () => {
      expect(isPrivateIpv6("fe80::1")).toBe(true);
    });

    it("rejects deprecated site-local", () => {
      expect(isPrivateIpv6("fec0::1")).toBe(true);
    });

    it("allows public IPv6", () => {
      expect(isPrivateIpv6("2606:4700:4700::1111")).toBe(false);
      expect(isPrivateIpv6("2001:4860:4860::8888")).toBe(false);
    });
  });

  describe("validateDeliveryUrl", () => {
    it("rejects non-HTTPS URLs", async () => {
      await expect(
        validateDeliveryUrl("http://example.com/hook"),
      ).rejects.toThrow(SsrfValidationError);

      await expect(
        validateDeliveryUrl("http://example.com/hook"),
      ).rejects.toThrow("Only HTTPS URLs are allowed");
    });

    it("rejects invalid URLs", async () => {
      await expect(validateDeliveryUrl("not-a-url")).rejects.toThrow(
        SsrfValidationError,
      );
    });

    it("rejects cloud metadata hostnames", async () => {
      await expect(
        validateDeliveryUrl("https://metadata.google.internal/computeMetadata/v1/"),
      ).rejects.toThrow(SsrfValidationError);

      await expect(
        validateDeliveryUrl("https://metadata.azure.com/metadata"),
      ).rejects.toThrow(SsrfValidationError);

      await expect(
        validateDeliveryUrl("https://169.254.169.254/latest/meta-data/"),
      ).rejects.toThrow(SsrfValidationError);
    });

    it("rejects hostnames resolving to private IPv4", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("not found"));
      vi.mocked(dns.resolve6).mockResolvedValue(["10.0.0.1"]);

      const { validateDeliveryUrl: freshValidate } = await import(
        "@/server/services/delivery"
      );

      vi.mocked(dns.resolve4).mockResolvedValue(["10.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        freshValidate("https://internal.corp.example.com/hook"),
      ).rejects.toThrow("Hostname resolves to private IP");
    });

    it("rejects hostnames resolving to 172.16.x.x", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["172.16.0.5"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        validateDeliveryUrl("https://myapp.internal/hook"),
      ).rejects.toThrow("Hostname resolves to private IP");
    });

    it("rejects hostnames resolving to 192.168.x.x", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["192.168.1.100"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        validateDeliveryUrl("https://homelan.local/hook"),
      ).rejects.toThrow("Hostname resolves to private IP");
    });

    it("rejects hostnames resolving to 127.x.x.x", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["127.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        validateDeliveryUrl("https://localhost/hook"),
      ).rejects.toThrow("Hostname resolves to private IP");
    });

    it("rejects hostnames resolving to private IPv6", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("not found"));
      vi.mocked(dns.resolve6).mockResolvedValue(["::1"]);

      await expect(
        validateDeliveryUrl("https://ipv6loopback.example.com/hook"),
      ).rejects.toThrow("Hostname resolves to private IPv6");
    });

    it("rejects unresolvable hostnames", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("ENOTFOUND"));
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("ENOTFOUND"));

      await expect(
        validateDeliveryUrl("https://nonexistent.invalid/hook"),
      ).rejects.toThrow("Could not resolve hostname");
    });

    it("allows public HTTPS URLs", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["93.184.216.34"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        validateDeliveryUrl("https://example.com/hook"),
      ).resolves.toBeUndefined();
    });

    it("allows hostnames with only public IPv6", async () => {
      vi.mocked(dns.resolve4).mockRejectedValue(new Error("not found"));
      vi.mocked(dns.resolve6).mockResolvedValue(["2606:4700:4700::1111"]);

      await expect(
        validateDeliveryUrl("https://example.com/hook"),
      ).resolves.toBeUndefined();
    });

    it("rejects if any resolved IP is private", async () => {
      vi.mocked(dns.resolve4).mockResolvedValue(["93.184.216.34", "10.0.0.1"]);
      vi.mocked(dns.resolve6).mockRejectedValue(new Error("not found"));

      await expect(
        validateDeliveryUrl("https://mixed.example.com/hook"),
      ).rejects.toThrow("Hostname resolves to private IP");
    });
  });
});
