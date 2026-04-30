import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { eq } from "drizzle-orm";
import { users } from "./users";
import { events } from "./events";
import { endpoints } from "./endpoints";
import { deliveryStatusEnum } from "./enums";

export const deliveries = pgTable(
  "deliveries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    eventId: uuid("event_id")
      .references(() => events.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => endpoints.id, { onDelete: "cascade" })
      .notNull(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    status: deliveryStatusEnum("status").default("pending").notNull(),
    attemptNumber: integer("attempt_number").default(1).notNull(),
    maxAttempts: integer("max_attempts").default(5).notNull(),
    nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
    requestHeaders: jsonb("request_headers").$type<Record<string, string>>(),
    responseStatusCode: integer("response_status_code"),
    responseHeaders: jsonb("response_headers").$type<Record<string, string>>(),
    responseBody: text("response_body"),
    errorMessage: text("error_message"),
    durationMs: integer("duration_ms"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    isReplay: boolean("is_replay").default(false).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => ({
    userCreatedIdx: index("deliveries_user_created_at_idx").on(
      table.userId,
      table.createdAt,
    ),
    userStatusIdx: index("deliveries_user_status_idx").on(
      table.userId,
      table.status,
    ),
    endpointStatusCreatedIdx: index(
      "deliveries_endpoint_status_created_idx",
    ).on(table.endpointId, table.status, table.createdAt),
    retryQueueIdx: index("deliveries_retry_queue_idx")
      .on(table.nextRetryAt)
      .where(eq(table.status, "retry_scheduled")),
    eventIdIdx: index("deliveries_event_id_idx").on(table.eventId),
    circuitOpenUniqueIdx: uniqueIndex("deliveries_circuit_open_uniq")
      .on(table.eventId, table.endpointId)
      .where(eq(table.status, "circuit_open")),
  }),
);
