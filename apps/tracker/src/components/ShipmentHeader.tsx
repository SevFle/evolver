import type { TrackingPageData } from "@/lib/tracking-api";

interface ShipmentHeaderProps {
  shipment: TrackingPageData;
  primaryColor?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  try {
    return new Date(dateStr).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function getStatusLabel(status: string): string {
  return status.replace(/_/g, " ").toUpperCase();
}

function getStatusClass(status: string): string {
  if (status === "delivered") return "status-delivered";
  if (status === "exception") return "status-exception";
  if (
    status === "in_transit" ||
    status === "out_for_delivery" ||
    status === "at_port"
  )
    return "status-active";
  return "status-default";
}

export function ShipmentHeader({
  shipment,
  primaryColor,
}: ShipmentHeaderProps) {
  const brandColor = primaryColor ?? "var(--color-primary)";
  const etaFormatted = formatDate(shipment.estimatedDelivery);
  const actualFormatted = formatDate(shipment.actualDelivery);
  const createdFormatted = formatDate(shipment.createdAt);

  return (
    <div className="shipment-header">
      <div className="shipment-route">
        <div className="shipment-route-point">
          <span className="shipment-route-label">Origin</span>
          <span className="shipment-route-value">{shipment.origin}</span>
        </div>
        <div className="shipment-route-line">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={brandColor}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
          </svg>
        </div>
        <div className="shipment-route-point">
          <span className="shipment-route-label">Destination</span>
          <span className="shipment-route-value">{shipment.destination}</span>
        </div>
      </div>

      <div className="shipment-meta-grid">
        <div className="shipment-meta-item">
          <span className="shipment-meta-label">Tracking ID</span>
          <span className="shipment-meta-value">{shipment.trackingId}</span>
        </div>
        {shipment.carrier && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Carrier</span>
            <span className="shipment-meta-value">{shipment.carrier}</span>
          </div>
        )}
        {shipment.serviceType && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Service</span>
            <span className="shipment-meta-value">{shipment.serviceType}</span>
          </div>
        )}
        {actualFormatted && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Delivered</span>
            <span className="shipment-meta-value">{actualFormatted}</span>
          </div>
        )}
        {!actualFormatted && etaFormatted && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Est. Delivery</span>
            <span className="shipment-meta-value">{etaFormatted}</span>
          </div>
        )}
        {shipment.reference && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Reference</span>
            <span className="shipment-meta-value">{shipment.reference}</span>
          </div>
        )}
        {createdFormatted && (
          <div className="shipment-meta-item">
            <span className="shipment-meta-label">Created</span>
            <span className="shipment-meta-value">{createdFormatted}</span>
          </div>
        )}
      </div>

      <span
        className={`shipment-status-badge ${getStatusClass(shipment.status)}`}
        style={{ backgroundColor: brandColor }}
      >
        {getStatusLabel(shipment.status)}
      </span>
    </div>
  );
}
