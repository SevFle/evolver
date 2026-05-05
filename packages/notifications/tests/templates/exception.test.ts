import { describe, it, expect } from "vitest";
import { exceptionTemplate } from "../../src/templates/exception";
import type { ShipmentEmailData } from "../../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SHP-004",
  origin: "Busan, KR",
  destination: "Rotterdam, NL",
};

describe("exceptionTemplate", () => {
  it("renders subject with tracking ID", () => {
    const result = exceptionTemplate(baseData);
    expect(result.subject).toBe("Attention: Issue with shipment SHP-004");
  });

  it("renders html with required fields", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).toContain("Delivery Exception");
    expect(result.html).toContain("SHP-004");
    expect(result.html).toContain("Busan, KR");
    expect(result.html).toContain("Rotterdam, NL");
    expect(result.html).toContain("#DC2626");
  });

  it("renders text with required fields", () => {
    const result = exceptionTemplate(baseData);
    expect(result.text).toContain("We've detected an issue with your shipment SHP-004");
    expect(result.text).toContain("From: Busan, KR");
    expect(result.text).toContain("To: Rotterdam, NL");
  });

  it("renders generic greeting when no customerName", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).toContain("Hello,");
    expect(result.text).toContain("Hello,");
  });

  it("renders customer greeting when customerName provided", () => {
    const data: ShipmentEmailData = { ...baseData, customerName: "Grace" };
    const result = exceptionTemplate(data);
    expect(result.html).toContain("Hi Grace,");
    expect(result.text).toContain("Hi Grace,");
  });

  it("includes description when provided", () => {
    const data: ShipmentEmailData = { ...baseData, description: "Customs hold" };
    const result = exceptionTemplate(data);
    expect(result.html).toContain(" Issue: Customs hold");
    expect(result.text).toContain("Issue: Customs hold");
  });

  it("omits description when not provided", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).not.toContain("Issue:");
    expect(result.text).not.toContain("Issue:");
  });

  it("includes location when provided", () => {
    const data: ShipmentEmailData = { ...baseData, location: "Port of Busan" };
    const result = exceptionTemplate(data);
    expect(result.html).toContain(" at Port of Busan");
    expect(result.text).toContain("at Port of Busan");
  });

  it("omits location when not provided", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).not.toContain(" at ");
    expect(result.text).not.toContain(" at ");
  });

  it("includes action required warning in html", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).toContain("Action may be required");
    expect(result.html).toContain("#FEF2F2");
    expect(result.html).toContain("#991B1B");
  });

  it("includes action required warning in text", () => {
    const result = exceptionTemplate(baseData);
    expect(result.text).toContain("ACTION MAY BE REQUIRED");
  });

  it("includes View Shipment Details link in html", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).toContain("View Shipment Details");
  });

  it("includes ShipLens footer", () => {
    const result = exceptionTemplate(baseData);
    expect(result.html).toContain("ShipLens Tracking Notification");
    expect(result.text).toContain("ShipLens Tracking Notification");
  });

  it("renders all optional fields together", () => {
    const data: ShipmentEmailData = {
      ...baseData,
      customerName: "Heidi",
      description: "Weather delay",
      location: "Suez Canal",
    };
    const result = exceptionTemplate(data);
    expect(result.html).toContain("Hi Heidi,");
    expect(result.html).toContain("Issue: Weather delay");
    expect(result.html).toContain(" at Suez Canal");
    expect(result.text).toContain("Hi Heidi,");
    expect(result.text).toContain("Issue: Weather delay");
    expect(result.text).toContain("at Suez Canal");
  });
});
