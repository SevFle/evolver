import { pgEnum } from "drizzle-orm/pg-core";

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "processing",
  "success",
  "failed",
  "retry_scheduled",
  "circuit_open",
  "dead_letter",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "queued",
  "delivering",
  "delivered",
  "failed",
]);

export const endpointStatusEnum = pgEnum("endpoint_status", [
  "active",
  "degraded",
  "disabled",
]);

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);

export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type EndpointStatus = (typeof endpointStatusEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
