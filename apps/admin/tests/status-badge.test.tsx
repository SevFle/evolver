import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge, STATUS_CONFIG } from "@/components/StatusBadge";
import type { ShipmentStatus } from "@shiplens/shared";

const ALL_STATUSES: ShipmentStatus[] = [
  "pending",
  "booked",
  "in_transit",
  "at_port",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "exception",
];

describe("StatusBadge", () => {
  it("renders all statuses without crashing", () => {
    ALL_STATUSES.forEach((status) => {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(STATUS_CONFIG[status].label)).toBeDefined();
      unmount();
    });
  });

  it.each(ALL_STATUSES.map((s) => [s, STATUS_CONFIG[s].label] as const))(
    "renders correct label for status '%s'",
    (status, label) => {
      render(<StatusBadge status={status} />);
      expect(screen.getByText(label)).toBeDefined();
    }
  );

  it("applies background and text color styling", () => {
    render(<StatusBadge status="exception" />);
    const badge = screen.getByText("Exception");
    expect(badge.style.backgroundColor).toBeDefined();
    expect(badge.style.backgroundColor).not.toBe("");
    expect(badge.style.color).toBeDefined();
    expect(badge.style.color).not.toBe("");
  });

  it("renders as inline-block pill shape", () => {
    render(<StatusBadge status="booked" />);
    const badge = screen.getByText("Booked");
    expect(badge.style.display).toBe("inline-block");
    expect(badge.style.borderRadius).toBe("9999px");
  });

  it("renders with expected labels", () => {
    const expected: Record<ShipmentStatus, string> = {
      pending: "Pending",
      booked: "Booked",
      in_transit: "In Transit",
      at_port: "At Port",
      customs_clearance: "Customs",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      exception: "Exception",
    };
    ALL_STATUSES.forEach((status) => {
      expect(STATUS_CONFIG[status].label).toBe(expected[status]);
    });
  });
});
