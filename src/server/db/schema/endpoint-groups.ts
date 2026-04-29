import {
  pgTable,
  uuid,
  text,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import { endpoints } from "./endpoints";

export const endpointGroups = pgTable(
  "endpoint_groups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .references(() => users.id, { onDelete: "cascade" })
      .notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    userIdx: index("endpoint_groups_user_id_idx").on(table.userId),
  }),
);

export const endpointGroupMembers = pgTable(
  "endpoint_group_members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .references(() => endpointGroups.id, { onDelete: "cascade" })
      .notNull(),
    endpointId: uuid("endpoint_id")
      .references(() => endpoints.id, { onDelete: "cascade" })
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => ({
    groupEndpointUnique: uniqueIndex("endpoint_group_members_unique_idx").on(
      table.groupId,
      table.endpointId,
    ),
    groupIdx: index("endpoint_group_members_group_id_idx").on(table.groupId),
    endpointIdx: index("endpoint_group_members_endpoint_id_idx").on(
      table.endpointId,
    ),
  }),
);
