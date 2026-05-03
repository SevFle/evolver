"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { apiClient } from "@/lib/api-client";
import { StatusBadge } from "@/components/StatusBadge";
import type { ShipmentStatus } from "@shiplens/shared";

export interface Shipment {
  id: string;
  trackingId: string;
  reference: string | null;
  origin: string | null;
  destination: string | null;
  carrier: string | null;
  serviceType: string | null;
  status: ShipmentStatus;
  estimatedDelivery: string | null;
  actualDelivery: string | null;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

interface ShipmentListResponse {
  success: boolean;
  data: Shipment[];
  total: number;
  page: number;
  pageSize: number;
}

const PAGE_SIZE = 20;

const STATUS_FILTERS: { value: ShipmentStatus | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "booked", label: "Booked" },
  { value: "in_transit", label: "In Transit" },
  { value: "at_port", label: "At Port" },
  { value: "delivered", label: "Delivered" },
  { value: "exception", label: "Exception" },
];

export function ShipmentList() {
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<ShipmentStatus | "all">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const queryParams = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", String(PAGE_SIZE));
    if (search.trim()) params.set("search", search.trim());
    if (statusFilter !== "all") params.set("status", statusFilter);
    return params.toString();
  }, [page, search, statusFilter]);

  const fetchShipments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<ShipmentListResponse>(
        `/api/shipments?${queryParams}`
      );
      setShipments(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load shipments");
    } finally {
      setLoading(false);
    }
  }, [queryParams]);

  useEffect(() => {
    fetchShipments();
  }, [fetchShipments]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPage(1);
    fetchShipments();
  }

  function handleStatusFilter(value: ShipmentStatus | "all") {
    setStatusFilter(value);
    setPage(1);
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          gap: "1rem",
          alignItems: "center",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        <form onSubmit={handleSearchSubmit} style={{ flex: 1, minWidth: "200px" }}>
          <input
            type="text"
            placeholder="Search by tracking ID, reference, or customer..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              border: "1px solid var(--color-border)",
              borderRadius: "6px",
              fontSize: "0.875rem",
              backgroundColor: "var(--color-surface)",
              color: "var(--color-text)",
            }}
            aria-label="Search shipments"
          />
        </form>
      </div>

      <div
        style={{
          display: "flex",
          gap: "0.375rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => handleStatusFilter(f.value)}
            style={{
              padding: "0.375rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.8125rem",
              fontWeight: statusFilter === f.value ? 600 : 400,
              border:
                statusFilter === f.value
                  ? "1px solid var(--color-primary)"
                  : "1px solid var(--color-border)",
              backgroundColor:
                statusFilter === f.value
                  ? "rgba(37, 99, 235, 0.08)"
                  : "var(--color-surface)",
              color:
                statusFilter === f.value
                  ? "var(--color-primary)"
                  : "var(--color-muted)",
              cursor: "pointer",
            }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          style={{
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            borderRadius: "6px",
            backgroundColor: "#fee2e2",
            color: "#b91c1c",
            fontSize: "0.875rem",
          }}
        >
          {error}
        </div>
      )}

      <div
        style={{
          border: "1px solid var(--color-border)",
          borderRadius: "8px",
          overflow: "hidden",
        }}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: "0.875rem",
          }}
        >
          <thead>
            <tr
              style={{
                backgroundColor: "var(--color-bg)",
                borderBottom: "1px solid var(--color-border)",
                textAlign: "left",
              }}
            >
              <th style={thStyle}>Tracking ID</th>
              <th style={thStyle}>Origin</th>
              <th style={thStyle}>Destination</th>
              <th style={thStyle}>Carrier</th>
              <th style={thStyle}>Customer</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>ETA</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--color-muted)",
                  }}
                >
                  Loading...
                </td>
              </tr>
            ) : shipments.length === 0 ? (
              <tr>
                <td
                  colSpan={7}
                  style={{
                    padding: "2rem",
                    textAlign: "center",
                    color: "var(--color-muted)",
                  }}
                >
                  No shipments found
                </td>
              </tr>
            ) : (
              shipments.map((s) => (
                <tr
                  key={s.id}
                  style={{ borderBottom: "1px solid var(--color-border)" }}
                >
                  <td style={tdStyle}>
                    <span style={{ fontWeight: 600, color: "var(--color-primary)" }}>
                      {s.trackingId}
                    </span>
                  </td>
                  <td style={tdStyle}>{s.origin ?? "—"}</td>
                  <td style={tdStyle}>{s.destination ?? "—"}</td>
                  <td style={tdStyle}>{s.carrier ?? "—"}</td>
                  <td style={tdStyle}>{s.customerName ?? "—"}</td>
                  <td style={tdStyle}>
                    <StatusBadge status={s.status} />
                  </td>
                  <td style={tdStyle}>
                    {s.estimatedDelivery
                      ? new Date(s.estimatedDelivery).toLocaleDateString()
                      : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: "1rem",
            fontSize: "0.875rem",
            color: "var(--color-muted)",
          }}
        >
          <span>
            {total} shipment{total !== 1 ? "s" : ""}
          </span>
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={pageButtonStyle(page <= 1)}
            >
              Previous
            </button>
            <span style={{ padding: "0.375rem 0.5rem" }}>
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={pageButtonStyle(page >= totalPages)}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  fontWeight: 600,
  fontSize: "0.75rem",
  textTransform: "uppercase",
  letterSpacing: "0.05em",
  color: "var(--color-muted)",
};

const tdStyle: React.CSSProperties = {
  padding: "0.625rem 0.75rem",
  color: "var(--color-text)",
};

function pageButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    padding: "0.375rem 0.75rem",
    borderRadius: "6px",
    border: "1px solid var(--color-border)",
    backgroundColor: "var(--color-surface)",
    color: disabled ? "var(--color-muted)" : "var(--color-text)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.5 : 1,
    fontSize: "0.8125rem",
  };
}
