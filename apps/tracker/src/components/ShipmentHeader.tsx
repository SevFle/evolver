interface ShipmentHeaderProps {
  shipment: {
    trackingId: string;
    origin: string;
    destination: string;
    status: string;
    carrier?: string;
    estimatedDelivery?: string;
  };
}

export function ShipmentHeader({ shipment }: ShipmentHeaderProps) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <h2 style={{ fontSize: "1.125rem", marginBottom: "0.5rem" }}>
        {shipment.origin} → {shipment.destination}
      </h2>
      <p style={{ color: "var(--color-muted)", marginBottom: "0.25rem" }}>
        Tracking: {shipment.trackingId}
      </p>
      {shipment.carrier && (
        <p style={{ color: "var(--color-muted)", marginBottom: "0.25rem" }}>
          Carrier: {shipment.carrier}
        </p>
      )}
      {shipment.estimatedDelivery && (
        <p style={{ color: "var(--color-muted)", marginBottom: "0.25rem" }}>
          Est. delivery: {shipment.estimatedDelivery}
        </p>
      )}
      <p
        style={{
          display: "inline-block",
          padding: "0.25rem 0.75rem",
          borderRadius: "9999px",
          background: "var(--color-primary)",
          color: "#fff",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          marginTop: "0.5rem",
        }}
      >
        {shipment.status.replace(/_/g, " ").toUpperCase()}
      </p>
    </div>
  );
}
