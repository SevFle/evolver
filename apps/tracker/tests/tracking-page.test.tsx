import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/tracking-api", () => ({
  getShipmentByTrackingId: vi.fn(),
}));

import { getShipmentByTrackingId } from "@/lib/tracking-api";
import TrackingPage, { generateMetadata } from "@/app/track/[trackingId]/page";

const mockShipmentData = {
  trackingId: "SL-1234",
  origin: "Shanghai",
  destination: "Los Angeles",
  status: "in_transit",
  carrier: "Maersk",
  milestones: [
    {
      type: "picked_up",
      description: "Picked up",
      location: "Shanghai",
      occurredAt: "2025-01-15T10:00:00Z",
    },
  ],
  branding: {
    tenantName: "Acme Corp",
    primaryColor: "#3B82F6",
  },
};

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders not found message when shipment is null", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-4040" }),
      })
    );

    expect(screen.getByText("Shipment Not Found")).toBeDefined();
    expect(screen.getByText(/SL-4040/)).toBeDefined();
    expect(
      screen.getByText("Please check the tracking ID and try again.")
    ).toBeDefined();
  });

  it("renders shipment data when found", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockShipmentData
    );

    render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(screen.getByText("Acme Corp")).toBeDefined();
  });

  it("renders milestones when data has milestones", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockShipmentData
    );

    render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(screen.getAllByText("Picked up").length).toBeGreaterThanOrEqual(1);
  });

  it("passes primaryColor to ShipmentHeader", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      mockShipmentData
    );

    const { container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(container.querySelector(".tracking-header")).not.toBeNull();
    expect(
      container.querySelector('[style*="rgb(59, 130, 246)"]')
    ).not.toBeNull();
  });

  it("handles data without branding", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue({
      ...mockShipmentData,
      branding: null,
    });

    render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(screen.getByText("Powered by")).toBeDefined();
  });

  it("renders not found icon", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const { container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-4040" }),
      })
    );

    expect(
      container.querySelector(".tracking-not-found-icon")
    ).not.toBeNull();
  });

  it("renders not found within BrandedShell", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-4040" }),
      })
    );

    expect(screen.getByText("Powered by")).toBeDefined();
  });

  it("generates correct metadata", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ trackingId: "SL-1234" }),
    });

    expect(metadata).toEqual({
      title: "Tracking SL-1234 — ShipLens",
      description: "Track shipment SL-1234 in real-time",
    });
  });

  it("generates metadata for different tracking IDs", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ trackingId: "AB-9999" }),
    });

    expect(metadata.title).toBe("Tracking AB-9999 — ShipLens");
  });
});
