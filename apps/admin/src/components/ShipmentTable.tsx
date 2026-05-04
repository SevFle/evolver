"use client";

import Link from "next/link";
import type { ShipmentStatus } from "@shiplens/shared";
import { StatusBadge } from "./StatusBadge";

export interface ShipmentRow {
  id: string;
  trackingId: string;
  customerName: string | null;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  status: ShipmentStatus;
  estimatedDelivery: string | null;
}

interface ShipmentTableProps {
  shipments: ShipmentRow[];
  loading: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return "—";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function ShipmentTable({ shipments, loading }: ShipmentTableProps) {
  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
        Loading shipments...
      </div>
    );
  }

  if (shipments.length === 0) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
        No shipments found.
      </div>
    );
  }

  const thStyle: React.CSSProperties = {
    padding: "0.625rem 0.75rem",
    fontSize: "0.75rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    color: "var(--color-muted)",
    textAlign: "left",
    borderBottom: "1px solid var(--color-border)",
    whiteSpace: "nowrap",
  };

  const tdStyle: React.CSSProperties = {
    padding: "0.625rem 0.75rem",
    fontSize: "0.875rem",
    borderBottom: "1px solid var(--color-border)",
    color: "var(--color-text)",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "180px",
  };

  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={thStyle}>Tracking ID</th>
            <th style={thStyle}>Customer</th>
            <th style={thStyle}>Origin</th>
            <th style={thStyle}>Destination</th>
            <th style={thStyle}>Carrier</th>
            <th style={thStyle}>Status</th>
            <th style={thStyle}>ETA</th>
          </tr>
        </thead>
        <tbody>
          {shipments.map((s) => (
            <tr key={s.id} style={{ cursor: "pointer" }}>
              <td style={{ ...tdStyle, maxWidth: "none" }}>
                <Link
                  href={`/shipments/${s.trackingId}`}
                  style={{ color: "var(--color-primary)", textDecoration: "none", fontWeight: 500 }}
                >
                  {s.trackingId}
                </Link>
              </td>
              <td style={tdStyle}>{s.customerName || "—"}</td>
              <td style={tdStyle}>{s.origin || "—"}</td>
              <td style={tdStyle}>{s.destination || "—"}</td>
              <td style={tdStyle}>{s.carrier || "—"}</td>
              <td style={tdStyle}>
                <StatusBadge status={s.status} />
              </td>
              <td style={tdStyle}>{formatDate(s.estimatedDelivery)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
