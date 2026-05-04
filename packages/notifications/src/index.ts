export {
  getTemplate,
  TEMPLATE_NAMES,
  pickedUpTemplate,
  inTransitTemplate,
  deliveredTemplate,
  exceptionTemplate,
} from "./templates";
export type {
  EmailTemplate,
  ShipmentEmailData,
  TemplateName,
  EmailResult,
} from "./templates/types";
export { getResendClient, resetResendClient, sendEmail } from "./email";
export type { SendEmailParams } from "./email";
export { sendMilestoneEmail } from "./send-milestone-email";
export type { SendMilestoneEmailParams } from "./send-milestone-email";
