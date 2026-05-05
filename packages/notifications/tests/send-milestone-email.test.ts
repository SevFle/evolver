import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMilestoneEmail } from "../../src/send-milestone-email";
import { resetResendClient } from "../../src/email";

vi.mock("../../src/email", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../src/email")>();
  return {
    ...original,
    sendEmail: vi.fn(),
  };
});

import { sendEmail } from "../../src/email";
const mockedSendEmail = vi.mocked(sendEmail);

const shipmentData = {
  trackingId: "SHP-TEST",
  origin: "Shanghai, CN",
  destination: "Los Angeles, US",
  customerName: "Test Customer",
};

describe("sendMilestoneEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetResendClient();
  });

  afterEach(() => {
    resetResendClient();
  });

  it("sends email successfully with valid params", async () => {
    mockedSendEmail.mockResolvedValue({ success: true, messageId: "msg-1" });
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "customer@test.com",
      from: "noreply@shiplens.com",
    });
    expect(result).toEqual({ success: true, messageId: "msg-1" });
    expect(mockedSendEmail).toHaveBeenCalledOnce();
  });

  it("calls sendEmail with generated template content", async () => {
    mockedSendEmail.mockResolvedValue({ success: true, messageId: "msg-2" });
    await sendMilestoneEmail({
      templateName: "delivered",
      shipmentData,
      to: "customer@test.com",
      from: "noreply@shiplens.com",
    });
    const call = mockedSendEmail.mock.calls[0][0];
    expect(call.to).toBe("customer@test.com");
    expect(call.from).toBe("noreply@shiplens.com");
    expect(call.subject).toContain("SHP-TEST");
    expect(call.html).toContain("Shanghai, CN");
    expect(call.text).toContain("Shanghai, CN");
  });

  it("fails when recipient email is empty", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "",
      from: "noreply@shiplens.com",
    });
    expect(result).toEqual({ success: false, error: "Recipient email address is required" });
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("fails when recipient email is whitespace", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "   ",
      from: "noreply@shiplens.com",
    });
    expect(result).toEqual({ success: false, error: "Recipient email address is required" });
  });

  it("fails when recipient email is invalid", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "not-an-email",
      from: "noreply@shiplens.com",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid recipient email address");
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("fails when sender email is empty", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "customer@test.com",
      from: "",
    });
    expect(result).toEqual({ success: false, error: "Sender email address is required" });
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("fails when sender email is invalid", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "customer@test.com",
      from: "bad-sender",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid sender email address");
    expect(mockedSendEmail).not.toHaveBeenCalled();
  });

  it("works with each template name", async () => {
    mockedSendEmail.mockResolvedValue({ success: true, messageId: "msg-ok" });
    const templates = ["picked_up", "in_transit", "delivered", "exception"] as const;
    for (const name of templates) {
      const result = await sendMilestoneEmail({
        templateName: name,
        shipmentData,
        to: "customer@test.com",
        from: "noreply@shiplens.com",
      });
      expect(result.success).toBe(true);
    }
    expect(mockedSendEmail).toHaveBeenCalledTimes(4);
  });

  it("propagates sendEmail failure", async () => {
    mockedSendEmail.mockResolvedValue({ success: false, error: "SMTP timeout" });
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "customer@test.com",
      from: "noreply@shiplens.com",
    });
    expect(result).toEqual({ success: false, error: "SMTP timeout" });
  });

  it("accepts emails with subdomains", async () => {
    mockedSendEmail.mockResolvedValue({ success: true, messageId: "msg-sub" });
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "user@sub.domain.com",
      from: "noreply@mail.shiplens.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects emails with spaces", async () => {
    const result = await sendMilestoneEmail({
      templateName: "picked_up",
      shipmentData,
      to: "user @test.com",
      from: "noreply@shiplens.com",
    });
    expect(result.success).toBe(false);
  });
});
