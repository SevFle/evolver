"use client";

import type { ShipmentStatus } from "@shiplens/shared";

const STATUS_CONFIG: Record<
  ShipmentStatus,
  { label: string; bg: string; color: string }
> = {
  pending: { label: "Pending", bg: "#f3f4f6", color: "#6b7280" },
  booked: { label: "Booked", bg: "#dbeafe", color: "#1d4ed8" },
  in_transit: { label: "In Transit", bg: "#e0e7ff", color: "#4338ca" },
  at_port: { label: "At Port", bg: "#fef3c7", color: "#b45309" },
  customs_clearance: { label: "Customs", bg: "#ffedd5", color: "#c2410c" },
  out_for_delivery: { label: "Out for Delivery", bg: "#cffafe", color: "#0e7490" },
  delivered: { label: "Delivered", bg: "#d1fae5", color: "#047857" },
  exception: { label: "Exception", bg: "#fee2e2", color: "#b91c1c" },
};

interface StatusBadgeProps {
  status: ShipmentStatus;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;

  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "9999px",
        fontSize: "12px",
        fontWeight: 600,
        lineHeight: "20px",
        backgroundColor: config.bg,
        color: config.color,
        whiteSpace: "nowrap",
      }}
    >
      {config.label}
    </span>
  );
}

export { STATUS_CONFIG };
