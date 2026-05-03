import { resolveTenantFromHost } from "./tenant-resolver";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

interface ShipmentData {
  trackingId: string;
  origin: string;
  destination: string;
  status: string;
  carrier?: string;
  estimatedDelivery?: string;
  milestones?: Array<{
    type: string;
    description: string;
    location?: string;
    occurredAt: string;
  }>;
}

export async function getShipmentByTrackingId(
  trackingId: string
): Promise<ShipmentData | null> {
  const tenantSlug = await resolveTenantFromHost();

  try {
    const res = await fetch(`${API_BASE}/api/shipments/${trackingId}`, {
      headers: {
        ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
      },
      next: { revalidate: 30 },
    });

    if (!res.ok) return null;

    const json = await res.json();
    return json.data ?? null;
  } catch {
    return null;
  }
}
