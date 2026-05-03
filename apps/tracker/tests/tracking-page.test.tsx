import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/tracking-api", () => ({
  getShipmentByTrackingId: vi.fn(),
}));

import { getShipmentByTrackingId } from "@/lib/tracking-api";
import TrackingPage, { generateMetadata } from "@/app/track/[trackingId]/page";

const mockGetShipment = getShipmentByTrackingId as ReturnType<typeof vi.fn>;

const fullShipmentData = {
  trackingId: "SL-FULL-001",
  origin: "Shanghai, CN",
  destination: "Los Angeles, US",
  status: "in_transit",
  carrier: "Maersk",
  serviceType: "FCL",
  estimatedDelivery: "2025-06-01T00:00:00Z",
  actualDelivery: null,
  reference: "PO-12345",
  createdAt: "2025-01-10T08:00:00Z",
  milestones: [
    {
      type: "picked_up",
      description: "Package picked up at warehouse",
      location: "Shanghai",
      occurredAt: "2025-01-15T10:00:00Z",
    },
    {
      type: "in_transit",
      description: "Departed origin port",
      occurredAt: "2025-01-16T14:00:00Z",
    },
  ],
  branding: {
    tenantName: "Acme Forwarding",
    logoUrl: "https://example.com/logo.png",
    primaryColor: "#3B82F6",
    tagline: "Fast & Reliable",
    contactEmail: "support@acme.com",
    contactPhone: "+1-555-1234",
    supportUrl: "https://help.acme.com",
    customFooterText: "Acme Corp 2025",
  },
};

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("not-found state", () => {
    beforeEach(() => {
      mockGetShipment.mockResolvedValue(null);
    });

    it("renders Shipment Not Found title", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "NOTFOUND" }),
      });
      render(result);
      expect(screen.getByText("Shipment Not Found")).toBeDefined();
    });

    it("displays the tracking ID in not-found message", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-MISSING" }),
      });
      render(result);
      expect(screen.getByText("SL-MISSING")).toBeDefined();
    });

    it("renders hint text to check the tracking ID", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-X" }),
      });
      render(result);
      expect(
        screen.getByText("Please check the tracking ID and try again.")
      ).toBeDefined();
    });

    it("renders not-found icon", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-X" }),
      });
      const { container } = render(result);
      expect(
        container.querySelector(".tracking-not-found-icon")
      ).not.toBeNull();
    });

    it("renders not-found within BrandedShell", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-X" }),
      });
      render(result);
      expect(screen.getByText("Powered by")).toBeDefined();
    });
  });

  describe("found state with full data", () => {
    beforeEach(() => {
      mockGetShipment.mockResolvedValue(fullShipmentData);
    });

    it("renders origin and destination", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("Shanghai, CN")).toBeDefined();
      expect(screen.getByText("Los Angeles, US")).toBeDefined();
    });

    it("renders tracking ID", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("SL-FULL-001")).toBeDefined();
    });

    it("renders carrier information", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("Maersk")).toBeDefined();
    });

    it("renders status badge", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("IN TRANSIT")).toBeDefined();
    });

    it("renders milestone timeline section title", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("Shipment Timeline")).toBeDefined();
    });

    it("renders milestones", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("Package picked up at warehouse")).toBeDefined();
    });

    it("passes branding to BrandedShell", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      const { container } = render(result);
      const img = container.querySelector("img");
      expect(img?.getAttribute("src")).toBe("https://example.com/logo.png");
    });

    it("renders custom footer text from branding", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("Acme Corp 2025")).toBeDefined();
    });

    it("renders contact info from branding", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-FULL-001" }),
      });
      render(result);
      expect(screen.getByText("support@acme.com")).toBeDefined();
      expect(screen.getByText("+1-555-1234")).toBeDefined();
      expect(screen.getByText("Support")).toBeDefined();
    });
  });

  describe("found state without branding", () => {
    const noBrandingData = {
      trackingId: "SL-NOBRAND",
      origin: "Tokyo",
      destination: "New York",
      status: "delivered",
      milestones: [],
    };

    beforeEach(() => {
      mockGetShipment.mockResolvedValue(noBrandingData);
    });

    it("renders with default branding", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-NOBRAND" }),
      });
      const { container } = render(result);
      const brandName = container.querySelector(".tracking-brand-name");
      expect(brandName?.textContent).toBe("ShipLens");
    });

    it("renders status correctly", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-NOBRAND" }),
      });
      render(result);
      expect(screen.getByText("DELIVERED")).toBeDefined();
    });

    it("renders empty milestones message", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-NOBRAND" }),
      });
      render(result);
      expect(screen.getByText(/No milestone updates yet/)).toBeDefined();
    });
  });

  describe("found state with partial branding", () => {
    const partialBrandingData = {
      trackingId: "SL-PARTIAL",
      origin: "Hamburg",
      destination: "Singapore",
      status: "out_for_delivery",
      carrier: "COSCO",
      branding: {
        tenantName: "Partial Corp",
        primaryColor: "#10B981",
      },
    };

    beforeEach(() => {
      mockGetShipment.mockResolvedValue(partialBrandingData);
    });

    it("renders custom tenant name", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-PARTIAL" }),
      });
      render(result);
      expect(screen.getByText("Partial Corp")).toBeDefined();
    });

    it("renders status", async () => {
      const result = await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-PARTIAL" }),
      });
      render(result);
      expect(screen.getByText("OUT FOR DELIVERY")).toBeDefined();
    });
  });

  describe("generateMetadata", () => {
    it("returns title with tracking ID", async () => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ trackingId: "SL-META" }),
      });
      expect(metadata.title).toBe("Tracking SL-META — ShipLens");
    });

    it("returns description with tracking ID", async () => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ trackingId: "SL-META" }),
      });
      expect(metadata.description).toBe(
        "Track shipment SL-META in real-time"
      );
    });

    it("handles different tracking IDs", async () => {
      const metadata = await generateMetadata({
        params: Promise.resolve({ trackingId: "ABC-XYZ" }),
      });
      expect(metadata.title).toBe("Tracking ABC-XYZ — ShipLens");
      expect(metadata.description).toBe(
        "Track shipment ABC-XYZ in real-time"
      );
    });
  });
});
