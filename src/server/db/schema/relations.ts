import { relations } from "drizzle-orm";
import { users } from "./users";
import { apiKeys } from "./api-keys";
import { endpoints } from "./endpoints";
import { events } from "./events";
import { deliveries } from "./deliveries";
import { teams } from "./teams";
import { endpointGroups, endpointGroupMembers } from "./endpoint-groups";

export const usersRelations = relations(users, ({ many }) => ({
  apiKeys: many(apiKeys),
  endpoints: many(endpoints),
  events: many(events),
  deliveries: many(deliveries),
  endpointGroups: many(endpointGroups),
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
  events: many(events),
  deliveries: many(deliveries),
  groupMemberships: many(endpointGroupMembers),
}));

export const eventsRelations = relations(events, ({ one, many }) => ({
  user: one(users, {
    fields: [events.userId],
    references: [users.id],
  }),
  endpoint: one(endpoints, {
    fields: [events.endpointId],
    references: [endpoints.id],
  }),
  endpointGroup: one(endpointGroups, {
    fields: [events.endpointGroupId],
    references: [endpointGroups.id],
  }),
  deliveries: many(deliveries),
  replayedFrom: one(events, {
    fields: [events.replayedFromEventId],
    references: [events.id],
    relationName: "eventReplayLineage",
  }),
  replays: many(events, {
    relationName: "eventReplayLineage",
  }),
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

export const teamsRelations = relations(teams, ({ many }) => ({
  users: many(users),
}));

export const endpointGroupsRelations = relations(endpointGroups, ({ one, many }) => ({
  user: one(users, {
    fields: [endpointGroups.userId],
    references: [users.id],
  }),
  members: many(endpointGroupMembers),
  events: many(events),
}));

export const endpointGroupMembersRelations = relations(endpointGroupMembers, ({ one }) => ({
  group: one(endpointGroups, {
    fields: [endpointGroupMembers.groupId],
    references: [endpointGroups.id],
  }),
  endpoint: one(endpoints, {
    fields: [endpointGroupMembers.endpointId],
    references: [endpoints.id],
  }),
}));
