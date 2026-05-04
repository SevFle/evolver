import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  EmailService,
  ConsoleEmailProvider,
  ResendEmailProvider,
  createEmailProvider,
  type EmailProvider,
  type EmailResult,
} from "../../src/services/email";

describe("EmailService", () => {
  describe("ConsoleEmailProvider", () => {
    it("returns success with a generated message ID", async () => {
      const provider = new ConsoleEmailProvider();
      const result = await provider.send({
        to: "test@example.com",
        from: "noreply@shiplens.app",
        subject: "Test",
        html: "<p>Hello</p>",
      });
      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
      expect(result.messageId).toContain("console-");
    });
  });

  describe("ResendEmailProvider", () => {
    it("returns error when API key is not configured", async () => {
      const provider = new ResendEmailProvider("");
      const result = await provider.send({
        to: "test@example.com",
        from: "noreply@shiplens.app",
        subject: "Test",
        html: "<p>Hello</p>",
      });
      expect(result.success).toBe(false);
      expect(result.error).toContain("RESEND_API_KEY not configured");
    });

    it("sends email via Resend API", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "msg-123" }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new ResendEmailProvider("re_test_key");
      const result = await provider.send({
        to: "customer@example.com",
        from: "ShipLens <noreply@shiplens.app>",
        subject: "Your shipment is in transit",
        html: "<p>Tracking update</p>",
        replyTo: "support@shiplens.app",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe("msg-123");
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.resend.com/emails",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer re_test_key",
          }),
        })
      );

      vi.restoreAllMocks();
    });

    it("handles API errors", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Validation error"),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new ResendEmailProvider("re_test_key");
      const result = await provider.send({
        to: "test@example.com",
        from: "noreply@shiplens.app",
        subject: "Test",
        html: "<p>Hello</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("422");
      expect(result.error).toContain("Validation error");

      vi.restoreAllMocks();
    });

    it("handles network errors", async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network timeout"));
      vi.stubGlobal("fetch", mockFetch);

      const provider = new ResendEmailProvider("re_test_key");
      const result = await provider.send({
        to: "test@example.com",
        from: "noreply@shiplens.app",
        subject: "Test",
        html: "<p>Hello</p>",
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain("Network timeout");

      vi.restoreAllMocks();
    });
  });

  describe("EmailService", () => {
    let service: EmailService;
    let mockProvider: EmailProvider;
    let sentMessages: Array<import("../../src/services/email").EmailMessage>;

    beforeEach(() => {
      sentMessages = [];
      mockProvider = {
        send: vi.fn(async (msg) => {
          sentMessages.push(msg);
          return { success: true, messageId: `mock-${Date.now()}` } as EmailResult;
        }),
      };
      service = new EmailService(mockProvider, "Default <default@test.com>");
    });

    it("uses default from address when not specified", async () => {
      await service.send({
        to: "customer@example.com",
        subject: "Test",
        html: "<p>Hi</p>",
      });

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].from).toBe("Default <default@test.com>");
    });

    it("uses custom from address when specified", async () => {
      await service.send({
        to: "customer@example.com",
        from: "Custom <custom@test.com>",
        subject: "Test",
        html: "<p>Hi</p>",
      });

      expect(sentMessages[0].from).toBe("Custom <custom@test.com>");
    });

    it("passes replyTo when provided", async () => {
      await service.send({
        to: "customer@example.com",
        subject: "Test",
        html: "<p>Hi</p>",
        replyTo: "support@test.com",
      });

      expect(sentMessages[0].replyTo).toBe("support@test.com");
    });

    it("returns provider result", async () => {
      const result = await service.send({
        to: "customer@example.com",
        subject: "Test",
        html: "<p>Hi</p>",
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBeDefined();
    });

    it("getDefaultFrom returns configured default", () => {
      expect(service.getDefaultFrom()).toBe("Default <default@test.com>");
    });
  });

  describe("createEmailProvider", () => {
    it("returns ConsoleEmailProvider when no API key set", () => {
      delete process.env.RESEND_API_KEY;
      const provider = createEmailProvider();
      expect(provider).toBeInstanceOf(ConsoleEmailProvider);
    });

    it("returns ConsoleEmailProvider for placeholder key", () => {
      process.env.RESEND_API_KEY = "reSEND_KEY";
      const provider = createEmailProvider();
      expect(provider).toBeInstanceOf(ConsoleEmailProvider);
      delete process.env.RESEND_API_KEY;
    });

    it("returns ResendEmailProvider when valid key is set", () => {
      process.env.RESEND_API_KEY = "re_valid_key_12345";
      const provider = createEmailProvider();
      expect(provider).toBeInstanceOf(ResendEmailProvider);
      delete process.env.RESEND_API_KEY;
    });
  });
});
