export type ShipmentStatus =
  | "pending"
  | "booked"
  | "in_transit"
  | "at_port"
  | "customs_clearance"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export type NotificationChannel = "email" | "sms";

export type Corridor = "fcl" | "ltl" | "drayage";

export interface CreateShipmentRequest {
  trackingId: string;
  customerEmail?: string;
  customerPhone?: string;
  customerName?: string;
  origin?: string;
  destination?: string;
  carrierName?: string;
  carrierTrackingRef?: string;
  corridor?: Corridor;
  estimatedDelivery?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateMilestoneRequest {
  status: ShipmentStatus;
  location?: string;
  description?: string;
  eventTimestamp: string;
  rawPayload?: Record<string, unknown>;
}

export interface TenantBranding {
  name: string;
  logoUrl?: string;
  primaryColor?: string;
  customDomain?: string;
}

export interface TrackingPageData {
  shipment: {
    trackingId: string;
    status: ShipmentStatus;
    origin?: string;
    destination?: string;
    carrierName?: string;
    estimatedDelivery?: string;
    customerName?: string;
  };
  milestones: Array<{
    status: ShipmentStatus;
    location?: string;
    description?: string;
    eventTimestamp: string;
  }>;
  branding: TenantBranding;
}

export interface HealthCheckResponse {
  status: "ok" | "degraded";
  timestamp: string;
  version: string;
  services: {
    database: "ok" | "error";
    redis: "ok" | "error";
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export type MilestoneType = ShipmentStatus;

export interface NotificationTemplateData {
  id?: string;
  tenantId: string;
  name: string;
  milestoneType: MilestoneType;
  channel: NotificationChannel;
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  isActive?: boolean;
}

export interface NotificationRuleData {
  id?: string;
  tenantId: string;
  triggerStatus: ShipmentStatus;
  channel: NotificationChannel;
  templateId?: string;
  isEnabled?: boolean;
  delayMinutes?: number;
}

export interface NotificationPreferencesData {
  tenantId: string;
  emailEnabled?: boolean;
  smsEnabled?: boolean;
  defaultFromEmail?: string;
  defaultFromSmsNumber?: string;
  quietHoursStart?: string;
  quietHoursEnd?: string;
  quietHoursTimezone?: string;
  maxRetries?: number;
  retryIntervalMinutes?: number;
}

export interface SendEmailPayload {
  to: string;
  from: string;
  subject: string;
  html?: string;
  text?: string;
}

export interface SendSmsPayload {
  to: string;
  from: string;
  body: string;
}

export interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

export interface TemplateRenderResult {
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
}
