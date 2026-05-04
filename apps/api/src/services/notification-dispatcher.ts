import type { EmailService } from "./email";
import { renderSubject, renderBody, type TemplateContext } from "./notification-templates";
import type { MilestoneType } from "@shiplens/shared";

export interface NotificationRecord {
  id: string;
  tenantId: string;
  shipmentId: string;
  milestoneId?: string;
  ruleId?: string;
  channel: string;
  recipient: string;
  subject: string;
  bodySent: string;
  status: string;
  providerId?: string;
  errorMessage?: string;
  retryCount: number;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentInfo {
  id: string;
  tenantId: string;
  trackingId: string;
  origin?: string;
  destination?: string;
  carrier?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}

export interface MilestoneInfo {
  id: string;
  shipmentId: string;
  type: MilestoneType;
  description?: string;
  location?: string;
  occurredAt: string;
}

export interface NotificationRuleInfo {
  id: string;
  tenantId: string;
  milestoneType: MilestoneType;
  channel: string;
  subjectTemplate?: string;
  bodyTemplate?: string;
  enabled: boolean;
}

export interface DispatchResult {
  notifications: NotificationRecord[];
  errors: string[];
}

export interface NotificationStore {
  findRulesForMilestone(tenantId: string, milestoneType: MilestoneType): Promise<NotificationRuleInfo[]>;
  findShipment(shipmentId: string, tenantId: string): Promise<ShipmentInfo | null>;
  insertNotification(notification: Omit<NotificationRecord, "id" | "createdAt" | "updatedAt">): Promise<NotificationRecord>;
  updateNotification(id: string, updates: Partial<NotificationRecord>): Promise<NotificationRecord | null>;
  findNotification(id: string, tenantId: string): Promise<NotificationRecord | null>;
  listNotifications(tenantId: string, filters?: { shipmentId?: string; status?: string; limit?: number; offset?: number }): Promise<{ data: NotificationRecord[]; total: number }>;
  createRule(rule: Omit<NotificationRuleInfo, "id">): Promise<NotificationRuleInfo>;
  updateRule(id: string, tenantId: string, updates: Partial<NotificationRuleInfo>): Promise<NotificationRuleInfo | null>;
  deleteRule(id: string, tenantId: string): Promise<boolean>;
}

export class NotificationDispatcher {
  private emailService: EmailService;
  private store: NotificationStore;
  private trackingUrlBase: string;

  constructor(emailService: EmailService, store: NotificationStore, trackingUrlBase?: string) {
    this.emailService = emailService;
    this.store = store;
    this.trackingUrlBase = trackingUrlBase ?? process.env.TRACKING_URL_BASE ?? "https://track.shiplens.app";
  }

  async dispatchForMilestone(
    shipmentId: string,
    milestone: MilestoneInfo,
    tenantId: string,
    tenantInfo?: { name?: string; primaryColor?: string; slug?: string }
  ): Promise<DispatchResult> {
    const errors: string[] = [];
    const notifications: NotificationRecord[] = [];

    const shipment = await this.store.findShipment(shipmentId, tenantId);
    if (!shipment) {
      return { notifications: [], errors: ["Shipment not found"] };
    }

    const rules = await this.store.findRulesForMilestone(tenantId, milestone.type);
    const enabledRules = rules.filter((r) => r.enabled);
    if (enabledRules.length === 0) {
      return { notifications: [], errors: [] };
    }

    const context = this.buildTemplateContext(shipment, milestone, tenantInfo);

    for (const rule of enabledRules) {
      const recipient = this.resolveRecipient(shipment, rule);
      if (!recipient) {
        errors.push(`No recipient for rule ${rule.id}`);
        continue;
      }

      const subject = rule.subjectTemplate
        ? this.renderCustomTemplate(rule.subjectTemplate, context)
        : renderSubject(milestone.type, context);
      const body = rule.bodyTemplate
        ? this.renderCustomTemplate(rule.bodyTemplate, context)
        : renderBody(milestone.type, context);

      const notification = await this.store.insertNotification({
        tenantId,
        shipmentId,
        milestoneId: milestone.id,
        ruleId: rule.id,
        channel: rule.channel,
        recipient,
        subject,
        bodySent: body,
        status: "pending",
        retryCount: 0,
      });

      if (rule.channel === "email" || rule.channel === "both") {
        const result = await this.emailService.send({
          to: recipient,
          subject,
          html: body,
        });

        if (result.success) {
          const updated = await this.store.updateNotification(notification.id, {
            status: "sent",
            providerId: result.messageId,
            sentAt: new Date().toISOString(),
          });
          if (updated) notifications.push(updated);
        } else {
          errors.push(`Failed to send to ${recipient}: ${result.error}`);
          const updated = await this.store.updateNotification(notification.id, {
            status: "failed",
            errorMessage: result.error,
            retryCount: 1,
          });
          if (updated) notifications.push(updated);
        }
      } else {
        notifications.push(notification);
      }
    }

    return { notifications, errors };
  }

  async resend(notificationId: string, tenantId: string): Promise<DispatchResult> {
    const errors: string[] = [];
    const notifications: NotificationRecord[] = [];

    const existing = await this.store.findNotification(notificationId, tenantId);
    if (!existing) {
      return { notifications: [], errors: ["Notification not found"] };
    }

    if (existing.channel !== "email" && existing.channel !== "both") {
      return { notifications: [], errors: ["Resend only supported for email notifications"] };
    }

    const result = await this.emailService.send({
      to: existing.recipient,
      subject: existing.subject,
      html: existing.bodySent,
    });

    if (result.success) {
      const updated = await this.store.updateNotification(existing.id, {
        status: "sent",
        providerId: result.messageId,
        errorMessage: undefined,
        sentAt: new Date().toISOString(),
        retryCount: existing.retryCount + 1,
      });
      if (updated) notifications.push(updated);
    } else {
      errors.push(`Resend failed: ${result.error}`);
      const updated = await this.store.updateNotification(existing.id, {
        status: "failed",
        errorMessage: result.error,
        retryCount: existing.retryCount + 1,
      });
      if (updated) notifications.push(updated);
    }

    return { notifications, errors };
  }

  async getHistory(
    tenantId: string,
    filters?: { shipmentId?: string; status?: string; limit?: number; offset?: number }
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    return this.store.listNotifications(tenantId, filters);
  }

  private buildTemplateContext(
    shipment: ShipmentInfo,
    milestone: MilestoneInfo,
    tenantInfo?: { name?: string; primaryColor?: string; slug?: string }
  ): TemplateContext {
    const trackingSlug = tenantInfo?.slug ?? "default";
    return {
      trackingId: shipment.trackingId,
      origin: shipment.origin,
      destination: shipment.destination,
      carrier: shipment.carrier,
      customerName: shipment.customerName,
      location: milestone.location,
      description: milestone.description,
      timestamp: milestone.occurredAt,
      trackingUrl: `${this.trackingUrlBase}/${trackingSlug}/${shipment.trackingId}`,
      companyName: tenantInfo?.name ?? "ShipLens",
      primaryColor: tenantInfo?.primaryColor,
    };
  }

  private resolveRecipient(shipment: ShipmentInfo, rule: NotificationRuleInfo): string | null {
    if (rule.channel === "email" || rule.channel === "both") {
      return shipment.customerEmail ?? null;
    }
    return shipment.customerPhone ?? shipment.customerEmail ?? null;
  }

  private renderCustomTemplate(template: string, context: TemplateContext): string {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      const value = (context as unknown as Record<string, string | undefined>)[key];
      return value ?? match;
    });
  }
}
