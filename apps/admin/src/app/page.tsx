import Link from "next/link";

export default function AdminDashboard() {
  return (
    <div style={{ padding: "1.5rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.5rem", fontWeight: 600, marginBottom: "0.5rem" }}>
        Dashboard
      </h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "2rem" }}>
        Welcome to ShipLens. Manage your shipments, API keys, and tracking page configuration.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "1rem" }}>
        <DashboardCard
          href="/shipments"
          title="Shipments"
          description="View, search, and manage your shipments"
        />
        <DashboardCard
          href="/api-keys"
          title="API Keys"
          description="Manage API keys for integrations"
        />
        <DashboardCard
          href="/settings"
          title="Tracking Page Config"
          description="Customize your tracking page branding"
        />
      </div>
    </div>
  );
}

function DashboardCard({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      style={{
        display: "block",
        padding: "1.25rem",
        border: "1px solid var(--color-border)",
        borderRadius: "8px",
        backgroundColor: "var(--color-surface)",
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ fontWeight: 600, marginBottom: "0.375rem" }}>{title}</div>
      <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
        {description}
      </div>
    </Link>
  );
}
