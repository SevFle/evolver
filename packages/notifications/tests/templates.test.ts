import { describe, it, expect } from "vitest";
import {
  pickedUpTemplate,
  inTransitTemplate,
  deliveredTemplate,
  exceptionTemplate,
  getTemplate,
  TEMPLATE_NAMES,
} from "../src/templates";
import type { ShipmentEmailData } from "../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SL-ABC123-XYZ789",
  origin: "Shanghai, China",
  destination: "Los Angeles, CA",
  carrier: "Maersk",
  customerName: "John Doe",
  estimatedDelivery: "2025-06-15",
  location: "Port of Shanghai",
  description: "Test description",
  occurredAt: "2025-05-01T10:00:00Z",
};

describe("Templates", () => {
  describe("TEMPLATE_NAMES", () => {
    it("contains all four milestone template names", () => {
      expect(TEMPLATE_NAMES).toEqual(["picked_up", "in_transit", "delivered", "exception"]);
    });
  });

  describe("getTemplate", () => {
    it("returns the correct template function for each name", () => {
      for (const name of TEMPLATE_NAMES) {
        const fn = getTemplate(name);
        expect(fn).toBeInstanceOf(Function);
        const result = fn(baseData);
        expect(result).toHaveProperty("html");
        expect(result).toHaveProperty("text");
        expect(result).toHaveProperty("subject");
      }
    });

    it("throws for an unknown template name", () => {
      expect(() => getTemplate("unknown" as never)).toThrow("Unknown template: unknown");
    });
  });

  describe("pickedUpTemplate", () => {
    it("generates subject with tracking ID", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.subject).toContain("SL-ABC123-XYZ789");
      expect(result.subject).toContain("picked up");
    });

    it("includes customer name in greeting", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("Hi John Doe");
      expect(result.text).toContain("Hi John Doe");
    });

    it("includes origin and destination", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("Shanghai, China");
      expect(result.html).toContain("Los Angeles, CA");
      expect(result.text).toContain("Shanghai, China");
      expect(result.text).toContain("Los Angeles, CA");
    });

    it("includes location when provided", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("Port of Shanghai");
      expect(result.text).toContain("Port of Shanghai");
    });

    it("includes carrier when provided", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("Maersk");
      expect(result.text).toContain("Maersk");
    });

    it("includes estimated delivery when provided", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("2025-06-15");
      expect(result.text).toContain("2025-06-15");
    });

    it("works without optional fields", () => {
      const minimal: ShipmentEmailData = {
        trackingId: "SL-MIN",
        origin: "A",
        destination: "B",
      };
      const result = pickedUpTemplate(minimal);
      expect(result.subject).toContain("SL-MIN");
      expect(result.html).toContain("Hello,");
      expect(result.text).toContain("Hello,");
      expect(result.html).not.toContain("Est. Delivery");
    });

    it("produces valid HTML structure", () => {
      const result = pickedUpTemplate(baseData);
      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("</html>");
      expect(result.html).toContain("<body");
      expect(result.html).toContain("</body>");
    });
  });

  describe("inTransitTemplate", () => {
    it("generates subject with tracking ID", () => {
      const result = inTransitTemplate(baseData);
      expect(result.subject).toContain("SL-ABC123-XYZ789");
      expect(result.subject).toContain("in transit");
    });

    it("includes customer name in greeting", () => {
      const result = inTransitTemplate(baseData);
      expect(result.html).toContain("Hi John Doe");
    });

    it("includes location when provided", () => {
      const result = inTransitTemplate(baseData);
      expect(result.html).toContain("Port of Shanghai");
    });

    it("works without optional fields", () => {
      const minimal: ShipmentEmailData = {
        trackingId: "SL-MIN",
        origin: "A",
        destination: "B",
      };
      const result = inTransitTemplate(minimal);
      expect(result.subject).toContain("SL-MIN");
      expect(result.html).toContain("Hello,");
      expect(result.text).toContain("Hello,");
    });

    it("uses cyan/teal color scheme in HTML", () => {
      const result = inTransitTemplate(baseData);
      expect(result.html).toContain("#0891B2");
    });
  });

  describe("deliveredTemplate", () => {
    it("generates subject with tracking ID", () => {
      const result = deliveredTemplate(baseData);
      expect(result.subject).toContain("SL-ABC123-XYZ789");
      expect(result.subject).toContain("delivered");
    });

    it("includes arrival confirmation message", () => {
      const result = deliveredTemplate(baseData);
      expect(result.html).toContain("arrived at its destination");
      expect(result.text).toContain("arrived at its destination");
    });

    it("includes customer name in greeting", () => {
      const result = deliveredTemplate(baseData);
      expect(result.html).toContain("Hi John Doe");
    });

    it("works without optional fields", () => {
      const minimal: ShipmentEmailData = {
        trackingId: "SL-MIN",
        origin: "A",
        destination: "B",
      };
      const result = deliveredTemplate(minimal);
      expect(result.subject).toContain("SL-MIN");
      expect(result.html).toContain("Hello,");
    });

    it("uses green color scheme in HTML", () => {
      const result = deliveredTemplate(baseData);
      expect(result.html).toContain("#16A34A");
    });
  });

  describe("exceptionTemplate", () => {
    it("generates subject with tracking ID", () => {
      const result = exceptionTemplate(baseData);
      expect(result.subject).toContain("SL-ABC123-XYZ789");
      expect(result.subject).toContain("Attention");
    });

    it("includes description when provided", () => {
      const result = exceptionTemplate(baseData);
      expect(result.html).toContain("Test description");
      expect(result.text).toContain("Test description");
    });

    it("includes location when provided", () => {
      const result = exceptionTemplate(baseData);
      expect(result.html).toContain("Port of Shanghai");
      expect(result.text).toContain("Port of Shanghai");
    });

    it("includes action required warning", () => {
      const result = exceptionTemplate(baseData);
      expect(result.html).toContain("Action may be required");
      expect(result.text).toContain("ACTION MAY BE REQUIRED");
    });

    it("works without optional fields", () => {
      const minimal: ShipmentEmailData = {
        trackingId: "SL-MIN",
        origin: "A",
        destination: "B",
      };
      const result = exceptionTemplate(minimal);
      expect(result.subject).toContain("SL-MIN");
      expect(result.html).toContain("Hello,");
    });

    it("uses red color scheme in HTML", () => {
      const result = exceptionTemplate(baseData);
      expect(result.html).toContain("#DC2626");
    });

    it("does not include description line when description is omitted", () => {
      const noDesc: ShipmentEmailData = {
        trackingId: "SL-NODESC",
        origin: "A",
        destination: "B",
      };
      const result = exceptionTemplate(noDesc);
      expect(result.html).not.toContain("Issue:");
      expect(result.text).not.toContain("Issue:");
    });
  });

  describe("all templates", () => {
    it.each(TEMPLATE_NAMES)("template '%s' produces non-empty html and text", (name) => {
      const fn = getTemplate(name);
      const result = fn(baseData);
      expect(result.html.length).toBeGreaterThan(0);
      expect(result.text.length).toBeGreaterThan(0);
      expect(result.subject.length).toBeGreaterThan(0);
    });

    it.each(TEMPLATE_NAMES)("template '%s' includes tracking ID in both html and text", (name) => {
      const fn = getTemplate(name);
      const result = fn(baseData);
      expect(result.html).toContain("SL-ABC123-XYZ789");
      expect(result.text).toContain("SL-ABC123-XYZ789");
    });

    it.each(TEMPLATE_NAMES)("template '%s' includes origin and destination", (name) => {
      const fn = getTemplate(name);
      const result = fn(baseData);
      expect(result.html).toContain("Shanghai, China");
      expect(result.html).toContain("Los Angeles, CA");
    });

    it.each(TEMPLATE_NAMES)("template '%s' falls back to 'Hello,' without customer name", (name) => {
      const fn = getTemplate(name);
      const data = { ...baseData, customerName: undefined };
      const result = fn(data);
      expect(result.html).toContain("Hello,");
      expect(result.text).toContain("Hello,");
    });
  });
});
