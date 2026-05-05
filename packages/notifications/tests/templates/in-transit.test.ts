import { describe, it, expect } from "vitest";
import { inTransitTemplate } from "../../src/templates/in-transit";
import type { ShipmentEmailData } from "../../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SHP-002",
  origin: "Tokyo, JP",
  destination: "New York, US",
};

describe("inTransitTemplate", () => {
  it("renders subject with tracking ID", () => {
    const result = inTransitTemplate(baseData);
    expect(result.subject).toBe("Shipment SHP-002 is in transit");
  });

  it("renders html with required fields", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).toContain("Shipment In Transit");
    expect(result.html).toContain("SHP-002");
    expect(result.html).toContain("Tokyo, JP");
    expect(result.html).toContain("New York, US");
    expect(result.html).toContain("#0891B2");
  });

  it("renders text with required fields", () => {
    const result = inTransitTemplate(baseData);
    expect(result.text).toContain("Your shipment SHP-002 is currently in transit");
    expect(result.text).toContain("From: Tokyo, JP");
    expect(result.text).toContain("To: New York, US");
  });

  it("renders generic greeting when no customerName", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).toContain("Hello,");
    expect(result.text).toContain("Hello,");
  });

  it("renders customer greeting when customerName provided", () => {
    const data: ShipmentEmailData = { ...baseData, customerName: "Carol" };
    const result = inTransitTemplate(data);
    expect(result.html).toContain("Hi Carol,");
    expect(result.text).toContain("Hi Carol,");
  });

  it("includes location when provided", () => {
    const data: ShipmentEmailData = { ...baseData, location: "Pacific Ocean" };
    const result = inTransitTemplate(data);
    expect(result.html).toContain("Current location: Pacific Ocean");
    expect(result.text).toContain("Current location: Pacific Ocean");
  });

  it("omits location when not provided", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).not.toContain("Current location:");
    expect(result.text).not.toContain("Current location:");
  });

  it("includes carrier when provided", () => {
    const data: ShipmentEmailData = { ...baseData, carrier: "Evergreen" };
    const result = inTransitTemplate(data);
    expect(result.html).toContain(" via Evergreen");
    expect(result.text).toContain("via Evergreen");
  });

  it("includes estimated delivery when provided", () => {
    const data: ShipmentEmailData = { ...baseData, estimatedDelivery: "2025-08-01" };
    const result = inTransitTemplate(data);
    expect(result.html).toContain("Est. Delivery");
    expect(result.html).toContain("2025-08-01");
    expect(result.text).toContain("Est. Delivery: 2025-08-01");
  });

  it("omits estimated delivery when not provided", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).not.toContain("Est. Delivery");
    expect(result.text).not.toContain("Est. Delivery:");
  });

  it("includes all optional fields together", () => {
    const data: ShipmentEmailData = {
      ...baseData,
      customerName: "Dave",
      location: "Port of Long Beach",
      carrier: "MSC",
      estimatedDelivery: "2025-09-15",
    };
    const result = inTransitTemplate(data);
    expect(result.html).toContain("Hi Dave,");
    expect(result.html).toContain("Current location: Port of Long Beach");
    expect(result.html).toContain(" via MSC");
    expect(result.html).toContain("Est. Delivery");
    expect(result.text).toContain("Hi Dave,");
    expect(result.text).toContain("Current location: Port of Long Beach");
    expect(result.text).toContain("via MSC");
    expect(result.text).toContain("Est. Delivery: 2025-09-15");
  });

  it("includes ShipLens footer", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).toContain("ShipLens Tracking Notification");
    expect(result.text).toContain("ShipLens Tracking Notification");
  });

  it("produces well-formed html structure", () => {
    const result = inTransitTemplate(baseData);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<html>");
    expect(result.html).toContain("</html>");
  });
});
