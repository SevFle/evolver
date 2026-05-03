interface BrandedShellProps {
  children: React.ReactNode;
  tenantName?: string;
  logoUrl?: string;
  primaryColor?: string;
}

export function BrandedShell({
  children,
  tenantName = "ShipLens",
  primaryColor,
}: BrandedShellProps) {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "2rem 1rem",
      }}
    >
      <header
        style={{
          width: "100%",
          maxWidth: "640px",
          marginBottom: "2rem",
          borderBottom: `2px solid ${primaryColor ?? "var(--color-primary)"}`,
          paddingBottom: "1rem",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>{tenantName}</h1>
      </header>
      <main style={{ width: "100%", maxWidth: "640px" }}>{children}</main>
      <footer
        style={{
          marginTop: "auto",
          paddingTop: "2rem",
          fontSize: "0.75rem",
          color: "var(--color-muted)",
        }}
      >
        Powered by ShipLens
      </footer>
    </div>
  );
}
