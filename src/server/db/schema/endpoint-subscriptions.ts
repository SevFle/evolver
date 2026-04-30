import {
  pgTable,
  uuid,
  text,
  timestamp,
  boolean,
  index,
  uniqueIndex,
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
    deliveryMode: text("delivery_mode").notNull().default("direct"),
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
    endpointEventTypeUnique: uniqueIndex(
      "endpoint_subscriptions_endpoint_event_type_uniq",
    )
      .on(table.endpointId, table.eventType),
  }),
);
