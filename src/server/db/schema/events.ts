import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { endpoints } from "./endpoints";
import { eventStatusEnum } from "./enums";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => endpoints.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    payload: jsonb("payload")
      .$type<Record<string, unknown>>()
      .notNull(),
    metadata: jsonb("metadata")
      .$type<Record<string, unknown>>()
      .default({}),
    source: text("source"),
    idempotencyKey: text("idempotency_key"),
    status: eventStatusEnum("status").default("queued").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userCreatedIdx: index("events_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userEventTypeIdx: index("events_user_event_type_idx").on(
      table.userId,
      table.eventType,
    ),
    idempotencyIdx: uniqueIndex("events_idempotency_key_idx")
      .on(table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    endpointIdIdx: index("events_endpoint_id_idx").on(table.endpointId),
  }),
);
