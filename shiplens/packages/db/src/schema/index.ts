import { pgTable, uuid, varchar, timestamp, jsonb, text, boolean, integer, pgEnum } from "drizzle-orm/pg-core";

export const shipmentStatusEnum = pgEnum("shipment_status", [
  "pending",
  "booked",
  "in_transit",
  "at_port",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "exception",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "sms",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }),
  customDomain: varchar("custom_domain", { length: 255 }),
  fromEmail: varchar("from_email", { length: 255 }),
  fromSmsNumber: varchar("from_sms_number", { length: 20 }),
  brandingConfig: jsonb("branding_config"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  trackingId: varchar("tracking_id", { length: 100 }).notNull().unique(),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 20 }),
  customerName: varchar("customer_name", { length: 255 }),
  origin: varchar("origin", { length: 255 }),
  destination: varchar("destination", { length: 255 }),
  carrierName: varchar("carrier_name", { length: 255 }),
  carrierTrackingRef: varchar("carrier_tracking_ref", { length: 255 }),
  corridor: varchar("corridor", { length: 50 }),
  status: shipmentStatusEnum("status").notNull().default("pending"),
  metadata: jsonb("metadata"),
  estimatedDelivery: timestamp("estimated_delivery", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  status: shipmentStatusEnum("status").notNull(),
  location: varchar("location", { length: 255 }),
  description: text("description"),
  eventTimestamp: timestamp("event_timestamp", { withTimezone: true }).notNull(),
  rawPayload: jsonb("raw_payload"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  shipmentId: uuid("shipment_id")
    .notNull()
    .references(() => shipments.id),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  channel: notificationChannelEnum("channel").notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  subject: varchar("subject", { length: 500 }),
  body: text("body"),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  status: varchar("status", { length: 50 }).notNull().default("pending"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  name: varchar("name", { length: 255 }),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const notificationRules = pgTable("notification_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id),
  triggerStatus: shipmentStatusEnum("trigger_status").notNull(),
  channel: notificationChannelEnum("channel").notNull(),
  templateId: varchar("template_id", { length: 255 }),
  isEnabled: boolean("is_enabled").notNull().default(true),
  delayMinutes: integer("delay_minutes").default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
