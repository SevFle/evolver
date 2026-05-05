import { describe, it, expect } from "vitest";
import {
  getTemplate,
  TEMPLATE_NAMES,
  pickedUpTemplate,
  inTransitTemplate,
  deliveredTemplate,
  exceptionTemplate,
} from "../../src/templates/index";
import type { ShipmentEmailData } from "../../src/templates/types";

const baseData: ShipmentEmailData = {
  trackingId: "SHP-TEST",
  origin: "A",
  destination: "B",
};

describe("getTemplate", () => {
  it("returns picked_up template for 'picked_up'", () => {
    const fn = getTemplate("picked_up");
    expect(fn).toBe(pickedUpTemplate);
  });

  it("returns in_transit template for 'in_transit'", () => {
    const fn = getTemplate("in_transit");
    expect(fn).toBe(inTransitTemplate);
  });

  it("returns delivered template for 'delivered'", () => {
    const fn = getTemplate("delivered");
    expect(fn).toBe(deliveredTemplate);
  });

  it("returns exception template for 'exception'", () => {
    const fn = getTemplate("exception");
    expect(fn).toBe(exceptionTemplate);
  });

  it("throws for unknown template name", () => {
    expect(() => getTemplate("unknown" as any)).toThrow("Unknown template: unknown");
  });

  it("throws for empty string", () => {
    expect(() => getTemplate("" as any)).toThrow("Unknown template: ");
  });
});

describe("TEMPLATE_NAMES", () => {
  it("contains exactly 4 template names", () => {
    expect(TEMPLATE_NAMES).toHaveLength(4);
  });

  it("contains picked_up", () => {
    expect(TEMPLATE_NAMES).toContain("picked_up");
  });

  it("contains in_transit", () => {
    expect(TEMPLATE_NAMES).toContain("in_transit");
  });

  it("contains delivered", () => {
    expect(TEMPLATE_NAMES).toContain("delivered");
  });

  it("contains exception", () => {
    expect(TEMPLATE_NAMES).toContain("exception");
  });
});

describe("template function outputs", () => {
  it.each([
    ["picked_up", "Your shipment SHP-TEST has been picked up"],
    ["in_transit", "Shipment SHP-TEST is in transit"],
    ["delivered", "Shipment SHP-TEST has been delivered!"],
    ["exception", "Attention: Issue with shipment SHP-TEST"],
  ] as const)("template %s has correct subject", (name, expectedSubject) => {
    const fn = getTemplate(name);
    const result = fn(baseData);
    expect(result.subject).toBe(expectedSubject);
  });

  it.each([
    ["picked_up"],
    ["in_transit"],
    ["delivered"],
    ["exception"],
  ] as const)("template %s produces valid EmailTemplate shape", (name) => {
    const fn = getTemplate(name);
    const result = fn(baseData);
    expect(result).toHaveProperty("html");
    expect(result).toHaveProperty("text");
    expect(result).toHaveProperty("subject");
    expect(typeof result.html).toBe("string");
    expect(typeof result.text).toBe("string");
    expect(typeof result.subject).toBe("string");
    expect(result.html.length).toBeGreaterThan(0);
    expect(result.text.length).toBeGreaterThan(0);
    expect(result.subject.length).toBeGreaterThan(0);
  });

  it.each([
    ["picked_up"],
    ["in_transit"],
    ["delivered"],
    ["exception"],
  ] as const)("template %s includes tracking ID in html and text", (name) => {
    const fn = getTemplate(name);
    const result = fn(baseData);
    expect(result.html).toContain("SHP-TEST");
    expect(result.text).toContain("SHP-TEST");
  });

  it.each([
    ["picked_up"],
    ["in_transit"],
    ["delivered"],
    ["exception"],
  ] as const)("template %s includes origin and destination", (name) => {
    const fn = getTemplate(name);
    const result = fn(baseData);
    expect(result.html).toContain("A");
    expect(result.html).toContain("B");
    expect(result.text).toContain("A");
    expect(result.text).toContain("B");
  });
});
