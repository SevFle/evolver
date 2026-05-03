import { getShipmentByTrackingId } from "@/lib/tracking-api";
import { BrandedShell } from "@/components/BrandedShell";
import { ShipmentHeader } from "@/components/ShipmentHeader";
import { MilestoneTimeline } from "@/components/MilestoneTimeline";

interface TrackingPageProps {
  params: Promise<{ trackingId: string }>;
}

export default async function TrackingPage({ params }: TrackingPageProps) {
  const { trackingId } = await params;
  const data = await getShipmentByTrackingId(trackingId);

  if (!data) {
    return (
      <BrandedShell
        tenantName="ShipLens"
        contactEmail="support@shiplens.io"
      >
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

  const b = data.branding;

  return (
    <BrandedShell
      tenantName={b?.tenantName}
      logoUrl={b?.logoUrl}
      primaryColor={b?.primaryColor}
      contactEmail={b?.contactEmail}
      customFooterText={b?.customFooterText}
      tagline={b?.tagline}
      contactPhone={b?.contactPhone}
      supportUrl={b?.supportUrl}
    >
      <ShipmentHeader shipment={data} primaryColor={b?.primaryColor} />
      <MilestoneTimeline
        milestones={data.milestones ?? []}
        primaryColor={b?.primaryColor}
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
