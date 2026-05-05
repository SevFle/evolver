import { EventEmitter } from "events";
import { sendMilestoneEmail } from "./send-milestone-email";
import type { ShipmentEmailData, TemplateName, EmailResult } from "./templates/types";

export interface MilestoneEvent {
  shipmentId: string;
  tenantId: string;
  milestoneType: string;
  shipmentData: ShipmentEmailData;
  recipientEmail?: string;
  recipientPhone?: string;
  fromEmail?: string;
  channel?: "email" | "sms" | "both";
}

export interface NotificationLogEntry {
  shipmentId: string;
  channel: "email" | "sms";
  recipient: string;
  status: "pending" | "sent" | "failed";
  providerId?: string;
  error?: string;
  sentAt?: Date;
}

const MILESTONE_TEMPLATE_MAP: Record<string, TemplateName> = {
  picked_up: "picked_up",
  in_transit: "in_transit",
  delivered: "delivered",
  exception: "exception",
};

export class NotificationOrchestrator extends EventEmitter {
  private logs: NotificationLogEntry[] = [];

  constructor() {
    super();
    this.on("milestone", this.handleMilestone.bind(this));
  }

  async handleMilestone(event: MilestoneEvent): Promise<NotificationLogEntry[]> {
    const results: NotificationLogEntry[] = [];
    const channel = event.channel ?? "email";

    if ((channel === "email" || channel === "both") && event.recipientEmail && event.fromEmail) {
      const result = await this.sendEmailNotification(event);
      results.push(result);
    }

    this.logs.push(...results);
    return results;
  }

  private async sendEmailNotification(event: MilestoneEvent): Promise<NotificationLogEntry> {
    const templateName = MILESTONE_TEMPLATE_MAP[event.milestoneType];

    if (!templateName) {
      const entry: NotificationLogEntry = {
        shipmentId: event.shipmentId,
        channel: "email",
        recipient: event.recipientEmail ?? "",
        status: "failed",
        error: `No email template mapped for milestone type: ${event.milestoneType}`,
      };
      return entry;
    }

    const result: EmailResult = await sendMilestoneEmail({
      templateName,
      shipmentData: event.shipmentData,
      to: event.recipientEmail!,
      from: event.fromEmail!,
    });

    return {
      shipmentId: event.shipmentId,
      channel: "email",
      recipient: event.recipientEmail!,
      status: result.success ? "sent" : "failed",
      providerId: result.messageId,
      error: result.error,
      sentAt: result.success ? new Date() : undefined,
    };
  }

  emitMilestone(event: MilestoneEvent): void {
    this.emit("milestone", event);
  }

  getLogs(): NotificationLogEntry[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
  }

  static getTemplateForMilestone(milestoneType: string): TemplateName | undefined {
    return MILESTONE_TEMPLATE_MAP[milestoneType];
  }
}

let orchestratorInstance: NotificationOrchestrator | null = null;

export function getOrchestrator(): NotificationOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new NotificationOrchestrator();
  }
  return orchestratorInstance;
}

export function resetOrchestrator(): void {
  if (orchestratorInstance) {
    orchestratorInstance.removeAllListeners();
    orchestratorInstance = null;
  }
}
