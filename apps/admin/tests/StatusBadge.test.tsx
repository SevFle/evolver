import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusBadge } from "../src/components/StatusBadge";

const STATUSES = [
  "pending",
  "booked",
  "in_transit",
  "at_port",
  "customs_clearance",
  "out_for_delivery",
  "delivered",
  "exception",
] as const;

describe("StatusBadge", () => {
  it("renders the correct label for each status", () => {
    const expected: Record<string, string> = {
      pending: "Pending",
      booked: "Booked",
      in_transit: "In Transit",
      at_port: "At Port",
      customs_clearance: "Customs",
      out_for_delivery: "Out for Delivery",
      delivered: "Delivered",
      exception: "Exception",
    };

    for (const status of STATUSES) {
      const { unmount } = render(<StatusBadge status={status} />);
      expect(screen.getByText(expected[status])).toBeTruthy();
      unmount();
    }
  });

  it("applies inline styles with backgroundColor and color", () => {
    render(<StatusBadge status="delivered" />);
    const badge = screen.getByText("Delivered");
    expect(badge.style.backgroundColor).toBe("rgb(209, 250, 229)");
    expect(badge.style.color).toBe("rgb(4, 120, 87)");
  });

  it("renders as a span element", () => {
    render(<StatusBadge status="pending" />);
    const badge = screen.getByText("Pending");
    expect(badge.tagName).toBe("SPAN");
  });

  it("renders fallback for unknown status", () => {
    render(<StatusBadge status={"unknown_status" as "pending"} />);
    const badge = screen.getByText("unknown_status");
    expect(badge).toBeDefined();
    expect(badge.style.backgroundColor).toBe("rgb(243, 244, 246)");
    expect(badge.style.color).toBe("rgb(107, 114, 128)");
  });
});
