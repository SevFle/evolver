import type {
  NotificationStore,
  NotificationRecord,
  NotificationRuleInfo,
  ShipmentInfo,
} from "./notification-dispatcher";
import type { MilestoneType } from "@shiplens/shared";

interface StoredNotification extends NotificationRecord {}
interface StoredRule extends NotificationRuleInfo {}

export class InMemoryNotificationStore implements NotificationStore {
  private notifications: Map<string, StoredNotification> = new Map();
  private rules: Map<string, StoredRule> = new Map();
  private shipments: Map<string, ShipmentInfo & { tenantId: string }> = new Map();

  async findRulesForMilestone(tenantId: string, milestoneType: MilestoneType): Promise<NotificationRuleInfo[]> {
    const all = Array.from(this.rules.values());
    if (!milestoneType) {
      return all.filter((r) => r.tenantId === tenantId);
    }
    return all.filter((r) => r.tenantId === tenantId && r.milestoneType === milestoneType);
  }

  async findShipment(shipmentId: string, tenantId: string): Promise<ShipmentInfo | null> {
    const s = this.shipments.get(shipmentId);
    if (!s || s.tenantId !== tenantId) return null;
    return {
      id: s.id,
      tenantId: s.tenantId,
      trackingId: s.trackingId,
      origin: s.origin,
      destination: s.destination,
      carrier: s.carrier,
      customerName: s.customerName,
      customerEmail: s.customerEmail,
      customerPhone: s.customerPhone,
    };
  }

  async insertNotification(notification: Omit<NotificationRecord, "id" | "createdAt" | "updatedAt">): Promise<NotificationRecord> {
    const record: NotificationRecord = {
      ...notification,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.notifications.set(record.id, record);
    return record;
  }

  async updateNotification(id: string, updates: Partial<NotificationRecord>): Promise<NotificationRecord | null> {
    const existing = this.notifications.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...updates, updatedAt: new Date().toISOString() };
    this.notifications.set(id, updated);
    return updated;
  }

  async findNotification(id: string, tenantId: string): Promise<NotificationRecord | null> {
    const n = this.notifications.get(id);
    if (!n || n.tenantId !== tenantId) return null;
    return n;
  }

  async listNotifications(
    tenantId: string,
    filters?: { shipmentId?: string; status?: string; limit?: number; offset?: number }
  ): Promise<{ data: NotificationRecord[]; total: number }> {
    let items = Array.from(this.notifications.values()).filter((n) => n.tenantId === tenantId);
    if (filters?.shipmentId) {
      items = items.filter((n) => n.shipmentId === filters.shipmentId);
    }
    if (filters?.status) {
      items = items.filter((n) => n.status === filters.status);
    }
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const total = items.length;
    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 25;
    return { data: items.slice(offset, offset + limit), total };
  }

  async createRule(rule: Omit<NotificationRuleInfo, "id">): Promise<NotificationRuleInfo> {
    const record: NotificationRuleInfo = { ...rule, id: crypto.randomUUID() };
    this.rules.set(record.id, record);
    return record;
  }

  async updateRule(id: string, tenantId: string, updates: Partial<NotificationRuleInfo>): Promise<NotificationRuleInfo | null> {
    const existing = this.rules.get(id);
    if (!existing || existing.tenantId !== tenantId) return null;
    const updated = { ...existing, ...updates };
    this.rules.set(id, updated);
    return updated;
  }

  async deleteRule(id: string, tenantId: string): Promise<boolean> {
    const existing = this.rules.get(id);
    if (!existing || existing.tenantId !== tenantId) return false;
    this.rules.delete(id);
    return true;
  }

  seedShipment(shipment: ShipmentInfo & { tenantId: string }): void {
    this.shipments.set(shipment.id, shipment);
  }

  seedRule(rule: NotificationRuleInfo): void {
    this.rules.set(rule.id, rule);
  }

  seedNotification(notification: NotificationRecord): void {
    this.notifications.set(notification.id, notification);
  }

  clear(): void {
    this.notifications.clear();
    this.rules.clear();
    this.shipments.clear();
  }
}
