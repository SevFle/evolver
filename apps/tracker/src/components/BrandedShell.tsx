import { sanitizeUrl } from "@/lib/url-sanitizer";

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
  const safeLogoUrl = sanitizeUrl(logoUrl);
  const safeSupportUrl = sanitizeUrl(supportUrl);

  return (
    <div className="tracking-shell">
      <header className="tracking-header" style={{ borderColor: brandColor }}>
        <div className="tracking-header-inner">
          <div className="tracking-brand">
            {safeLogoUrl ? (
              <img
                src={safeLogoUrl}
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
          {safeSupportUrl && (
            <a
              href={safeSupportUrl}
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
