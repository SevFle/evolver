export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  total: number;
  page: number;
  pageSize: number;
}

export interface ShipmentPayload {
  trackingId: string;
  reference?: string;
  origin: string;
  destination: string;
  carrier?: string;
  serviceType?: "FCL" | "LTL" | "drayage";
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
  estimatedDelivery?: string;
  metadata?: Record<string, unknown>;
}

export interface MilestonePayload {
  type: string;
  description?: string;
  location?: string;
  occurredAt?: string;
  carrierData?: Record<string, unknown>;
}

export interface TenantConfig {
  id: string;
  name: string;
  slug: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  customDomain?: string | null;
  fromEmail?: string | null;
  fromSmsNumber?: string | null;
  notificationChannel?: "email" | "sms" | "both" | null;
}

export type ShipmentStatus =
  | "pending"
  | "booked"
  | "in_transit"
  | "at_port"
  | "customs_clearance"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export type MilestoneType =
  | "booked"
  | "picked_up"
  | "departed_origin"
  | "in_transit"
  | "arrived_port"
  | "customs_cleared"
  | "departed_terminal"
  | "out_for_delivery"
  | "delivered"
  | "exception";
