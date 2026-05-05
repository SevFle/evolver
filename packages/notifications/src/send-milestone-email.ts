import { getTemplate } from "./templates";
import { sendEmail } from "./email";
import type { ShipmentEmailData, TemplateName, EmailResult } from "./templates/types";

export interface SendMilestoneEmailParams {
  templateName: TemplateName;
  shipmentData: ShipmentEmailData;
  to: string;
  from: string;
}

export async function sendMilestoneEmail(params: SendMilestoneEmailParams): Promise<EmailResult> {
  const { templateName, shipmentData, to, from } = params;

  if (!to || to.trim() === "") {
    return { success: false, error: "Recipient email address is required" };
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(to)) {
    return { success: false, error: `Invalid recipient email address: ${to}` };
  }

  if (!from || from.trim() === "") {
    return { success: false, error: "Sender email address is required" };
  }

  if (!emailRegex.test(from)) {
    return { success: false, error: `Invalid sender email address: ${from}` };
  }

  const templateFn = getTemplate(templateName);
  const { html, text, subject } = templateFn(shipmentData);

  return sendEmail({ to, from, subject, html, text });
}
