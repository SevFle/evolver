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
      <BrandedShell>
        <div style={{ textAlign: "center", padding: "4rem 1rem" }}>
          <h1>Shipment Not Found</h1>
          <p>No shipment found for tracking ID: {trackingId}</p>
        </div>
      </BrandedShell>
    );
  }

  return (
    <BrandedShell>
      <ShipmentHeader shipment={data} />
      <MilestoneTimeline milestones={data.milestones ?? []} />
    </BrandedShell>
  );
}

export async function generateMetadata({ params }: TrackingPageProps) {
  const { trackingId } = await params;
  return {
    title: `Tracking ${trackingId} — ShipLens`,
  };
}
