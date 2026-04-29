export type EndpointStatus = "active" | "degraded" | "disabled";
export type EventStatus = "queued" | "delivering" | "delivered" | "failed";
export type DeliveryStatus = "pending" | "success" | "failed";

export interface User {
  id: string;
  email: string;
  name: string | null;
  createdAt: Date;
}

export interface Endpoint {
  id: string;
  userId: string;
  url: string;
  description: string | null;
  signingSecret: string;
  status: EndpointStatus;
  customHeaders: Record<string, string> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookEvent {
  id: string;
  endpointId: string;
  payload: Record<string, unknown>;
  eventType: string;
  status: EventStatus;
  createdAt: Date;
}

export interface Delivery {
  id: string;
  eventId: string;
  endpointId: string;
  attemptNumber: number;
  statusCode: number | null;
  responseBody: string | null;
  responseHeaders: Record<string, string> | null;
  durationMs: number | null;
  status: DeliveryStatus;
  nextRetryAt: Date | null;
  createdAt: Date;
}

export interface ApiKey {
  id: string;
  userId: string;
  keyHash: string;
  prefix: string;
  name: string;
  lastUsedAt: Date | null;
  createdAt: Date;
}

export interface CreateEndpointRequest {
  url: string;
  name?: string;
  description?: string;
  customHeaders?: Record<string, string>;
}

export interface SendEventRequest {
  userId: string;
  endpointId?: string | null;
  endpointGroupId?: string | null;
  payload: Record<string, unknown>;
  eventType: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}

export interface SendFanoutEventRequest {
  userId: string;
  endpointGroupId?: string;
  endpointIds?: string[];
  payload: Record<string, unknown>;
  eventType: string;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
  source?: string;
}
