import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getResendClient, resetResendClient, sendEmail } from "../../src/email";

vi.mock("resend", () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn(() => ({
      emails: { send: mockSend },
    })),
    __mockSend: mockSend,
  };
});

import { Resend } from "resend";
const mockSend = (Resend as any).__mockSend;

describe("getResendClient", () => {
  beforeEach(() => {
    resetResendClient();
    delete process.env.RESEND_API_KEY;
  });

  afterEach(() => {
    resetResendClient();
  });

  it("creates a Resend client when RESEND_API_KEY is set", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const client = getResendClient();
    expect(client).toBeDefined();
    expect(Resend).toHaveBeenCalledWith("re_test_key");
  });

  it("reuses the same client on subsequent calls", () => {
    process.env.RESEND_API_KEY = "re_test_key";
    const client1 = getResendClient();
    const client2 = getResendClient();
    expect(client1).toBe(client2);
    expect(Resend).toHaveBeenCalledTimes(1);
  });

  it("throws when RESEND_API_KEY is not set", () => {
    expect(() => getResendClient()).toThrow("RESEND_API_KEY environment variable is required");
  });

  it("throws when RESEND_API_KEY is empty string", () => {
    process.env.RESEND_API_KEY = "";
    expect(() => getResendClient()).toThrow("RESEND_API_KEY environment variable is required");
  });

  it("throws when RESEND_API_KEY is whitespace only", () => {
    process.env.RESEND_API_KEY = "   ";
    expect(() => getResendClient()).toThrow("RESEND_API_KEY environment variable is required");
  });
});

describe("resetResendClient", () => {
  it("resets the client so a new one is created next time", () => {
    process.env.RESEND_API_KEY = "re_key1";
    const client1 = getResendClient();
    resetResendClient();
    process.env.RESEND_API_KEY = "re_key2";
    const client2 = getResendClient();
    expect(client1).not.toBe(client2);
  });
});

describe("sendEmail", () => {
  beforeEach(() => {
    resetResendClient();
    process.env.RESEND_API_KEY = "re_test_key";
    mockSend.mockReset();
  });

  afterEach(() => {
    resetResendClient();
  });

  it("sends email successfully and returns success result", async () => {
    mockSend.mockResolvedValue({ data: { id: "msg-123" }, error: null });
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test Subject",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result).toEqual({ success: true, messageId: "msg-123" });
    expect(mockSend).toHaveBeenCalledWith({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test Subject",
      html: "<p>Test</p>",
      text: "Test",
    });
  });

  it("returns failure when Resend returns an error", async () => {
    mockSend.mockResolvedValue({ data: null, error: { message: "Rate limited" } });
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result).toEqual({ success: false, error: "Rate limited" });
  });

  it("returns failure when Resend throws an exception", async () => {
    mockSend.mockRejectedValue(new Error("Network error"));
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result).toEqual({ success: false, error: "Network error" });
  });

  it("returns failure with generic message for non-Error throws", async () => {
    mockSend.mockRejectedValue("string error");
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result).toEqual({ success: false, error: "Unknown error sending email" });
  });

  it("returns failure when RESEND_API_KEY is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("RESEND_API_KEY");
  });

  it("returns messageId from data.id", async () => {
    mockSend.mockResolvedValue({ data: { id: "email-xyz-789" }, error: null });
    const result = await sendEmail({
      to: "customer@example.com",
      from: "noreply@shiplens.com",
      subject: "Update",
      html: "<p>Update</p>",
      text: "Update",
    });
    expect(result.messageId).toBe("email-xyz-789");
  });

  it("handles null data gracefully", async () => {
    mockSend.mockResolvedValue({ data: null, error: null });
    const result = await sendEmail({
      to: "to@test.com",
      from: "from@test.com",
      subject: "Test",
      html: "<p>Test</p>",
      text: "Test",
    });
    expect(result).toEqual({ success: true, messageId: undefined });
  });
});
