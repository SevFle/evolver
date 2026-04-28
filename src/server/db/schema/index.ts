import { users } from "./users";
import { apiKeys } from "./api-keys";
import { endpoints } from "./endpoints";
import { events } from "./events";
import { deliveries } from "./deliveries";
import { teams } from "./teams";

export { users } from "./users";
export { apiKeys } from "./api-keys";
export { endpoints } from "./endpoints";
export { events } from "./events";
export { deliveries } from "./deliveries";
export { teams } from "./teams";
export {
  usersRelations,
  apiKeysRelations,
  endpointsRelations,
  eventsRelations,
  deliveriesRelations,
  teamsRelations,
} from "./relations";
export {
  deliveryStatusEnum,
  eventStatusEnum,
  endpointStatusEnum,
  userRoleEnum,
} from "./enums";
export type {
  DeliveryStatus,
  EventStatus,
  EndpointStatus,
  UserRole,
} from "./enums";

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
export type Endpoint = typeof endpoints.$inferSelect;
export type NewEndpoint = typeof endpoints.$inferInsert;
export type WebhookEvent = typeof events.$inferSelect;
export type NewWebhookEvent = typeof events.$inferInsert;
export type Delivery = typeof deliveries.$inferSelect;
export type NewDelivery = typeof deliveries.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type DeliveryInsert = typeof deliveries.$inferInsert;
