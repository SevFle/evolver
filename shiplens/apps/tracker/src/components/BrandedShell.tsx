interface BrandedShellProps {
  tenantName: string;
  logoUrl?: string;
  primaryColor?: string;
  children: React.ReactNode;
}

export function BrandedShell({
  tenantName,
  logoUrl,
  primaryColor = "#2563eb",
  children,
}: BrandedShellProps) {
  return (
    <div className="min-h-screen flex flex-col">
      <header
        className="px-6 py-4 text-white"
        style={{ backgroundColor: primaryColor }}
      >
        <div className="max-w-4xl mx-auto flex items-center gap-3">
          {logoUrl && (
            <img src={logoUrl} alt={tenantName} className="h-8 w-auto" />
          )}
          <span className="text-lg font-semibold">{tenantName}</span>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-center text-xs text-gray-400 py-4">
        Powered by ShipLens
      </footer>
    </div>
  );
}
