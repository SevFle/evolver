import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  boolean,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

export const milestoneTypeEnum = pgEnum("milestone_type", [
  "booked",
  "picked_up",
  "departed_origin",
  "in_transit",
  "arrived_port",
  "customs_cleared",
  "departed_terminal",
  "out_for_delivery",
  "delivered",
  "exception",
]);

export const notificationChannelEnum = pgEnum("notification_channel", [
  "email",
  "sms",
  "both",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 7 }).default("#2563EB"),
  customDomain: varchar("custom_domain", { length: 255 }),
  fromEmail: varchar("from_email", { length: 255 }),
  fromSmsNumber: varchar("from_sms_number", { length: 20 }),
  notificationChannel: notificationChannelEnum("notification_channel").default("email"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  keyHash: varchar("key_hash", { length: 255 }).notNull(),
  label: varchar("label", { length: 255 }),
  lastUsedAt: timestamp("last_used_at"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  trackingId: varchar("tracking_id", { length: 100 }).notNull().unique(),
  reference: varchar("reference", { length: 255 }),
  origin: varchar("origin", { length: 255 }),
  destination: varchar("destination", { length: 255 }),
  carrier: varchar("carrier", { length: 255 }),
  serviceType: varchar("service_type", { length: 50 }),
  status: shipmentStatusEnum("status").default("pending").notNull(),
  estimatedDelivery: timestamp("estimated_delivery"),
  actualDelivery: timestamp("actual_delivery"),
  customerName: varchar("customer_name", { length: 255 }),
  customerEmail: varchar("customer_email", { length: 255 }),
  customerPhone: varchar("customer_phone", { length: 50 }),
  metadata: jsonb("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const milestones = pgTable("milestones", {
  id: uuid("id").defaultRandom().primaryKey(),
  shipmentId: uuid("shipment_id")
    .references(() => shipments.id, { onDelete: "cascade" })
    .notNull(),
  type: milestoneTypeEnum("type").notNull(),
  description: text("description"),
  location: varchar("location", { length: 255 }),
  carrierData: jsonb("carrier_data"),
  occurredAt: timestamp("occurred_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationRules = pgTable("notification_rules", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  milestoneType: milestoneTypeEnum("milestone_type").notNull(),
  channel: notificationChannelEnum("channel").default("email").notNull(),
  templateId: varchar("template_id", { length: 255 }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notificationTemplates = pgTable("notification_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  milestoneType: milestoneTypeEnum("milestone_type").notNull(),
  channel: notificationChannelEnum("channel").default("email").notNull(),
  subject: varchar("subject", { length: 500 }),
  htmlBody: text("html_body"),
  textBody: text("text_body"),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notificationPreferences = pgTable("notification_preferences", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  defaultChannel: notificationChannelEnum("default_channel").default("email").notNull(),
  fromEmail: varchar("from_email", { length: 255 }),
  fromSmsNumber: varchar("from_sms_number", { length: 20 }),
  quietHoursStart: varchar("quiet_hours_start", { length: 5 }),
  quietHoursEnd: varchar("quiet_hours_end", { length: 5 }),
  quietHoursTimezone: varchar("quiet_hours_timezone", { length: 50 }),
  enabled: boolean("enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const notificationLog = pgTable("notification_log", {
  id: uuid("id").defaultRandom().primaryKey(),
  tenantId: uuid("tenant_id")
    .references(() => tenants.id, { onDelete: "cascade" })
    .notNull(),
  shipmentId: uuid("shipment_id")
    .references(() => shipments.id, { onDelete: "cascade" })
    .notNull(),
  milestoneType: milestoneTypeEnum("milestone_type"),
  channel: notificationChannelEnum("channel").notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  providerId: varchar("provider_id", { length: 255 }),
  errorMessage: text("error_message"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const notifications = pgTable("notifications", {
  id: uuid("id").defaultRandom().primaryKey(),
  shipmentId: uuid("shipment_id")
    .references(() => shipments.id, { onDelete: "cascade" })
    .notNull(),
  channel: notificationChannelEnum("channel").notNull(),
  recipient: varchar("recipient", { length: 255 }).notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(),
  providerId: varchar("provider_id", { length: 255 }),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tenantsRelations = relations(tenants, ({ many }) => ({
  shipments: many(shipments),
  apiKeys: many(apiKeys),
  notificationRules: many(notificationRules),
  notificationTemplates: many(notificationTemplates),
  notificationPreferences: many(notificationPreferences),
  notificationLog: many(notificationLog),
}));

export const shipmentsRelations = relations(shipments, ({ one, many }) => ({
  tenant: one(tenants, {
    fields: [shipments.tenantId],
    references: [tenants.id],
  }),
  milestones: many(milestones),
  notifications: many(notifications),
}));

export const milestonesRelations = relations(milestones, ({ one }) => ({
  shipment: one(shipments, {
    fields: [milestones.shipmentId],
    references: [shipments.id],
  }),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  tenant: one(tenants, {
    fields: [apiKeys.tenantId],
    references: [tenants.id],
  }),
}));

export const notificationRulesRelations = relations(notificationRules, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notificationRules.tenantId],
    references: [tenants.id],
  }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  shipment: one(shipments, {
    fields: [notifications.shipmentId],
    references: [shipments.id],
  }),
}));

export const notificationTemplatesRelations = relations(notificationTemplates, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notificationTemplates.tenantId],
    references: [tenants.id],
  }),
}));

export const notificationPreferencesRelations = relations(notificationPreferences, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notificationPreferences.tenantId],
    references: [tenants.id],
  }),
}));

export const notificationLogRelations = relations(notificationLog, ({ one }) => ({
  tenant: one(tenants, {
    fields: [notificationLog.tenantId],
    references: [tenants.id],
  }),
  shipment: one(shipments, {
    fields: [notificationLog.shipmentId],
    references: [shipments.id],
  }),
}));
