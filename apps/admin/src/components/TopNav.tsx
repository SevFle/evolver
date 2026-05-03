"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/shipments", label: "Shipments" },
  { href: "/api-keys", label: "API Keys" },
  { href: "/settings", label: "Tracking Page Config" },
];

export function TopNav() {
  const pathname = usePathname();

  return (
    <header
      style={{
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 1.5rem",
          height: "56px",
          maxWidth: "1200px",
          margin: "0 auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "2rem" }}>
          <Link
            href="/"
            style={{
              fontWeight: 700,
              fontSize: "1.125rem",
              color: "var(--color-text)",
              textDecoration: "none",
            }}
          >
            ShipLens
          </Link>
          <nav style={{ display: "flex", gap: "0.25rem" }}>
            {NAV_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== "/" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  style={{
                    padding: "0.375rem 0.75rem",
                    borderRadius: "6px",
                    fontSize: "0.875rem",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive
                      ? "var(--color-primary)"
                      : "var(--color-muted)",
                    backgroundColor: isActive
                      ? "rgba(37, 99, 235, 0.08)"
                      : "transparent",
                    textDecoration: "none",
                  }}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
