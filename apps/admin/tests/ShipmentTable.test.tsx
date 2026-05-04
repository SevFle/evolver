import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ShipmentTable, type ShipmentRow } from "../src/components/ShipmentTable";
import type { ShipmentStatus } from "@shiplens/shared";

const mockShipments: ShipmentRow[] = [
  {
    id: "1",
    trackingId: "SL-ABC123",
    customerName: "Acme Corp",
    origin: "Shanghai",
    destination: "Los Angeles",
    carrier: "Maersk",
    status: "in_transit" as ShipmentStatus,
    estimatedDelivery: "2026-05-15T00:00:00Z",
  },
  {
    id: "2",
    trackingId: "SL-DEF456",
    customerName: "Globex Inc",
    origin: "Rotterdam",
    destination: "New York",
    carrier: "MSC",
    status: "delivered" as ShipmentStatus,
    estimatedDelivery: "2026-04-20T00:00:00Z",
  },
  {
    id: "3",
    trackingId: "SL-GHI789",
    customerName: null,
    origin: null,
    destination: null,
    carrier: null,
    status: "pending" as ShipmentStatus,
    estimatedDelivery: null,
  },
];

describe("ShipmentTable", () => {
  it("renders table headers", () => {
    render(<ShipmentTable shipments={mockShipments} loading={false} />);
    expect(screen.getByText("Tracking ID")).toBeTruthy();
    expect(screen.getByText("Customer")).toBeTruthy();
    expect(screen.getByText("Origin")).toBeTruthy();
    expect(screen.getByText("Destination")).toBeTruthy();
    expect(screen.getByText("Carrier")).toBeTruthy();
    expect(screen.getByText("Status")).toBeTruthy();
    expect(screen.getByText("ETA")).toBeTruthy();
  });

  it("renders shipment rows with data", () => {
    render(<ShipmentTable shipments={mockShipments} loading={false} />);
    expect(screen.getByText("SL-ABC123")).toBeTruthy();
    expect(screen.getByText("Acme Corp")).toBeTruthy();
    expect(screen.getByText("Shanghai")).toBeTruthy();
    expect(screen.getByText("Los Angeles")).toBeTruthy();
    expect(screen.getByText("Maersk")).toBeTruthy();
    expect(screen.getByText("In Transit")).toBeTruthy();
  });

  it("renders dash for null fields", () => {
    render(<ShipmentTable shipments={mockShipments} loading={false} />);
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThanOrEqual(4);
  });

  it("shows loading state", () => {
    render(<ShipmentTable shipments={[]} loading={true} />);
    expect(screen.getByText("Loading shipments...")).toBeTruthy();
  });

  it("shows empty state when no shipments", () => {
    render(<ShipmentTable shipments={[]} loading={false} />);
    expect(screen.getByText("No shipments found.")).toBeTruthy();
  });

  it("renders tracking IDs as links", () => {
    render(<ShipmentTable shipments={mockShipments} loading={false} />);
    const link = screen.getByText("SL-ABC123").closest("a");
    expect(link?.getAttribute("href")).toBe("/shipments/SL-ABC123");
  });

  it("formats ETA dates", () => {
    render(<ShipmentTable shipments={mockShipments} loading={false} />);
    expect(screen.getByText(/May 15, 2026/)).toBeTruthy();
    expect(screen.getByText(/Apr 20, 2026/)).toBeTruthy();
  });
});
