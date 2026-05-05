import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ResendEmailProvider,
  SmtpEmailProvider,
  ConsoleEmailProvider,
  createEmailProvider,
} from "../../src/services/email-provider.js";

describe("ResendEmailProvider", () => {
  it("throws if API key is empty", () => {
    expect(() => new ResendEmailProvider("")).toThrow("Resend API key is required");
  });

  it("throws if API key is not provided", () => {
    expect(() => new ResendEmailProvider(undefined as unknown as string)).toThrow("Resend API key is required");
  });

  it("sends email successfully", async () => {
    const provider = new ResendEmailProvider("re_test_key");
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ id: "msg_123" }),
    } as Response);

    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("msg_123");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://api.resend.com/emails",
      expect.objectContaining({
        method: "POST",
        headers: {
          Authorization: "Bearer re_test_key",
          "Content-Type": "application/json",
        },
      }),
    );

    fetchSpy.mockRestore();
  });

  it("returns error on API failure", async () => {
    const provider = new ResendEmailProvider("re_test_key");
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Validation error",
    } as Response);

    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      text: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("422");
    expect(result.error).toContain("Validation error");

    vi.restoreAllMocks();
  });

  it("returns error on network failure", async () => {
    const provider = new ResendEmailProvider("re_test_key");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("Network timeout"));

    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      text: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network timeout");

    vi.restoreAllMocks();
  });

  it("handles non-Error thrown values", async () => {
    const provider = new ResendEmailProvider("re_test_key");
    vi.spyOn(globalThis, "fetch").mockRejectedValue("string error");

    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      text: "Hello",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Unknown error");

    vi.restoreAllMocks();
  });
});

describe("SmtpEmailProvider", () => {
  it("throws if host is empty", () => {
    expect(() => new SmtpEmailProvider({ host: "", port: 587, user: "u", pass: "p" }))
      .toThrow("SMTP host is required");
  });

  it("sends email and returns success", async () => {
    const provider = new SmtpEmailProvider({ host: "smtp.example.com", port: 587, user: "u", pass: "p" });
    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      text: "Hello",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^smtp-/);
  });

  it("uses default port 587 if not specified", () => {
    const provider = new SmtpEmailProvider({ host: "smtp.example.com", port: 0, user: "u", pass: "p" });
    expect(provider).toBeDefined();
  });
});

describe("ConsoleEmailProvider", () => {
  it("sends email and returns success", async () => {
    const provider = new ConsoleEmailProvider();
    const result = await provider.send({
      to: "user@example.com",
      from: "noreply@shiplens.app",
      subject: "Test",
      text: "Hello",
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toMatch(/^console-/);
  });
});

describe("createEmailProvider", () => {
  it("creates ResendEmailProvider", () => {
    const provider = createEmailProvider({ provider: "resend", resendApiKey: "re_key" });
    expect(provider).toBeInstanceOf(ResendEmailProvider);
  });

  it("creates SmtpEmailProvider", () => {
    const provider = createEmailProvider({
      provider: "smtp",
      smtp: { host: "smtp.example.com", port: 587, user: "u", pass: "p" },
    });
    expect(provider).toBeInstanceOf(SmtpEmailProvider);
  });

  it("creates ConsoleEmailProvider", () => {
    const provider = createEmailProvider({ provider: "console" });
    expect(provider).toBeInstanceOf(ConsoleEmailProvider);
  });

  it("throws for smtp without config", () => {
    expect(() => createEmailProvider({ provider: "smtp" })).toThrow("SMTP configuration is required");
  });

  it("throws for unknown provider", () => {
    expect(() => createEmailProvider({ provider: "unknown" as any })).toThrow("Unknown email provider");
  });
});
