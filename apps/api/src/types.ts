import type { NotificationDispatcher, NotificationStore } from "./services/notification-dispatcher";

declare module "fastify" {
  interface FastifyInstance {
    notificationDispatcher: NotificationDispatcher;
    notificationStore: NotificationStore;
  }
}
