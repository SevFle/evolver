import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import type { PgColumn } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { endpoints } from "./endpoints";
import { endpointGroups } from "./endpoint-groups";
import { eventStatusEnum } from "./enums";

export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => endpoints.id, { onDelete: "cascade" }),
    endpointGroupId: uuid("endpoint_group_id")
      .references(() => endpointGroups.id, { onDelete: "set null" }),
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
    replayedFromEventId: uuid("replayed_from_event_id")
      .references((): PgColumn => events.id, { onDelete: "set null" }),
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
      .on(table.userId, table.idempotencyKey)
      .where(sql`${table.idempotencyKey} is not null`),
    endpointIdIdx: index("events_endpoint_id_idx").on(table.endpointId),
    endpointGroupIdIdx: index("events_endpoint_group_id_idx").on(
      table.endpointGroupId,
    ),
    replayedFromIdx: index("events_replayed_from_idx").on(
      table.replayedFromEventId,
    ),
    targetCheck: check(
      "events_target_check",
      sql`${table.endpointId} is not null or ${table.endpointGroupId} is not null`,
    ),
  }),
);
