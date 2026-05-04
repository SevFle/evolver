export interface EmailTemplate {
  html: string;
  text: string;
  subject: string;
}

export interface ShipmentEmailData {
  trackingId: string;
  origin: string;
  destination: string;
  carrier?: string;
  customerName?: string;
  estimatedDelivery?: string;
  location?: string;
  description?: string;
  occurredAt?: string;
}

export type TemplateName = "picked_up" | "in_transit" | "delivered" | "exception";

export interface EmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}
