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

export interface MilestoneInfo {
  type: MilestoneType;
  description?: string | null;
  location?: string | null;
  occurredAt: string;
}

export interface ShipmentListItem {
  id: string;
  trackingId: string;
  reference?: string | null;
  origin?: string | null;
  destination?: string | null;
  carrier?: string | null;
  serviceType?: string | null;
  status: ShipmentStatus;
  customerName?: string | null;
  customerEmail?: string | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  lastMilestone?: MilestoneInfo | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentsListResponse {
  success: boolean;
  data: ShipmentListItem[];
  total: number;
  page: number;
  pageSize: number;
  error?: string;
}

export interface ShipmentsQueryParams {
  page?: number;
  pageSize?: number;
  status?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export const SHIPMENT_STATUSES: ShipmentStatus[] = [
  "pending",
  "booked",
  "in_transit",
  "at_port",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "exception",
];

export const SORTABLE_COLUMNS = [
  "trackingId",
  "customerName",
  "origin",
  "destination",
  "status",
  "estimatedDelivery",
  "createdAt",
] as const;

export type SortableColumn = (typeof SORTABLE_COLUMNS)[number];

export type NotificationPrefMilestone =
  | "created"
  | "picked_up"
  | "in_transit"
  | "out_for_delivery"
  | "delivered"
  | "exception";

export type NotificationPrefChannel = "email" | "sms" | "both";

export interface NotificationPreference {
  id: string;
  tenantId: string;
  milestoneType: NotificationPrefMilestone;
  channel: NotificationPrefChannel;
  enabled: boolean;
  customTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

export const NOTIFICATION_PREF_MILESTONES: NotificationPrefMilestone[] = [
  "created",
  "picked_up",
  "in_transit",
  "out_for_delivery",
  "delivered",
  "exception",
];

export const NOTIFICATION_PREF_CHANNELS: NotificationPrefChannel[] = [
  "email",
  "sms",
  "both",
];

export interface NotificationPreferencesUpdate {
  milestoneType: NotificationPrefMilestone;
  channel?: NotificationPrefChannel;
  enabled?: boolean;
  customTemplate?: string | null;
}
