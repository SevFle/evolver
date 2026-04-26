import {
  pgTable,
  uuid,
  text,
  varchar,
  timestamp,
  jsonb,
  integer,
  pgEnum,
} from "drizzle-orm/pg-core";

export const endpointStatusEnum = pgEnum("endpoint_status", [
  "active",
  "degraded",
  "disabled",
]);

export const eventStatusEnum = pgEnum("event_status", [
  "queued",
  "delivering",
  "delivered",
  "failed",
]);

export const deliveryStatusEnum = pgEnum("delivery_status", [
  "pending",
  "success",
  "failed",
]);

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  name: varchar("name", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const apiKeys = pgTable("api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  keyHash: text("key_hash").notNull().unique(),
  prefix: varchar("prefix", { length: 12 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  lastUsedAt: timestamp("last_used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const endpoints = pgTable("endpoints", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .references(() => users.id, { onDelete: "cascade" })
    .notNull(),
  url: text("url").notNull(),
  description: text("description"),
  signingSecret: text("signing_secret").notNull(),
  status: endpointStatusEnum("status").default("active").notNull(),
  customHeaders: jsonb("custom_headers"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: uuid("id").primaryKey().defaultRandom(),
  endpointId: uuid("endpoint_id")
    .references(() => endpoints.id, { onDelete: "cascade" })
    .notNull(),
  payload: jsonb("payload").notNull(),
  eventType: varchar("event_type", { length: 255 }).notNull(),
  status: eventStatusEnum("status").default("queued").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 255 }).unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const deliveries = pgTable("deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  eventId: uuid("event_id")
    .references(() => events.id, { onDelete: "cascade" })
    .notNull(),
  endpointId: uuid("endpoint_id")
    .references(() => endpoints.id, { onDelete: "cascade" })
    .notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  statusCode: integer("status_code"),
  responseBody: text("response_body"),
  responseHeaders: jsonb("response_headers"),
  durationMs: integer("duration_ms"),
  status: deliveryStatusEnum("status").default("pending").notNull(),
  nextRetryAt: timestamp("next_retry_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
