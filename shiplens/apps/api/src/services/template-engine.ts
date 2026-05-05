import type { TemplateRenderResult, MilestoneType } from "@shiplens/types";

export interface TemplateData {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
}

export interface TemplateVariables {
  trackingId: string;
  customerName?: string;
  status: string;
  milestoneType: MilestoneType;
  location?: string;
  description?: string;
  eventTimestamp?: string;
  origin?: string;
  destination?: string;
  carrierName?: string;
  estimatedDelivery?: string;
  tenantName?: string;
}

const REQUIRED_TEMPLATE_VARIABLES = [
  "trackingId",
  "customerName",
  "status",
  "milestoneType",
  "location",
  "description",
  "eventTimestamp",
  "origin",
  "destination",
  "carrierName",
  "estimatedDelivery",
  "tenantName",
] as const;

export function renderTemplate(template: string, variables: TemplateVariables): string {
  let result = template;
  for (const key of REQUIRED_TEMPLATE_VARIABLES) {
    const value = variables[key];
    const placeholder = `{{${key}}}`;
    result = result.replaceAll(placeholder, value ?? "");
  }
  return result;
}

export function renderNotificationTemplate(
  template: TemplateData,
  variables: TemplateVariables,
): TemplateRenderResult {
  const subject = template.subject ? renderTemplate(template.subject, variables) : "";
  const bodyHtml = template.bodyHtml ? renderTemplate(template.bodyHtml, variables) : undefined;
  const bodyText = template.bodyText ? renderTemplate(template.bodyText, variables) : undefined;

  return { subject, bodyHtml, bodyText };
}

export function getDefaultTemplate(milestoneType: MilestoneType, channel: "email" | "sms"): TemplateData {
  const statusLabel = milestoneType.replaceAll("_", " ");

  if (channel === "sms") {
    return {
      bodyText: `Shipment {{trackingId}} status: ${statusLabel}. Track at {{tenantName}}.`,
    };
  }

  return {
    subject: `Shipment {{trackingId}} - ${statusLabel}`,
    bodyHtml: `<h1>Shipment Update</h1><p>Hello {{customerName}},</p><p>Your shipment <strong>{{trackingId}}</strong> is now: <strong>${statusLabel}</strong>.</p><p>From: {{origin}}<br/>To: {{destination}}</p>`,
    bodyText: `Hello {{customerName}}, your shipment {{trackingId}} is now: ${statusLabel}. From: {{origin}} to: {{destination}}.`,
  };
}

export function validateTemplate(template: string): { valid: boolean; missingVariables: string[] } {
  const missingVariables: string[] = [];
  for (const key of REQUIRED_TEMPLATE_VARIABLES) {
    const placeholder = `{{${key}}}`;
    if (template.includes(placeholder)) {
      missingVariables.push(key);
    }
  }
  return { valid: true, missingVariables };
}
