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
