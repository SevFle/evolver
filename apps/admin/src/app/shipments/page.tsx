"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { apiClient } from "@/lib/api-client";
import type { ShipmentStatus } from "@shiplens/shared";

interface Shipment {
  trackingId: string;
  customerName?: string;
  origin: string;
  destination: string;
  status: ShipmentStatus;
  estimatedDelivery?: string;
  lastMilestone?: string;
  lastMilestoneTime?: string;
}

interface ShipmentsResponse {
  success: boolean;
  data: Shipment[];
}

type SortField =
  | "trackingId"
  | "customerName"
  | "origin"
  | "destination"
  | "status"
  | "estimatedDelivery";
type SortDir = "asc" | "desc";

const STATUS_OPTIONS: { value: ShipmentStatus; label: string }[] = [
  { value: "pending", label: "Pending" },
  { value: "booked", label: "Booked" },
  { value: "in_transit", label: "In Transit" },
  { value: "at_port", label: "At Port" },
  { value: "customs_clearance", label: "Customs Clearance" },
  { value: "out_for_delivery", label: "Out for Delivery" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
];

const STATUS_COLORS: Record<ShipmentStatus, { bg: string; text: string }> = {
  pending: { bg: "#f3f4f6", text: "#374151" },
  booked: { bg: "#dbeafe", text: "#1e40af" },
  in_transit: { bg: "#e0e7ff", text: "#3730a3" },
  at_port: { bg: "#ccfbf1", text: "#0f766e" },
  customs_clearance: { bg: "#fef3c7", text: "#92400e" },
  out_for_delivery: { bg: "#ede9fe", text: "#5b21b6" },
  delivered: { bg: "#dcfce7", text: "#166534" },
  exception: { bg: "#fee2e2", text: "#991b1b" },
};

function formatStatus(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatDate(iso?: string): string {
  if (!iso) return "\u2014";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: ShipmentStatus }) {
  const colors = STATUS_COLORS[status] ?? STATUS_COLORS.pending;
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: 9999,
        fontSize: "0.75rem",
        fontWeight: 600,
        lineHeight: "1.5",
        backgroundColor: colors.bg,
        color: colors.text,
        whiteSpace: "nowrap",
      }}
    >
      {formatStatus(status)}
    </span>
  );
}

function SortIcon({
  field,
  sortField,
  sortDir,
}: {
  field: SortField;
  sortField: SortField;
  sortDir: SortDir;
}) {
  if (sortField !== field) {
    return (
      <span style={{ marginLeft: 4, opacity: 0.3, fontSize: "0.7rem" }}>
        \u2195
      </span>
    );
  }
  return (
    <span style={{ marginLeft: 4, fontSize: "0.7rem" }}>
      {sortDir === "asc" ? "\u2191" : "\u2193"}
    </span>
  );
}

