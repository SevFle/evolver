import { describe, it, expect, vi, afterEach } from "vitest";
import { render } from "@testing-library/react";
import { ShipmentHeader } from "../../src/components/ShipmentHeader";
import type { TrackingPageData } from "../../src/lib/tracking-api";

const baseShipment: TrackingPageData = {
  trackingId: "SL-ABC123",
  origin: "Shanghai",
  destination: "Los Angeles",
  status: "in_transit",
};

describe("ShipmentHeader", () => {
  it("renders origin and destination", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText("Shanghai")).toBeDefined();
    expect(getByText("Los Angeles")).toBeDefined();
  });

  it("renders tracking ID", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText("SL-ABC123")).toBeDefined();
  });

  it("renders origin and destination labels", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText("Origin")).toBeDefined();
    expect(getByText("Destination")).toBeDefined();
  });

  it("renders status with underscores replaced by spaces", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText("IN TRANSIT")).toBeDefined();
  });

  it("renders status in uppercase", () => {
    const { getByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "delivered" }} />
    );
    expect(getByText("DELIVERED")).toBeDefined();
  });

  it("renders carrier when provided", () => {
    const { getByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, carrier: "Maersk" }} />
    );
    expect(getByText("Maersk")).toBeDefined();
  });

  it("does not render carrier when null", () => {
    const { queryByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, carrier: null }} />
    );
    expect(queryByText(/Carrier/)).toBeNull();
  });

  it("does not render carrier when omitted", () => {
    const { container } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(container.textContent).not.toContain("Carrier");
  });

  it("renders estimated delivery date when provided", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{
          ...baseShipment,
          estimatedDelivery: "2025-06-01T00:00:00Z",
        }}
      />
    );
    expect(getByText("Est. Delivery")).toBeDefined();
  });

  it("renders actual delivery date instead of estimated when both present", () => {
    const { getByText, queryByText } = render(
      <ShipmentHeader
        shipment={{
          ...baseShipment,
          estimatedDelivery: "2025-06-01T00:00:00Z",
          actualDelivery: "2025-05-30T00:00:00Z",
        }}
      />
    );
    expect(getByText("Delivered")).toBeDefined();
    expect(queryByText("Est. Delivery")).toBeNull();
  });

  it("renders service type when provided", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, serviceType: "FCL" }}
      />
    );
    expect(getByText("FCL")).toBeDefined();
  });

  it("renders reference when provided", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, reference: "PO-12345" }}
      />
    );
    expect(getByText("PO-12345")).toBeDefined();
  });

  it("renders created date when provided", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, createdAt: "2025-01-15T10:00:00Z" }}
      />
    );
    expect(getByText("Created")).toBeDefined();
  });

  it("renders exception status with correct class", () => {
    const { container } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "exception" }} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-exception")).toBe(true);
    expect(badge?.textContent).toBe("EXCEPTION");
  });

  it("renders delivered status with delivered class", () => {
    const { container } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "delivered" }} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-delivered")).toBe(true);
  });

  it("renders customs_clearance status with space", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, status: "customs_clearance" }}
      />
    );
    expect(getByText("CUSTOMS CLEARANCE")).toBeDefined();
  });

  it("renders out_for_delivery status with space", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, status: "out_for_delivery" }}
      />
    );
    expect(getByText("OUT FOR DELIVERY")).toBeDefined();
  });

  it("renders primary color on status badge", () => {
    const { container } = render(
      <ShipmentHeader shipment={baseShipment} primaryColor="#ff0000" />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.style.backgroundColor).toBe("rgb(255, 0, 0)");
  });

  it("renders route arrow SVG", () => {
    const { container } = render(<ShipmentHeader shipment={baseShipment} />);
    const svg = container.querySelector(".shipment-route-line svg");
    expect(svg).not.toBeNull();
  });

  it("renders status-active class for in_transit", () => {
    const { container } = render(<ShipmentHeader shipment={baseShipment} />);
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-active")).toBe(true);
  });

  it("renders status-active class for out_for_delivery", () => {
    const { container } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "out_for_delivery" }} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-active")).toBe(true);
  });

  it("renders status-active class for at_port", () => {
    const { container } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "at_port" }} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-active")).toBe(true);
  });

  it("renders status-default class for unknown status", () => {
    const { container } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "pending" }} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.classList.contains("status-default")).toBe(true);
  });

  it("does not render estimated delivery when null and no actual delivery", () => {
    const { queryByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, estimatedDelivery: null }}
      />
    );
    expect(queryByText("Est. Delivery")).toBeNull();
    expect(queryByText("Delivered")).toBeNull();
  });

  it("does not render service type when null", () => {
    const { queryByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, serviceType: null }} />
    );
    expect(queryByText("Service")).toBeNull();
  });

  it("does not render reference when null", () => {
    const { queryByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, reference: null }} />
    );
    expect(queryByText("Reference")).toBeNull();
  });

  it("does not render created date when null", () => {
    const { queryByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, createdAt: null }} />
    );
    expect(queryByText("Created")).toBeNull();
  });

  describe("date formatting error handling", () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("falls back to raw string when formatDate catches error", () => {
      const spy = vi.spyOn(Date.prototype, "toLocaleDateString").mockImplementation(() => {
        throw new Error("locale error");
      });
      const { getByText } = render(
        <ShipmentHeader
          shipment={{ ...baseShipment, estimatedDelivery: "bad-date-string" }}
        />
      );
      expect(getByText("bad-date-string")).toBeDefined();
      spy.mockRestore();
    });
  });

  it("applies default color when primaryColor is null", () => {
    const { container } = render(
      <ShipmentHeader shipment={baseShipment} primaryColor={null} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.style.backgroundColor).toBe("var(--color-primary)");
  });

  it("applies default color when primaryColor is omitted", () => {
    const { container } = render(
      <ShipmentHeader shipment={baseShipment} />
    );
    const badge = container.querySelector(".shipment-status-badge") as HTMLElement | null;
    expect(badge?.style.backgroundColor).toBe("var(--color-primary)");
  });
});
