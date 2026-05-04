import { resolveTenantFromHost } from "./tenant-resolver";
import { isValidTrackingId } from "./tracking-id-validation";
import {
  sanitizeSupportUrl,
  validateContactEmail,
  validateLogoUrl,
} from "./url-sanitizer";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:3001";

const PRIMARY_COLOR_REGEX = /^#[0-9a-fA-F]{6}$/;

function sanitizeTextField(value: string | null | undefined): string | null {
  if (value == null) return null;
  return value.replace(/<[^>]*>/g, "");
}

function validatePrimaryColor(
  color: string | null | undefined
): string | null {
  if (!color) return null;
  if (!PRIMARY_COLOR_REGEX.test(color)) return null;
  return color;
}

export interface TrackingMilestone {
  type: string;
  description?: string;
  location?: string;
  occurredAt: string;
}

export interface TrackingBranding {
  tenantName: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  tagline?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  supportUrl?: string | null;
  customFooterText?: string | null;
}

export interface TrackingPageData {
  trackingId: string;
  reference?: string | null;
  origin: string;
  destination: string;
  status: string;
  carrier?: string | null;
  serviceType?: string | null;
  estimatedDelivery?: string | null;
  actualDelivery?: string | null;
  customerName?: string | null;
  createdAt?: string | null;
  milestones?: TrackingMilestone[];
  branding?: TrackingBranding | null;
}

export async function getShipmentByTrackingId(
  trackingId: string
): Promise<TrackingPageData | null> {
  if (!isValidTrackingId(trackingId)) {
    return null;
  }

  const tenantSlug = await resolveTenantFromHost();

  try {
    const res = await fetch(
      `${API_BASE}/api/tracking-pages/${encodeURIComponent(trackingId)}`,
      {
        headers: {
          ...(tenantSlug ? { "x-tenant-slug": tenantSlug } : {}),
        },
        next: { revalidate: 30 },
      }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const data = json.data ?? null;

    if (data?.branding) {
      data.branding = {
        ...data.branding,
        tenantName: sanitizeTextField(data.branding.tenantName),
        logoUrl: validateLogoUrl(data.branding.logoUrl),
        primaryColor: validatePrimaryColor(data.branding.primaryColor),
        tagline: sanitizeTextField(data.branding.tagline),
        contactEmail: validateContactEmail(data.branding.contactEmail),
        contactPhone: sanitizeTextField(data.branding.contactPhone),
        supportUrl: sanitizeSupportUrl(data.branding.supportUrl),
        customFooterText: sanitizeTextField(data.branding.customFooterText),
      };
    }

    return data;
  } catch {
    return null;
  }
}
