import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendEmail, getResendClient, resetResendClient } from "../src/email";

vi.mock("resend", () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

describe("email", () => {
  beforeEach(() => {
    resetResendClient();
    process.env.RESEND_API_KEY = "re_test_key_123";
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.RESEND_API_KEY;
  });

  describe("getResendClient", () => {
    it("creates a Resend client with the API key from env", async () => {
      const { Resend } = await import("resend");
      const client = getResendClient();
      expect(client).toBeDefined();
      expect(Resend).toHaveBeenCalledWith("re_test_key_123");
    });

    it("throws if RESEND_API_KEY is not set", () => {
      delete process.env.RESEND_API_KEY;
      resetResendClient();
      expect(() => getResendClient()).toThrow("RESEND_API_KEY environment variable is required");
    });

    it("throws if RESEND_API_KEY is empty string", () => {
      process.env.RESEND_API_KEY = "  ";
      resetResendClient();
      expect(() => getResendClient()).toThrow("RESEND_API_KEY environment variable is required");
    });

    it("returns the same client on subsequent calls (singleton)", () => {
      const client1 = getResendClient();
      const client2 = getResendClient();
      expect(client1).toBe(client2);
    });

    it("creates a new client after reset", async () => {
      const { Resend } = await import("resend");
      const client1 = getResendClient();
      resetResendClient();
      const client2 = getResendClient();
      expect(client1).not.toBe(client2);
      expect(Resend).toHaveBeenCalledTimes(2);
    });
  });

  describe("sendEmail", () => {
    async function getMockSend() {
      const mod = await import("resend");
      return (mod as unknown as { __mockSend: ReturnType<typeof vi.fn> }).__mockSend;
    }

    it("sends email and returns success result with messageId", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_123" }, error: null });

      const result = await sendEmail({
        to: "customer@example.com",
        from: "noreply@shiplens.io",
        subject: "Test Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      });

      expect(result).toEqual({ success: true, messageId: "msg_123" });
      expect(mockSend).toHaveBeenCalledWith({
        to: "customer@example.com",
        from: "noreply@shiplens.io",
        subject: "Test Subject",
        html: "<p>Hello</p>",
        text: "Hello",
      });
    });

    it("returns error when Resend returns an error", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({
        data: null,
        error: { name: "validation_error", message: "Invalid 'to' field" },
      });

      const result = await sendEmail({
        to: "invalid",
        from: "noreply@shiplens.io",
        subject: "Test",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Invalid 'to' field");
    });

    it("handles rate limit errors from Resend", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({
        data: null,
        error: { name: "rate_limit_exceeded", message: "Rate limit exceeded" },
      });

      const result = await sendEmail({
        to: "customer@example.com",
        from: "noreply@shiplens.io",
        subject: "Test",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Rate limit exceeded");
    });

    it("catches thrown exceptions and returns error result", async () => {
      const mockSend = await getMockSend();
      mockSend.mockRejectedValue(new Error("Network timeout"));

      const result = await sendEmail({
        to: "customer@example.com",
        from: "noreply@shiplens.io",
        subject: "Test",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Network timeout");
    });

    it("handles non-Error thrown values", async () => {
      const mockSend = await getMockSend();
      mockSend.mockRejectedValue("string error");

      const result = await sendEmail({
        to: "customer@example.com",
        from: "noreply@shiplens.io",
        subject: "Test",
        html: "<p>Hi</p>",
        text: "Hi",
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe("Unknown error sending email");
    });

    it("passes all fields to Resend SDK correctly", async () => {
      const mockSend = await getMockSend();
      mockSend.mockResolvedValue({ data: { id: "msg_456" }, error: null });

      await sendEmail({
        to: "a@b.com",
        from: "c@d.com",
        subject: "Sub",
        html: "<b>Bold</b>",
        text: "Bold",
      });

      expect(mockSend).toHaveBeenCalledWith({
        to: "a@b.com",
        from: "c@d.com",
        subject: "Sub",
        html: "<b>Bold</b>",
        text: "Bold",
      });
    });
  });
});
