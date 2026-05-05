export { pickedUpTemplate } from "./picked-up";
export { inTransitTemplate } from "./in-transit";
export { deliveredTemplate } from "./delivered";
export { exceptionTemplate } from "./exception";
export type { EmailTemplate, ShipmentEmailData, TemplateName, EmailResult } from "./types";

import { pickedUpTemplate } from "./picked-up";
import { inTransitTemplate } from "./in-transit";
import { deliveredTemplate } from "./delivered";
import { exceptionTemplate } from "./exception";
import type { EmailTemplate, ShipmentEmailData, TemplateName } from "./types";

const templates: Record<TemplateName, (data: ShipmentEmailData) => EmailTemplate> = {
  picked_up: pickedUpTemplate,
  in_transit: inTransitTemplate,
  delivered: deliveredTemplate,
  exception: exceptionTemplate,
};

export function getTemplate(name: TemplateName): (data: ShipmentEmailData) => EmailTemplate {
  const template = templates[name];
  if (!template) {
    throw new Error(`Unknown template: ${name}`);
  }
  return template;
}

export const TEMPLATE_NAMES: TemplateName[] = ["picked_up", "in_transit", "delivered", "exception"];
