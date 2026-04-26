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

export const userRoleEnum = pgEnum("user_role", ["owner", "admin", "member"]);

export type DeliveryStatus = (typeof deliveryStatusEnum.enumValues)[number];
export type UserRole = (typeof userRoleEnum.enumValues)[number];
