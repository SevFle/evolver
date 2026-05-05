import { describe, it, expect } from "vitest";
import { pickedUpTemplate } from "../../src/templates/picked-up";
import type { ShipmentEmailData } from "../../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SHP-001",
  origin: "Shanghai, CN",
  destination: "Los Angeles, US",
};

describe("pickedUpTemplate", () => {
  it("renders subject with tracking ID", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.subject).toBe("Your shipment SHP-001 has been picked up");
  });

  it("renders html with required fields", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).toContain("Package Picked Up");
    expect(result.html).toContain("SHP-001");
    expect(result.html).toContain("Shanghai, CN");
    expect(result.html).toContain("Los Angeles, US");
    expect(result.html).toContain("#2563EB");
  });

  it("renders text with required fields", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.text).toContain("Your shipment SHP-001 has been picked up");
    expect(result.text).toContain("From: Shanghai, CN");
    expect(result.text).toContain("To: Los Angeles, US");
  });

  it("renders generic greeting when no customerName", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).toContain("Hello,");
    expect(result.text).toContain("Hello,");
  });

  it("renders customer greeting when customerName provided", () => {
    const data: ShipmentEmailData = { ...baseData, customerName: "Alice" };
    const result = pickedUpTemplate(data);
    expect(result.html).toContain("Hi Alice,");
    expect(result.text).toContain("Hi Alice,");
  });

  it("includes location when provided", () => {
    const data: ShipmentEmailData = { ...baseData, location: "Warehouse A" };
    const result = pickedUpTemplate(data);
    expect(result.html).toContain(" from Warehouse A");
    expect(result.text).toContain(" from Warehouse A");
  });

  it("omits location when not provided", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).not.toContain(" from ");
    expect(result.text).not.toContain(" from ");
  });

  it("includes carrier when provided", () => {
    const data: ShipmentEmailData = { ...baseData, carrier: "Maersk" };
    const result = pickedUpTemplate(data);
    expect(result.html).toContain(" via Maersk");
    expect(result.text).toContain(" via Maersk");
  });

  it("includes estimated delivery when provided", () => {
    const data: ShipmentEmailData = { ...baseData, estimatedDelivery: "2025-06-15" };
    const result = pickedUpTemplate(data);
    expect(result.html).toContain("Est. Delivery");
    expect(result.html).toContain("2025-06-15");
    expect(result.text).toContain("Est. Delivery: 2025-06-15");
  });

  it("omits estimated delivery when not provided", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).not.toContain("Est. Delivery");
    expect(result.text).not.toContain("Est. Delivery:");
  });

  it("includes all optional fields together", () => {
    const data: ShipmentEmailData = {
      ...baseData,
      customerName: "Bob",
      location: "Dock B",
      carrier: "COSCO",
      estimatedDelivery: "2025-07-01",
    };
    const result = pickedUpTemplate(data);
    expect(result.html).toContain("Hi Bob,");
    expect(result.html).toContain(" from Dock B");
    expect(result.html).toContain(" via COSCO");
    expect(result.html).toContain("Est. Delivery");
    expect(result.text).toContain("Hi Bob,");
    expect(result.text).toContain("from Dock B");
    expect(result.text).toContain("via COSCO");
    expect(result.text).toContain("Est. Delivery: 2025-07-01");
  });

  it("includes ShipLens footer", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).toContain("ShipLens Tracking Notification");
    expect(result.text).toContain("ShipLens Tracking Notification");
  });

  it("includes Track Your Shipment link in html", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).toContain("Track Your Shipment");
  });

  it("produces well-formed html structure", () => {
    const result = pickedUpTemplate(baseData);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain("<html>");
    expect(result.html).toContain("</html>");
    expect(result.html).toContain("<body");
    expect(result.html).toContain("</body>");
  });
});
