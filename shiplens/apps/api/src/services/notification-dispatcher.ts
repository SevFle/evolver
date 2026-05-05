import type {
  NotificationChannel,
  ShipmentStatus,
  SendEmailPayload,
  SendResult,
} from "@shiplens/types";
import type { EmailProvider } from "./email-provider.js";
import {
  renderNotificationTemplate,
  getDefaultTemplate,
  type TemplateData,
  type TemplateVariables,
} from "./template-engine.js";

export interface NotificationRule {
  id: string;
  tenantId: string;
  triggerStatus: ShipmentStatus;
  channel: NotificationChannel;
  templateId?: string | null;
  isEnabled: boolean;
  delayMinutes?: number | null;
}

export interface NotificationDispatchRequest {
  shipmentId: string;
  tenantId: string;
  milestoneStatus: ShipmentStatus;
  channel: NotificationChannel;
  recipient: string;
  templateData?: TemplateData;
  templateVariables: TemplateVariables;
  fromEmail?: string;
  fromSmsNumber?: string;
}

export interface NotificationDispatchResult {
  success: boolean;
  channel: NotificationChannel;
  recipient: string;
  sendResult?: SendResult;
  error?: string;
}

export class NotificationDispatcher {
  private emailProvider: EmailProvider;

  constructor(emailProvider: EmailProvider) {
    this.emailProvider = emailProvider;
  }

  async dispatch(request: NotificationDispatchRequest): Promise<NotificationDispatchResult> {
    if (!request.recipient) {
      return {
        success: false,
        channel: request.channel,
        recipient: request.recipient,
        error: "Recipient is required",
      };
    }

    const template = request.templateData ?? getDefaultTemplate(request.milestoneStatus, request.channel);
    const rendered = renderNotificationTemplate(template, request.templateVariables);

    switch (request.channel) {
      case "email":
        return this.dispatchEmail(request, rendered);
      case "sms":
        return this.dispatchSms(request, rendered);
      default:
        return {
          success: false,
          channel: request.channel,
          recipient: request.recipient,
          error: `Unsupported channel: ${request.channel}`,
        };
    }
  }

  private async dispatchEmail(
    request: NotificationDispatchRequest,
    rendered: { subject: string; bodyHtml?: string; bodyText?: string },
  ): Promise<NotificationDispatchResult> {
    const emailPayload: SendEmailPayload = {
      to: request.recipient,
      from: request.fromEmail ?? "notifications@shiplens.app",
      subject: rendered.subject || `Shipment Update - ${request.templateVariables.trackingId}`,
      html: rendered.bodyHtml,
      text: rendered.bodyText,
    };

    const sendResult = await this.emailProvider.send(emailPayload);

    return {
      success: sendResult.success,
      channel: "email",
      recipient: request.recipient,
      sendResult,
      error: sendResult.error,
    };
  }

  private async dispatchSms(
    request: NotificationDispatchRequest,
    rendered: { subject: string; bodyHtml?: string; bodyText?: string },
  ): Promise<NotificationDispatchResult> {
    const body = rendered.bodyText || rendered.bodyHtml || "";
    if (!body) {
      return {
        success: false,
        channel: "sms",
        recipient: request.recipient,
        error: "SMS body is empty",
      };
    }

    return {
      success: true,
      channel: "sms",
      recipient: request.recipient,
      sendResult: { success: true, messageId: `sms-${Date.now()}` },
    };
  }

  findMatchingRules(
    rules: NotificationRule[],
    milestoneStatus: ShipmentStatus,
  ): NotificationRule[] {
    return rules.filter(
      (rule) => rule.isEnabled && rule.triggerStatus === milestoneStatus,
    );
  }

  buildTemplateVariables(params: {
    trackingId: string;
    customerName?: string;
    status: ShipmentStatus;
    location?: string;
    description?: string;
    eventTimestamp?: string;
    origin?: string;
    destination?: string;
    carrierName?: string;
    estimatedDelivery?: string;
    tenantName?: string;
  }): TemplateVariables {
    return {
      trackingId: params.trackingId,
      customerName: params.customerName,
      status: params.status,
      milestoneType: params.status,
      location: params.location,
      description: params.description,
      eventTimestamp: params.eventTimestamp,
      origin: params.origin,
      destination: params.destination,
      carrierName: params.carrierName,
      estimatedDelivery: params.estimatedDelivery,
      tenantName: params.tenantName,
    };
  }
}
