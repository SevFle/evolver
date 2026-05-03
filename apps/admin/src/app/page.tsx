export default function AdminDashboard() {
  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "1rem" }}>
        ShipLens Admin
      </h1>
      <nav style={{ display: "flex", gap: "1rem", marginBottom: "2rem" }}>
        <a href="/shipments" style={{ color: "var(--color-primary)" }}>
          Shipments
        </a>
        <a href="/settings" style={{ color: "var(--color-primary)" }}>
          Settings
        </a>
        <a href="/api-keys" style={{ color: "var(--color-primary)" }}>
          API Keys
        </a>
        <a href="/notifications" style={{ color: "var(--color-primary)" }}>
          Notifications
        </a>
      </nav>
      <p style={{ color: "var(--color-muted)" }}>
        Welcome to ShipLens. Select a section to get started.
      </p>
    </div>
  );
}
