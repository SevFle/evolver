import { ShipmentList } from "@/components/ShipmentList";

export default function ShipmentsPage() {
  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1
        style={{
          fontSize: "1.25rem",
          fontWeight: 600,
          marginBottom: "1.5rem",
        }}
      >
        Shipments
      </h1>
      <ShipmentList />
    </div>
  );
}
