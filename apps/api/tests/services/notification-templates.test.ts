import { describe, it, expect } from "vitest";
import {
  getTemplate,
  getAllTemplates,
  renderTemplate,
  renderSubject,
  renderBody,
  type TemplateContext,
} from "../../src/services/notification-templates";

const MILESTONE_TYPES = [
  "booked",
  "picked_up",
  "departed_origin",
  "in_transit",
  "arrived_port",
  "customs_cleared",
  "departed_terminal",
  "out_for_delivery",
  "delivered",
  "exception",
] as const;

const sampleContext: TemplateContext = {
  trackingId: "SL-ABC123",
  origin: "Shanghai",
  destination: "Los Angeles",
  carrier: "Maersk",
  customerName: "John Doe",
  location: "Shanghai Port",
  description: "Container loaded",
  timestamp: "2024-01-15T10:00:00Z",
  eta: "2024-02-01T10:00:00Z",
  trackingUrl: "https://track.shiplens.app/acme/SL-ABC123",
  companyName: "Acme Forwarding",
  primaryColor: "#FF0000",
};

describe("Notification Templates", () => {
  describe("getTemplate", () => {
    it("returns template for each milestone type", () => {
      for (const type of MILESTONE_TYPES) {
        const template = getTemplate(type);
        expect(template).toBeDefined();
        expect(template.milestoneType).toBe(type);
        expect(template.subject).toBeTruthy();
        expect(template.body).toBeTruthy();
      }
    });

    it("templates contain mustache placeholders", () => {
      const template = getTemplate("booked");
      expect(template.subject).toContain("{{trackingId}}");
      expect(template.body).toContain("{{trackingId}}");
    });
  });

  describe("getAllTemplates", () => {
    it("returns all 10 milestone templates", () => {
      const templates = getAllTemplates();
      expect(templates).toHaveLength(10);
    });

    it("each template has unique milestone type", () => {
      const templates = getAllTemplates();
      const types = templates.map((t) => t.milestoneType);
      expect(new Set(types).size).toBe(types.length);
    });
  });

  describe("renderTemplate", () => {
    it("replaces all known placeholders", () => {
      const result = renderTemplate(
        "{{trackingId}} - {{origin}} to {{destination}} via {{carrier}}",
        sampleContext
      );
      expect(result).toBe("SL-ABC123 - Shanghai to Los Angeles via Maersk");
    });

    it("leaves unknown placeholders unchanged", () => {
      const result = renderTemplate("Hello {{unknown}}", sampleContext);
      expect(result).toBe("Hello {{unknown}}");
    });

    it("handles undefined context values", () => {
      const result = renderTemplate("{{trackingId}} at {{location}}", {
        trackingId: "SL-1",
      });
      expect(result).toBe("SL-1 at {{location}}");
    });
  });

  describe("renderSubject", () => {
    it("renders booked subject", () => {
      const subject = renderSubject("booked", sampleContext);
      expect(subject).toBe("Shipment SL-ABC123 has been booked");
    });

    it("renders delivered subject", () => {
      const subject = renderSubject("delivered", sampleContext);
      expect(subject).toBe("Shipment SL-ABC123 has been delivered");
    });

    it("renders exception subject", () => {
      const subject = renderSubject("exception", sampleContext);
      expect(subject).toBe("Alert: Issue with shipment SL-ABC123");
    });

    it("renders out_for_delivery subject", () => {
      const subject = renderSubject("out_for_delivery", sampleContext);
      expect(subject).toBe("Shipment SL-ABC123 is out for delivery");
    });
  });

  describe("renderBody", () => {
    it("renders body with tracking ID", () => {
      const body = renderBody("booked", sampleContext);
      expect(body).toContain("SL-ABC123");
      expect(body).toContain("Shanghai");
      expect(body).toContain("Los Angeles");
      expect(body).toContain("Maersk");
    });

    it("includes tracking URL", () => {
      const body = renderBody("delivered", sampleContext);
      expect(body).toContain("https://track.shiplens.app/acme/SL-ABC123");
    });

    it("includes company name in footer", () => {
      const body = renderBody("booked", sampleContext);
      expect(body).toContain("Acme Forwarding");
    });

    it("replaces default primary color with tenant color", () => {
      const body = renderBody("booked", { ...sampleContext, primaryColor: "#FF0000" });
      expect(body).toContain("#FF0000");
      expect(body).not.toContain("#2563EB");
    });

    it("uses default color when no primaryColor provided", () => {
      const body = renderBody("booked", { trackingId: "SL-1" });
      expect(body).toContain("#2563EB");
    });

    it("renders exception body with description", () => {
      const body = renderBody("exception", sampleContext);
      expect(body).toContain("Container loaded");
      expect(body).toContain("#dc2626");
    });

    it("renders delivered body with green theme", () => {
      const body = renderBody("delivered", sampleContext);
      expect(body).toContain("#16a34a");
    });
  });
});
