import Link from "next/link";

export default async function ShipmentDetailPage({
  params,
}: {
  params: Promise<{ trackingId: string }>;
}) {
  const { trackingId } = await params;

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <Link
        href="/shipments"
        style={{
          color: "var(--color-primary)",
          textDecoration: "none",
          fontSize: "0.875rem",
          display: "inline-block",
          marginBottom: "1rem",
        }}
      >
        &larr; Back to shipments
      </Link>
      <h1
        style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}
      >
        Shipment {trackingId}
      </h1>
      <p style={{ color: "var(--color-muted)" }}>
        Shipment detail view coming soon.
      </p>
    </div>
  );
}
