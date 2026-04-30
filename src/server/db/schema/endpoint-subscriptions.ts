import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { endpoints } from "./endpoints";
import { endpointGroups } from "./endpoint-groups";

export const endpointSubscriptions = pgTable(
  "endpoint_subscriptions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    endpointId: uuid("endpoint_id").references(() => endpoints.id, { onDelete: "cascade" }),
    endpointGroupId: uuid("endpoint_group_id").references(() => endpointGroups.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    eventType: text("event_type").notNull(),
    deliveryMode: text("delivery_mode").notNull().default("direct").$type<"direct" | "group" | "fanout">(),
    isActive: boolean("is_active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userEventTypeIdx: index("endpoint_subscriptions_user_event_type_idx").on(
      table.userId,
      table.eventType,
    ),
    endpointIdx: index("endpoint_subscriptions_endpoint_id_idx").on(
      table.endpointId,
    ),
    activeUserIdx: index("endpoint_subscriptions_active_user_idx")
      .on(table.userId, table.isActive)
      .where(sql`${table.isActive} = true`),
    directEventTypeUnique: uniqueIndex(
      "endpoint_subscriptions_direct_event_type_uniq",
    )
      .on(table.endpointId, table.eventType)
      .where(sql`${table.endpointId} IS NOT NULL`),
    groupEventTypeUnique: uniqueIndex(
      "endpoint_subscriptions_group_event_type_uniq",
    )
      .on(table.endpointGroupId, table.eventType)
      .where(sql`${table.endpointGroupId} IS NOT NULL`),
    fanoutEventTypeUnique: uniqueIndex(
      "endpoint_subscriptions_fanout_event_type_uniq",
    )
      .on(table.userId, table.eventType)
      .where(
        sql`${table.userId} IS NOT NULL AND ${table.endpointId} IS NULL AND ${table.endpointGroupId} IS NULL`,
      ),
    deliveryModeCheck: check(
      "endpoint_subscriptions_delivery_mode_check",
      sql`CASE
        WHEN ${table.deliveryMode} = 'direct' THEN ${table.endpointId} IS NOT NULL AND ${table.endpointGroupId} IS NULL
        WHEN ${table.deliveryMode} = 'group' THEN ${table.endpointGroupId} IS NOT NULL AND ${table.endpointId} IS NULL
        WHEN ${table.deliveryMode} = 'fanout' THEN ${table.endpointId} IS NULL AND ${table.endpointGroupId} IS NULL
        ELSE false
      END`,
    ),
  }),
);
