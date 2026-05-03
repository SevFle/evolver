"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { ShipmentStatus, ApiResponse } from "@shiplens/shared";
import { SearchFilter } from "./SearchFilter";
import { ShipmentTable, type ShipmentRow } from "./ShipmentTable";

interface ShipmentItem {
  id: string;
  trackingId: string;
  customerName?: string | null;
  origin?: string | null;
  destination?: string | null;
  carrier?: string | null;
  status: ShipmentStatus;
  estimatedDelivery?: string | null;
}

function clientFilter(shipments: ShipmentItem[], search: string, statusKey: string): ShipmentRow[] {
  const q = search.toLowerCase();
  return shipments
    .filter((s) => {
      if (statusKey !== "all" && s.status !== statusKey) return false;
      if (!q) return true;
      return (
        s.trackingId.toLowerCase().includes(q) ||
        (s.customerName ?? "").toLowerCase().includes(q) ||
        (s.origin ?? "").toLowerCase().includes(q) ||
        (s.destination ?? "").toLowerCase().includes(q) ||
        (s.carrier ?? "").toLowerCase().includes(q)
      );
    })
    .map((s) => ({
      id: s.id,
      trackingId: s.trackingId,
      customerName: s.customerName ?? null,
      origin: s.origin ?? null,
      destination: s.destination ?? null,
      carrier: s.carrier ?? null,
      status: s.status,
      estimatedDelivery: s.estimatedDelivery ?? null,
    }));
}

export function ShipmentsPage() {
  const [shipments, setShipments] = useState<ShipmentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [activeStatus, setActiveStatus] = useState("all");

  useEffect(() => {
    let cancelled = false;

    async function fetchShipments() {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (activeStatus !== "all") params.set("status", activeStatus);
        if (search) params.set("search", search);

        const query = params.toString();
        const path = `/api/shipments${query ? `?${query}` : ""}`;
        const res = await apiClient.get<ApiResponse<ShipmentItem[]>>(path);
        if (!cancelled) setShipments(res.data ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load shipments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchShipments();
    return () => { cancelled = true; };
  }, [activeStatus, search]);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleStatusChange = useCallback((status: string) => {
    setActiveStatus(status);
  }, []);

  const filtered = clientFilter(shipments, search, activeStatus);

  return (
    <div style={{ padding: "2rem", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
        Shipments
      </h1>
      <div
        style={{
          backgroundColor: "var(--color-surface)",
          borderRadius: "0.5rem",
          border: "1px solid var(--color-border)",
          overflow: "hidden",
        }}
      >
        <div style={{ padding: "1rem 1rem 0" }}>
          <SearchFilter
            search={search}
            onSearchChange={handleSearchChange}
            activeStatus={activeStatus}
            onStatusChange={handleStatusChange}
          />
        </div>
        {error && (
          <div style={{ padding: "0 1rem", color: "#dc2626", fontSize: "0.875rem", marginBottom: "0.75rem" }}>
            {error}
          </div>
        )}
        <ShipmentTable shipments={filtered} loading={loading} />
      </div>
    </div>
  );
}
