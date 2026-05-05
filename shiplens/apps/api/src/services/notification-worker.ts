import type { NotificationDispatcher, NotificationDispatchRequest, NotificationRule } from "./notification-dispatcher.js";
import type { TemplateData } from "./template-engine.js";
import type { ShipmentStatus, NotificationChannel } from "@shiplens/types";

export interface MilestoneEvent {
  shipmentId: string;
  tenantId: string;
  milestoneId: string;
  status: ShipmentStatus;
  trackingId?: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  location?: string;
  description?: string;
  eventTimestamp?: string;
  origin?: string;
  destination?: string;
  carrierName?: string;
  estimatedDelivery?: string;
  tenantName?: string;
  fromEmail?: string;
  fromSmsNumber?: string;
}

export interface TemplateLookup {
  (tenantId: string, templateId: string): Promise<TemplateData | null>;
}

export interface RulesLookup {
  (tenantId: string): Promise<NotificationRule[]>;
}

export async function processMilestoneEvent(
  event: MilestoneEvent,
  dispatcher: NotificationDispatcher,
  rulesLookup: RulesLookup,
  templateLookup: TemplateLookup,
): Promise<Array<{ channel: NotificationChannel; recipient: string; success: boolean; error?: string }>> {
  const rules = await rulesLookup(event.tenantId);
  const matchingRules = dispatcher.findMatchingRules(rules, event.status);

  if (matchingRules.length === 0) {
    return [];
  }

  const templateVariables = dispatcher.buildTemplateVariables({
    trackingId: event.trackingId ?? event.shipmentId,
    customerName: event.customerName,
    status: event.status,
    location: event.location,
    description: event.description,
    eventTimestamp: event.eventTimestamp,
    origin: event.origin,
    destination: event.destination,
    carrierName: event.carrierName,
    estimatedDelivery: event.estimatedDelivery,
    tenantName: event.tenantName,
  });

  const results: Array<{ channel: NotificationChannel; recipient: string; success: boolean; error?: string }> = [];

  for (const rule of matchingRules) {
    const recipient = rule.channel === "email" ? event.customerEmail : event.customerPhone;
    if (!recipient) continue;

    let templateData: TemplateData | undefined;
    if (rule.templateId) {
      const lookedUp = await templateLookup(event.tenantId, rule.templateId);
      if (lookedUp) templateData = lookedUp;
    }

    const dispatchRequest: NotificationDispatchRequest = {
      shipmentId: event.shipmentId,
      tenantId: event.tenantId,
      milestoneStatus: event.status,
      channel: rule.channel,
      recipient,
      templateData,
      templateVariables,
      fromEmail: event.fromEmail,
      fromSmsNumber: event.fromSmsNumber,
    };

    const result = await dispatcher.dispatch(dispatchRequest);
    results.push({
      channel: result.channel,
      recipient: result.recipient,
      success: result.success,
      error: result.error,
    });
  }

  return results;
}
