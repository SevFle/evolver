import { relations } from "drizzle-orm";
import { users } from "./users";
import { apiKeys } from "./api-keys";
import { endpoints } from "./endpoints";
import { events } from "./events";
import { deliveries } from "./deliveries";

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  endpoints: many(endpoints),
  events: many(events),
  deliveries: many(deliveries),
}));

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  user: one(users, {
    fields: [apiKeys.userId],
    references: [users.id],
  }),
}));

export const endpointsRelations = relations(endpoints, ({ one, many }) => ({
  user: one(users, {
    fields: [endpoints.userId],
    references: [users.id],
  }),
  deliveries: many(deliveries),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  deliveries: many(deliveries),
}));

export const deliveriesRelations = relations(deliveries, ({ one }) => ({
  event: one(events, {
    fields: [deliveries.eventId],
    references: [events.id],
  }),
  endpoint: one(endpoints, {
    fields: [deliveries.endpointId],
    references: [endpoints.id],
  }),
  user: one(users, {
    fields: [deliveries.userId],
    references: [users.id],
  }),
}));
