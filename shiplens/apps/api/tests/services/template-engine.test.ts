import { describe, it, expect } from "vitest";
import {
  renderTemplate,
  renderNotificationTemplate,
  getDefaultTemplate,
  validateTemplate,
  type TemplateVariables,
} from "../../src/services/template-engine.js";

const baseVariables: TemplateVariables = {
  trackingId: "TRACK-001",
  customerName: "John Doe",
  status: "in_transit",
  milestoneType: "in_transit",
  location: "New York",
  description: "Package in transit",
  eventTimestamp: "2025-01-15T10:00:00Z",
  origin: "Los Angeles",
  destination: "New York",
  carrierName: "FedEx",
  estimatedDelivery: "2025-01-20",
  tenantName: "ShipCo",
};

describe("renderTemplate", () => {
  it("replaces all known variables", () => {
    const template = "Hello {{customerName}}, shipment {{trackingId}} is {{status}}";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("Hello John Doe, shipment TRACK-001 is in_transit");
  });

  it("replaces undefined variables with empty string", () => {
    const variables: TemplateVariables = {
      trackingId: "TRACK-001",
      status: "booked",
      milestoneType: "booked",
    };
    const template = "Hello {{customerName}}, tracking {{trackingId}}";
    const result = renderTemplate(template, variables);
    expect(result).toBe("Hello , tracking TRACK-001");
  });

  it("handles templates with no variables", () => {
    const template = "Static content only";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("Static content only");
  });

  it("handles empty template", () => {
    const result = renderTemplate("", baseVariables);
    expect(result).toBe("");
  });

  it("replaces multiple occurrences of same variable", () => {
    const template = "{{trackingId}} - {{trackingId}}";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("TRACK-001 - TRACK-001");
  });

  it("leaves unknown placeholders unchanged", () => {
    const template = "{{unknownVar}} and {{trackingId}}";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("{{unknownVar}} and TRACK-001");
  });

  it("replaces location variable", () => {
    const template = "Location: {{location}}";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("Location: New York");
  });

  it("replaces all 12 variables at once", () => {
    const template = "{{trackingId}} {{customerName}} {{status}} {{milestoneType}} {{location}} {{description}} {{eventTimestamp}} {{origin}} {{destination}} {{carrierName}} {{estimatedDelivery}} {{tenantName}}";
    const result = renderTemplate(template, baseVariables);
    expect(result).toBe("TRACK-001 John Doe in_transit in_transit New York Package in transit 2025-01-15T10:00:00Z Los Angeles New York FedEx 2025-01-20 ShipCo");
  });
});

describe("renderNotificationTemplate", () => {
  it("renders subject, html, and text", () => {
    const template = {
      subject: "Update for {{trackingId}}",
      bodyHtml: "<p>Hello {{customerName}}</p>",
      bodyText: "Hello {{customerName}}",
    };

    const result = renderNotificationTemplate(template, baseVariables);

    expect(result.subject).toBe("Update for TRACK-001");
    expect(result.bodyHtml).toBe("<p>Hello John Doe</p>");
    expect(result.bodyText).toBe("Hello John Doe");
  });

  it("returns empty subject when not provided", () => {
    const template = { bodyText: "Hello" };
    const result = renderNotificationTemplate(template, baseVariables);
    expect(result.subject).toBe("");
  });

  it("returns undefined bodyHtml when not provided", () => {
    const template = { subject: "Test", bodyText: "Hello" };
    const result = renderNotificationTemplate(template, baseVariables);
    expect(result.bodyHtml).toBeUndefined();
  });

  it("returns undefined bodyText when not provided", () => {
    const template = { subject: "Test", bodyHtml: "<p>Hello</p>" };
    const result = renderNotificationTemplate(template, baseVariables);
    expect(result.bodyText).toBeUndefined();
  });

  it("handles empty template gracefully", () => {
    const template = {};
    const result = renderNotificationTemplate(template, baseVariables);
    expect(result.subject).toBe("");
    expect(result.bodyHtml).toBeUndefined();
    expect(result.bodyText).toBeUndefined();
  });
});

describe("getDefaultTemplate", () => {
  it("returns email template with html and text for booked", () => {
    const template = getDefaultTemplate("booked", "email");
    expect(template.subject).toContain("booked");
    expect(template.subject).toContain("{{trackingId}}");
    expect(template.bodyHtml).toBeDefined();
    expect(template.bodyText).toBeDefined();
  });

  it("returns email template for in_transit with humanized label", () => {
    const template = getDefaultTemplate("in_transit", "email");
    expect(template.subject).toContain("in transit");
  });

  it("returns email template for out_for_delivery", () => {
    const template = getDefaultTemplate("out_for_delivery", "email");
    expect(template.subject).toContain("out for delivery");
  });

  it("returns email template for delivered", () => {
    const template = getDefaultTemplate("delivered", "email");
    expect(template.subject).toContain("delivered");
  });

  it("returns email template for exception", () => {
    const template = getDefaultTemplate("exception", "email");
    expect(template.subject).toContain("exception");
  });

  it("returns SMS template with bodyText only", () => {
    const template = getDefaultTemplate("booked", "sms");
    expect(template.bodyText).toBeDefined();
    expect(template.bodyText).toContain("{{trackingId}}");
    expect(template.bodyHtml).toBeUndefined();
    expect(template.subject).toBeUndefined();
  });

  it("SMS template includes status label", () => {
    const template = getDefaultTemplate("delivered", "sms");
    expect(template.bodyText).toContain("delivered");
  });

  it("includes customerName placeholder in email template html", () => {
    const template = getDefaultTemplate("booked", "email");
    expect(template.bodyHtml).toContain("{{customerName}}");
  });

  it("includes origin and destination in email template", () => {
    const template = getDefaultTemplate("in_transit", "email");
    expect(template.bodyHtml).toContain("{{origin}}");
    expect(template.bodyHtml).toContain("{{destination}}");
  });
});

describe("validateTemplate", () => {
  it("returns valid for template with variables", () => {
    const result = validateTemplate("Hello {{trackingId}}");
    expect(result.valid).toBe(true);
    expect(result.missingVariables).toContain("trackingId");
  });

  it("returns empty missing for static template", () => {
    const result = validateTemplate("Static content");
    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });

  it("detects multiple variables", () => {
    const result = validateTemplate("{{trackingId}} {{customerName}} {{status}}");
    expect(result.valid).toBe(true);
    expect(result.missingVariables).toContain("trackingId");
    expect(result.missingVariables).toContain("customerName");
    expect(result.missingVariables).toContain("status");
  });

  it("ignores unknown variables", () => {
    const result = validateTemplate("{{unknownVar}}");
    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });

  it("handles empty template", () => {
    const result = validateTemplate("");
    expect(result.valid).toBe(true);
    expect(result.missingVariables).toEqual([]);
  });
});
