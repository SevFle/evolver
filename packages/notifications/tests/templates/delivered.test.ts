import { describe, it, expect } from "vitest";
import { deliveredTemplate } from "../../src/templates/delivered";
import type { ShipmentEmailData } from "../../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SHP-003",
  origin: "Hamburg, DE",
  destination: "Chicago, US",
};

describe("deliveredTemplate", () => {
  it("renders subject with tracking ID", () => {
    const result = deliveredTemplate(baseData);
    expect(result.subject).toBe("Shipment SHP-003 has been delivered!");
  });

  it("renders html with required fields", () => {
    const result = deliveredTemplate(baseData);
    expect(result.html).toContain("Delivered!");
    expect(result.html).toContain("SHP-003");
    expect(result.html).toContain("Hamburg, DE");
    expect(result.html).toContain("Chicago, US");
    expect(result.html).toContain("#16A34A");
  });

  it("renders text with required fields", () => {
    const result = deliveredTemplate(baseData);
    expect(result.text).toContain("Great news! Your shipment SHP-003 has been delivered");
    expect(result.text).toContain("From: Hamburg, DE");
    expect(result.text).toContain("To: Chicago, US");
  });

  it("renders generic greeting when no customerName", () => {
    const result = deliveredTemplate(baseData);
    expect(result.html).toContain("Hello,");
    expect(result.text).toContain("Hello,");
  });

  it("renders customer greeting when customerName provided", () => {
    const data: ShipmentEmailData = { ...baseData, customerName: "Eve" };
    const result = deliveredTemplate(data);
    expect(result.html).toContain("Hi Eve,");
    expect(result.text).toContain("Hi Eve,");
  });

  it("includes carrier when provided", () => {
    const data: ShipmentEmailData = { ...baseData, carrier: "DHL" };
    const result = deliveredTemplate(data);
    expect(result.html).toContain(" via DHL");
    expect(result.text).toContain("via DHL");
  });

  it("includes delivery date when estimatedDelivery provided", () => {
    const data: ShipmentEmailData = { ...baseData, estimatedDelivery: "2025-05-01" };
    const result = deliveredTemplate(data);
    expect(result.html).toContain("Delivered");
    expect(result.html).toContain("2025-05-01");
    expect(result.text).toContain("Delivered: 2025-05-01");
  });

  it("includes arrival message", () => {
    const result = deliveredTemplate(baseData);
    expect(result.html).toContain("Your package has arrived at its destination");
    expect(result.text).toContain("Your package has arrived at its destination");
  });

  it("does not include Track Your Shipment link (delivered)", () => {
    const result = deliveredTemplate(baseData);
    expect(result.html).not.toContain("Track Your Shipment");
  });

  it("includes ShipLens footer", () => {
    const result = deliveredTemplate(baseData);
    expect(result.html).toContain("ShipLens Tracking Notification");
    expect(result.text).toContain("ShipLens Tracking Notification");
  });

  it("renders all optional fields together", () => {
    const data: ShipmentEmailData = {
      ...baseData,
      customerName: "Frank",
      carrier: "FedEx",
      estimatedDelivery: "2025-06-20",
    };
    const result = deliveredTemplate(data);
    expect(result.html).toContain("Hi Frank,");
    expect(result.html).toContain(" via FedEx");
    expect(result.html).toContain("2025-06-20");
    expect(result.text).toContain("Hi Frank,");
    expect(result.text).toContain("via FedEx");
    expect(result.text).toContain("Delivered: 2025-06-20");
  });
});
