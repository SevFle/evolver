import { NOTIFICATION_PREF_MILESTONES, type NotificationPrefChannel, type NotificationPrefMilestone } from "@shiplens/shared";

export interface DispatchInput {
  tenantId: string;
  milestoneType: NotificationPrefMilestone;
  shipmentId: string;
  recipient: string;
  message: string;
}

export interface NotificationPreference {
  id: string;
  tenantId: string;
  milestoneType: NotificationPrefMilestone;
  channel: NotificationPrefChannel;
  enabled: boolean;
  customTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

export type PreferenceResolver = (tenantId: string) => Promise<NotificationPreference[]>;

const MILESTONE_DEFAULT_MESSAGES: Record<NotificationPrefMilestone, string> = {
  created: "Your shipment has been created.",
  picked_up: "Your shipment has been picked up.",
  in_transit: "Your shipment is in transit.",
  out_for_delivery: "Your shipment is out for delivery.",
  delivered: "Your shipment has been delivered.",
  exception: "There is an issue with your shipment.",
};

export function resolveChannel(pref: NotificationPreference): ("email" | "sms")[] {
  switch (pref.channel) {
    case "email":
      return ["email"];
    case "sms":
      return ["sms"];
    case "both":
      return ["email", "sms"];
    default:
      return ["email"];
  }
}

export function buildMessage(pref: NotificationPreference, defaultMessage: string): string {
  if (pref.customTemplate && pref.customTemplate.trim().length > 0) {
    return pref.customTemplate;
  }
  return defaultMessage;
}

export function getDefaultMessage(milestoneType: NotificationPrefMilestone): string {
  return MILESTONE_DEFAULT_MESSAGES[milestoneType] ?? "You have a shipment update.";
}

export interface DispatchResult {
  sent: boolean;
  channels: ("email" | "sms")[];
  message: string;
  reason?: string;
}

export async function dispatchNotification(
  input: DispatchInput,
  preferenceResolver: PreferenceResolver
): Promise<DispatchResult> {
  if (!input.tenantId || input.tenantId.trim() === "") {
    return { sent: false, channels: [], message: "", reason: "Missing tenantId" };
  }

  if (!NOTIFICATION_PREF_MILESTONES.includes(input.milestoneType)) {
    return { sent: false, channels: [], message: "", reason: `Invalid milestoneType: ${input.milestoneType}` };
  }

  if (!input.recipient || input.recipient.trim() === "") {
    return { sent: false, channels: [], message: "", reason: "Missing recipient" };
  }

  if (!input.message && !input.milestoneType) {
    return { sent: false, channels: [], message: "", reason: "Missing message or milestoneType" };
  }

  const prefs = await preferenceResolver(input.tenantId);
  const pref = prefs.find((p) => p.milestoneType === input.milestoneType);

  if (!pref) {
    return { sent: false, channels: [], message: "", reason: `No preference configured for ${input.milestoneType}` };
  }

  if (!pref.enabled) {
    return { sent: false, channels: [], message: "", reason: `Notifications disabled for ${input.milestoneType}` };
  }

  const channels = resolveChannel(pref);
  const defaultMessage = MILESTONE_DEFAULT_MESSAGES[input.milestoneType] ?? input.message;
  const message = buildMessage(pref, defaultMessage);

  return { sent: true, channels, message };
}
