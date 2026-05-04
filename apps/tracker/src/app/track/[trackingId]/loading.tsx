import { BrandedShell } from "@/components/BrandedShell";

export default function TrackingLoading() {
  return (
    <BrandedShell>
      <div className="tracking-loading">
        <div className="tracking-loading-spinner" />
        <p className="tracking-loading-text">Loading shipment details...</p>
      </div>
    </BrandedShell>
  );
}
