interface BrandedShellProps {
  children: React.ReactNode;
  tenantName?: string;
  logoUrl?: string | null;
  primaryColor?: string | null;
  tagline?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  supportUrl?: string | null;
  customFooterText?: string | null;
}

export function BrandedShell({
  children,
  tenantName = "ShipLens",
  logoUrl,
  primaryColor,
  tagline,
  contactEmail,
  contactPhone,
  supportUrl,
  customFooterText,
}: BrandedShellProps) {
  const brandColor = primaryColor ?? "var(--color-primary)";

  return (
    <div className="tracking-shell">
      <header className="tracking-header" style={{ borderColor: brandColor }}>
        <div className="tracking-header-inner">
          <div className="tracking-brand">
            {logoUrl ? (
              <img
                src={logoUrl}
                alt={tenantName}
                className="tracking-logo"
              />
            ) : (
              <h1 className="tracking-brand-name" style={{ color: brandColor }}>
                {tenantName}
              </h1>
            )}
            {tagline && <p className="tracking-tagline">{tagline}</p>}
          </div>
        </div>
      </header>

      <main className="tracking-main">{children}</main>

      <footer className="tracking-footer">
        {customFooterText && (
          <p className="tracking-footer-custom">{customFooterText}</p>
        )}
        <div className="tracking-footer-links">
          {contactEmail && (
            <a href={`mailto:${contactEmail}`} className="tracking-footer-link">
              {contactEmail}
            </a>
          )}
          {contactPhone && (
            <a href={`tel:${contactPhone}`} className="tracking-footer-link">
              {contactPhone}
            </a>
          )}
          {supportUrl && (
            <a
              href={supportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="tracking-footer-link"
            >
              Support
            </a>
          )}
        </div>
        <p className="tracking-footer-powered">
          Powered by{" "}
          <span style={{ color: brandColor, fontWeight: 600 }}>ShipLens</span>
        </p>
      </footer>
    </div>
  );
}
