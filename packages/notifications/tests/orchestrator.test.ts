import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  NotificationOrchestrator,
  getOrchestrator,
  resetOrchestrator,
} from "../../src/orchestrator";
import type { MilestoneEvent } from "../../src/orchestrator";

vi.mock("../../src/send-milestone-email", () => ({
  sendMilestoneEmail: vi.fn(),
}));

import { sendMilestoneEmail } from "../../src/send-milestone-email";
const mockedSendMilestoneEmail = vi.mocked(sendMilestoneEmail);

const baseEvent: MilestoneEvent = {
  shipmentId: "ship-001",
  tenantId: "tenant-001",
  milestoneType: "picked_up",
  shipmentData: {
    trackingId: "SHP-001",
    origin: "Shanghai",
    destination: "LA",
    customerName: "Alice",
  },
  recipientEmail: "alice@test.com",
  fromEmail: "noreply@shiplens.com",
  channel: "email",
};

describe("NotificationOrchestrator", () => {
  let orchestrator: NotificationOrchestrator;

  beforeEach(() => {
    orchestrator = new NotificationOrchestrator();
    vi.clearAllMocks();
  });

  afterEach(() => {
    orchestrator.removeAllListeners();
  });

  describe("handleMilestone", () => {
    it("sends email for picked_up milestone", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-1" });
      const results = await orchestrator.handleMilestone(baseEvent);
      expect(results).toHaveLength(1);
      expect(results[0].status).toBe("sent");
      expect(results[0].providerId).toBe("msg-1");
      expect(results[0].channel).toBe("email");
      expect(results[0].recipient).toBe("alice@test.com");
    });

    it("sends email for in_transit milestone", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-2" });
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        milestoneType: "in_transit",
      });
      expect(results[0].status).toBe("sent");
    });

    it("sends email for delivered milestone", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-3" });
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        milestoneType: "delivered",
      });
      expect(results[0].status).toBe("sent");
    });

    it("sends email for exception milestone", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-4" });
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        milestoneType: "exception",
      });
      expect(results[0].status).toBe("sent");
    });

    it("records failed status when email fails", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({
        success: false,
        error: "Rate limited",
      });
      const results = await orchestrator.handleMilestone(baseEvent);
      expect(results[0].status).toBe("failed");
      expect(results[0].error).toBe("Rate limited");
      expect(results[0].sentAt).toBeUndefined();
    });

    it("records failed status for unmapped milestone type", async () => {
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        milestoneType: "booked",
      });
      expect(results[0].status).toBe("failed");
      expect(results[0].error).toContain("No email template mapped");
      expect(mockedSendMilestoneEmail).not.toHaveBeenCalled();
    });

    it("returns empty results when no email recipient", async () => {
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        recipientEmail: undefined,
      });
      expect(results).toHaveLength(0);
    });

    it("returns empty results when no fromEmail", async () => {
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        fromEmail: undefined,
      });
      expect(results).toHaveLength(0);
    });

    it("defaults channel to email when not specified", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-d" });
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        channel: undefined,
      });
      expect(results).toHaveLength(1);
    });

    it("sends email when channel is 'both'", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-both" });
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        channel: "both",
      });
      expect(results).toHaveLength(1);
      expect(results[0].channel).toBe("email");
    });

    it("does not send email when channel is 'sms'", async () => {
      const results = await orchestrator.handleMilestone({
        ...baseEvent,
        channel: "sms",
      });
      expect(results).toHaveLength(0);
      expect(mockedSendMilestoneEmail).not.toHaveBeenCalled();
    });

    it("sets sentAt date on successful send", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-date" });
      const before = new Date();
      const results = await orchestrator.handleMilestone(baseEvent);
      const after = new Date();
      expect(results[0].sentAt).toBeDefined();
      expect(results[0].sentAt!.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(results[0].sentAt!.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe("emitMilestone", () => {
    it("emits a milestone event", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-emit" });
      const promise = new Promise<void>((resolve) => {
        orchestrator.on("milestone", async () => {
          resolve();
        });
      });
      orchestrator.emitMilestone(baseEvent);
      await promise;
    });
  });

  describe("getLogs", () => {
    it("returns empty logs initially", () => {
      expect(orchestrator.getLogs()).toEqual([]);
    });

    it("returns logs after handling milestones", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-log" });
      await orchestrator.handleMilestone(baseEvent);
      const logs = orchestrator.getLogs();
      expect(logs).toHaveLength(1);
      expect(logs[0].shipmentId).toBe("ship-001");
      expect(logs[0].status).toBe("sent");
    });

    it("accumulates logs across multiple calls", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-acc" });
      await orchestrator.handleMilestone(baseEvent);
      await orchestrator.handleMilestone({ ...baseEvent, shipmentId: "ship-002" });
      expect(orchestrator.getLogs()).toHaveLength(2);
    });
  });

  describe("clearLogs", () => {
    it("clears all logs", async () => {
      mockedSendMilestoneEmail.mockResolvedValue({ success: true, messageId: "msg-clear" });
      await orchestrator.handleMilestone(baseEvent);
      expect(orchestrator.getLogs()).toHaveLength(1);
      orchestrator.clearLogs();
      expect(orchestrator.getLogs()).toHaveLength(0);
    });
  });

  describe("getTemplateForMilestone", () => {
    it("returns template name for known milestones", () => {
      expect(NotificationOrchestrator.getTemplateForMilestone("picked_up")).toBe("picked_up");
      expect(NotificationOrchestrator.getTemplateForMilestone("in_transit")).toBe("in_transit");
      expect(NotificationOrchestrator.getTemplateForMilestone("delivered")).toBe("delivered");
      expect(NotificationOrchestrator.getTemplateForMilestone("exception")).toBe("exception");
    });

    it("returns undefined for unmapped milestones", () => {
      expect(NotificationOrchestrator.getTemplateForMilestone("booked")).toBeUndefined();
      expect(NotificationOrchestrator.getTemplateForMilestone("departed_origin")).toBeUndefined();
      expect(NotificationOrchestrator.getTemplateForMilestone("unknown")).toBeUndefined();
    });
  });
});

describe("getOrchestrator", () => {
  afterEach(() => {
    resetOrchestrator();
  });

  it("returns singleton instance", () => {
    const o1 = getOrchestrator();
    const o2 = getOrchestrator();
    expect(o1).toBe(o2);
  });
});

describe("resetOrchestrator", () => {
  it("creates new instance after reset", () => {
    const o1 = getOrchestrator();
    resetOrchestrator();
    const o2 = getOrchestrator();
    expect(o1).not.toBe(o2);
  });
});
