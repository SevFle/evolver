"use client";

import type { ShipmentStatus } from "@shiplens/shared";

const STATUS_CONFIG: Record<ShipmentStatus, { label: string; bg: string; color: string }> = {
  pending: { label: "Pending", bg: "#f3f4f6", color: "#6b7280" },
  booked: { label: "Booked", bg: "#dbeafe", color: "#1d4ed8" },
  in_transit: { label: "In Transit", bg: "#dbeafe", color: "#1d4ed8" },
  at_port: { label: "At Port", bg: "#fef3c7", color: "#b45309" },
  customs_clearance: { label: "Customs", bg: "#fef3c7", color: "#b45309" },
  out_for_delivery: { label: "Out for Delivery", bg: "#ede9fe", color: "#7c3aed" },
  delivered: { label: "Delivered", bg: "#d1fae5", color: "#047857" },
  exception: { label: "Exception", bg: "#fee2e2", color: "#dc2626" },
};

interface StatusBadgeProps {
  status: ShipmentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? { label: status, bg: "#f3f4f6", color: "#6b7280" };

  return (
    <span
      style={{
        display: "inline-block",
        padding: "0.125rem 0.5rem",
        borderRadius: "9999px",
        fontSize: "0.75rem",
        fontWeight: 500,
        lineHeight: "1.25rem",
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}
