import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import {
  NOTIFICATION_PREF_MILESTONES,
  NOTIFICATION_PREF_CHANNELS,
  type NotificationPrefMilestone,
  type NotificationPrefChannel,
  type NotificationPreference,
  type NotificationPreferencesUpdate,
} from "@shiplens/shared";

interface TenantRequest extends FastifyRequest {
  tenantId?: string;
}

interface PreferenceStoreItem {
  id: string;
  tenantId: string;
  milestoneType: NotificationPrefMilestone;
  channel: NotificationPrefChannel;
  enabled: boolean;
  customTemplate: string | null;
  createdAt: string;
  updatedAt: string;
}

const preferenceStore = new Map<string, PreferenceStoreItem[]>();

function getTenantPrefs(tenantId: string): PreferenceStoreItem[] {
  if (!preferenceStore.has(tenantId)) {
    const defaults: PreferenceStoreItem[] = NOTIFICATION_PREF_MILESTONES.map((m, i) => ({
      id: `pref-${tenantId}-${i}`,
      tenantId,
      milestoneType: m,
      channel: "email",
      enabled: true,
      customTemplate: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    preferenceStore.set(tenantId, defaults);
  }
  return preferenceStore.get(tenantId)!;
}

function validateMilestoneType(value: unknown): value is NotificationPrefMilestone {
  return typeof value === "string" && NOTIFICATION_PREF_MILESTONES.includes(value as NotificationPrefMilestone);
}

function validateChannel(value: unknown): value is NotificationPrefChannel {
  return typeof value === "string" && NOTIFICATION_PREF_CHANNELS.includes(value as NotificationPrefChannel);
}

export async function notificationRoutes(server: FastifyInstance) {
  server.get("/rules", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.post("/rules", async (_request, reply) => {
    return reply.status(201).send({ success: true, data: null, message: "Notification rule created" });
  });

  server.get("/history", async (_request, reply) => {
    return reply.status(200).send({ success: true, data: [] });
  });

  server.get("/preferences", async (request: TenantRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const prefs = getTenantPrefs(tenantId);
    return reply.status(200).send({ success: true, data: prefs });
  });

  server.put("/preferences", async (request: TenantRequest, reply: FastifyReply) => {
    const tenantId = request.tenantId;
    if (!tenantId) {
      return reply.status(401).send({ success: false, error: "Authentication required" });
    }

    const body = request.body as Record<string, unknown>;

    if (!body || typeof body !== "object") {
      return reply.status(400).send({ success: false, error: "Request body is required" });
    }

    if (!validateMilestoneType(body.milestoneType)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid milestoneType. Must be one of: ${NOTIFICATION_PREF_MILESTONES.join(", ")}`,
      });
    }

    if (body.channel !== undefined && !validateChannel(body.channel)) {
      return reply.status(400).send({
        success: false,
        error: `Invalid channel. Must be one of: ${NOTIFICATION_PREF_CHANNELS.join(", ")}`,
      });
    }

    if (body.enabled !== undefined && typeof body.enabled !== "boolean") {
      return reply.status(400).send({ success: false, error: "enabled must be a boolean" });
    }

    if (body.customTemplate !== undefined && body.customTemplate !== null && typeof body.customTemplate !== "string") {
      return reply.status(400).send({ success: false, error: "customTemplate must be a string or null" });
    }

    const prefs = getTenantPrefs(tenantId);
    const prefIndex = prefs.findIndex((p) => p.milestoneType === body.milestoneType);

    if (prefIndex === -1) {
      return reply.status(404).send({
        success: false,
        error: `No preference found for milestoneType: ${body.milestoneType}`,
      });
    }

    const pref = prefs[prefIndex];
    prefs[prefIndex] = {
      ...pref,
      channel: body.channel !== undefined ? (body.channel as NotificationPrefChannel) : pref.channel,
      enabled: body.enabled !== undefined ? (body.enabled as boolean) : pref.enabled,
      customTemplate: body.customTemplate !== undefined ? (body.customTemplate as string | null) : pref.customTemplate,
      updatedAt: new Date().toISOString(),
    };

    return reply.status(200).send({ success: true, data: prefs[prefIndex] });
  });
}

export { preferenceStore, getTenantPrefs, validateMilestoneType, validateChannel };
