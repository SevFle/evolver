import { notFound } from "next/navigation";
import { getShipmentByTrackingId } from "@/lib/tracking-api";
import { BrandedShell } from "@/components/BrandedShell";
import { ShipmentHeader } from "@/components/ShipmentHeader";
import { MilestoneTimeline } from "@/components/MilestoneTimeline";

const TRACKING_ID_RE = /^[A-Z]{2}-[A-Z0-9]{4,12}$/i;

export function isValidTrackingId(id: string): boolean {
  return TRACKING_ID_RE.test(id);
}

interface TrackingPageProps {
  params: Promise<{ trackingId: string }>;
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { trackingId } = await params;

  if (!isValidTrackingId(trackingId)) {
    notFound();
  }

  const data = await getShipmentByTrackingId(trackingId);

  if (!data) {
    return (
      <BrandedShell>
        <div className="tracking-not-found">
          <svg
            className="tracking-not-found-icon"
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
            <line x1="8" y1="11" x2="14" y2="11" />
          </svg>
          <h1 className="tracking-not-found-title">Shipment Not Found</h1>
          <p className="tracking-not-found-text">
            No shipment found for tracking ID:{" "}
            <strong>{trackingId}</strong>
          </p>
          <p className="tracking-not-found-hint">
            Please check the tracking ID and try again.
          </p>
        </div>
      </BrandedShell>
    );
  }

  const branding = data.branding;

  return (
    <BrandedShell
      tenantName={branding?.tenantName}
      logoUrl={branding?.logoUrl}
      primaryColor={branding?.primaryColor}
      tagline={branding?.tagline}
      contactEmail={branding?.contactEmail}
      contactPhone={branding?.contactPhone}
      supportUrl={branding?.supportUrl}
      customFooterText={branding?.customFooterText}
    >
      <ShipmentHeader shipment={data} primaryColor={branding?.primaryColor} />
      <MilestoneTimeline
        milestones={data.milestones ?? []}
        primaryColor={branding?.primaryColor}
      />
    </BrandedShell>
  );
}

export async function generateMetadata({ params }: TrackingPageProps) {
  const { trackingId } = await params;
  return {
    title: `Tracking ${trackingId} — ShipLens`,
    description: `Track shipment ${trackingId} in real-time`,
  };
}