function LoadingSkeleton() {
  const rows = Array.from({ length: 6 });
  return (
    <table style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead>
        <tr>
          {["Tracking ID", "Customer", "Origin", "Destination", "Status", "ETA", "Last Milestone"].map(
            (h) => (
              <th
                key={h}
                style={{
                  textAlign: "left",
                  padding: "0.75rem 1rem",
                  borderBottom: "2px solid var(--color-border)",
                  fontSize: "0.8rem",
                  fontWeight: 600,
                  color: "var(--color-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                {h}
              </th>
            )
          )}
        </tr>
      </thead>
      <tbody>
        {rows.map((_, i) => (
          <tr key={i}>
            {Array.from({ length: 7 }).map((_, j) => (
              <td
                key={j}
                style={{
                  padding: "0.75rem 1rem",
                  borderBottom: "1px solid var(--color-border)",
                }}
              >
                <div
                  style={{
                    height: 16,
                    borderRadius: 4,
                    background:
                      "linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.5s ease-in-out infinite",
                  }}
                />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function EmptyState({ hasFilter }: { hasFilter: boolean }) {
  return (
    <div
      style={{
        textAlign: "center",
        padding: "4rem 2rem",
        color: "var(--color-muted)",
      }}
    >
      <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>
        {hasFilter ? "\U0001f50d" : "\U0001f4e6"}
      </div>
      <h3
        style={{
          fontSize: "1.1rem",
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: "0.5rem",
        }}
      >
        {hasFilter ? "No matching shipments" : "No shipments yet"}
      </h3>
      <p style={{ fontSize: "0.9rem", maxWidth: 400, margin: "0 auto" }}>
        {hasFilter
          ? "Try adjusting your filters to find what you\u2019re looking for."
          : "Create your first shipment to get started with tracking."}
      </p>
    </div>
  );
}

const TH_STYLE: React.CSSProperties = {
  textAlign: "left",
  padding: "0.75rem 1rem",
  borderBottom: "2px solid var(--color-border)",
  fontSize: "0.8rem",
  fontWeight: 600,
  color: "var(--color-muted)",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  cursor: "pointer",
  userSelect: "none",
  whiteSpace: "nowrap",
};

const TD_STYLE: React.CSSProperties = {
  padding: "0.75rem 1rem",
  borderBottom: "1px solid var(--color-border)",
  fontSize: "0.875rem",
};

export default function ShipmentsPage() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "">("");
  const [sortField, setSortField] = useState<SortField>("estimatedDelivery");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  useEffect(() => {
    let cancelled = false;

    async function fetchShipments() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<ShipmentsResponse>("/api/shipments");
        if (!cancelled) {
          setShipments(res.data ?? []);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load shipments");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchShipments();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleSort = useCallback(
    (field: SortField) => {
      if (sortField === field) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortField(field);
        setSortDir("asc");
      }
    },
    [sortField]
  );

  const filteredAndSorted = useMemo(() => {
    let result = shipments;

    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter);
    }

    result = [...result].sort((a, b) => {
      const aVal = a[sortField] ?? "";
      const bVal = b[sortField] ?? "";
      const cmp = String(aVal).localeCompare(String(bVal));
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [shipments, statusFilter, sortField, sortDir]);

  const columns: { key: SortField; label: string }[] = [
    { key: "trackingId", label: "Tracking ID" },
    { key: "customerName", label: "Customer" },
    { key: "origin", label: "Origin" },
    { key: "destination", label: "Destination" },
    { key: "status", label: "Status" },
    { key: "estimatedDelivery", label: "ETA" },
  ];

  return (
    <div style={{ padding: "2rem", maxWidth: "1400px", margin: "0 auto" }}>
      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <h1
          style={{
            fontSize: "1.25rem",
            fontWeight: 600,
          }}
        >
          Shipments
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          <label
            htmlFor="status-filter"
            style={{ fontSize: "0.85rem", color: "var(--color-muted)" }}
          >
            Filter by status:
          </label>
          <select
            id="status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as ShipmentStatus | "")
            }
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: 6,
              border: "1px solid var(--color-border)",
              fontSize: "0.85rem",
              background: "var(--color-surface)",
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div
        style={{
          background: "var(--color-surface)",
          borderRadius: 8,
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        {error && (
          <div
            style={{
              padding: "1rem",
              background: "#fee2e2",
              color: "#991b1b",
              fontSize: "0.875rem",
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <LoadingSkeleton />
        ) : filteredAndSorted.length === 0 ? (
          <EmptyState hasFilter={statusFilter !== ""} />
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      style={TH_STYLE}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                      <SortIcon
                        field={col.key}
                        sortField={sortField}
                        sortDir={sortDir}
                      />
                    </th>
                  ))}
                  <th
                    style={{
                      ...TH_STYLE,
                      cursor: "default",
                    }}
                  >
                    Last Milestone
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.map((s) => (
                  <tr
                    key={s.trackingId}
                    style={{ transition: "background 0.15s" }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "#f9fafb")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = "")
                    }
                  >
                    <td style={TD_STYLE}>
                      <Link
                        href={`/shipments/${s.trackingId}`}
                        style={{
                          color: "var(--color-primary)",
                          textDecoration: "none",
                          fontWeight: 500,
                        }}
                      >
                        {s.trackingId}
                      </Link>
                    </td>
                    <td style={TD_STYLE}>{s.customerName ?? "\u2014"}</td>
                    <td style={TD_STYLE}>{s.origin}</td>
                    <td style={TD_STYLE}>{s.destination}</td>
                    <td style={TD_STYLE}>
                      <StatusBadge status={s.status} />
                    </td>
                    <td style={TD_STYLE}>
                      {formatDate(s.estimatedDelivery)}
                    </td>
                    <td
                      style={{
                        ...TD_STYLE,
                        color: "var(--color-muted)",
                        fontSize: "0.8rem",
                      }}
                    >
                      {s.lastMilestone ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && filteredAndSorted.length > 0 && (
        <div
          style={{
            marginTop: "0.75rem",
            fontSize: "0.8rem",
            color: "var(--color-muted)",
            textAlign: "right",
          }}
        >
          {filteredAndSorted.length} shipment
          {filteredAndSorted.length !== 1 ? "s" : ""}
          {statusFilter ? ` matching "${formatStatus(statusFilter)}"` : ""}
        </div>
      )}
    </div>
  );
}
