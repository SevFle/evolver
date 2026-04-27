import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { endpointStatusEnum } from "./enums";

export const endpoints = pgTable(
  "endpoints",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    url: text("url").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    signingSecret: text("signing_secret").notNull(),
    status: endpointStatusEnum("status").default("active").notNull(),
    customHeaders: jsonb("custom_headers").$type<Record<string, string>>().default({}),
    isActive: boolean("is_active").default(true).notNull(),
    disabledReason: text("disabled_reason"),
    consecutiveFailures: integer("consecutive_failures").default(0).notNull(),
    maxRetries: integer("max_retries").default(5).notNull(),
    retrySchedule: jsonb("retry_schedule")
      .$type<number[]>()
      .default([60, 300, 1800, 7200, 43200]),
    rateLimit: integer("rate_limit"),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    activeEndpointsIdx: index("endpoints_active_idx")
      .on(table.userId, table.isActive)
      .where(sql`${table.deletedAt} is null`),
    userIdx: index("endpoints_user_id_idx").on(table.userId),
  }),
);
