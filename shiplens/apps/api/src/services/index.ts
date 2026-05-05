export { ResendEmailProvider, SmtpEmailProvider, ConsoleEmailProvider, createEmailProvider } from "./email-provider.js";
export type { EmailProvider } from "./email-provider.js";
export { renderTemplate, renderNotificationTemplate, getDefaultTemplate, validateTemplate } from "./template-engine.js";
export type { TemplateData, TemplateVariables } from "./template-engine.js";
export { NotificationDispatcher } from "./notification-dispatcher.js";
export type { NotificationRule, NotificationDispatchRequest, NotificationDispatchResult } from "./notification-dispatcher.js";
export { processMilestoneEvent } from "./notification-worker.js";
export type { MilestoneEvent, TemplateLookup, RulesLookup } from "./notification-worker.js";
