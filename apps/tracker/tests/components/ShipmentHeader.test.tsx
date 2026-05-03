import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { ShipmentHeader } from "../../src/components/ShipmentHeader";

const baseShipment = {
  trackingId: "SL-ABC123",
  origin: "Shanghai",
  destination: "Los Angeles",
  status: "in_transit",
};

describe("ShipmentHeader", () => {
  it("renders origin and destination", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText(/Shanghai/)).toBeDefined();
    expect(getByText(/Los Angeles/)).toBeDefined();
  });

  it("renders tracking ID", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText(/SL-ABC123/)).toBeDefined();
  });

  it("renders status with underscores replaced by spaces", () => {
    const { getByText } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(getByText(/in transit/i)).toBeDefined();
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
    expect(getByText(/Maersk/)).toBeDefined();
  });

  it("does not render carrier when omitted", () => {
    const { container } = render(<ShipmentHeader shipment={baseShipment} />);
    expect(container.textContent).not.toContain("Carrier:");
  });

  it("renders estimated delivery when provided", () => {
    const { getByText } = render(
      <ShipmentHeader
        shipment={{ ...baseShipment, estimatedDelivery: "2025-06-01" }}
      />
    );
    expect(getByText(/2025-06-01/)).toBeDefined();
  });

  it("renders exception status", () => {
    const { getByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "exception" }} />
    );
    expect(getByText("EXCEPTION")).toBeDefined();
  });

  it("renders customs_clearance status with space", () => {
    const { getByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "customs_clearance" }} />
    );
    expect(getByText("CUSTOMS CLEARANCE")).toBeDefined();
  });

  it("renders out_for_delivery status with space", () => {
    const { getByText } = render(
      <ShipmentHeader shipment={{ ...baseShipment, status: "out_for_delivery" }} />
    );
    expect(getByText("OUT FOR DELIVERY")).toBeDefined();
  });
});
