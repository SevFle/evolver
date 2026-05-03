import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

import { notFound } from "next/navigation";

describe("TrackingPage - rendering paths", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.mocked(notFound).mockReset();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders not-found UI when shipment data is null", async () => {
    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(null),
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-ABC123" });
    const result = render(await TrackingPage({ params }));

    expect(result.getByText("Shipment Not Found")).toBeDefined();
    expect(
      result.getByText(/No shipment found for tracking ID:/)
    ).toBeDefined();
    expect(result.getByText("SL-ABC123")).toBeDefined();
    expect(
      result.getByText(/Please check the tracking ID and try again/)
    ).toBeDefined();
    expect(
      result.container.querySelector(".tracking-not-found-icon")
    ).not.toBeNull();
  });

  it("renders full shipment view when data is returned", async () => {
    const shipmentData = {
      trackingId: "SL-FULL1",
      origin: "Shanghai",
      destination: "LA",
      status: "in_transit",
      milestones: [
        {
          type: "picked_up",
          description: "Picked up",
          occurredAt: "2025-01-15T10:00:00Z",
        },
      ],
      branding: {
        tenantName: "Acme Corp",
        primaryColor: "#ff0000",
        logoUrl: "https://example.com/logo.png",
        supportUrl: "https://help.example.com",
      },
    };

    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(shipmentData),
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-FULL1" });
    const result = render(await TrackingPage({ params }));

    expect(result.getByAltText("Acme Corp")).toBeDefined();
    expect(result.getByText("Shanghai")).toBeDefined();
    expect(result.getByText("LA")).toBeDefined();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("renders shipment view without branding", async () => {
    const shipmentData = {
      trackingId: "SL-NOBRD",
      origin: "Tokyo",
      destination: "NYC",
      status: "delivered",
      milestones: [],
    };

    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(shipmentData),
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-NOBRD" });
    const result = render(await TrackingPage({ params }));

    expect(result.getByText("Tokyo")).toBeDefined();
    expect(result.getByText("NYC")).toBeDefined();
  });

  it("renders shipment view with partial branding", async () => {
    const shipmentData = {
      trackingId: "SL-PART1",
      origin: "Seoul",
      destination: "Berlin",
      status: "in_transit",
      milestones: [],
      branding: {
        tenantName: "PartialCo",
        contactEmail: "hello@partial.co",
      },
    };

    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(shipmentData),
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-PART1" });
    const result = render(await TrackingPage({ params }));

    expect(result.getByText("PartialCo")).toBeDefined();
    expect(result.getByText("Seoul")).toBeDefined();
    expect(result.getByText("Berlin")).toBeDefined();
    expect(result.getByText("hello@partial.co")).toBeDefined();
  });
});

describe("generateMetadata", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns correct metadata for a tracking ID", async () => {
    const { generateMetadata } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-ABC123" });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toBe("Tracking SL-ABC123 — ShipLens");
    expect(metadata.description).toBe("Track shipment SL-ABC123 in real-time");
  });

  it("returns metadata with the given tracking ID", async () => {
    const { generateMetadata } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "XY-987654321" });
    const metadata = await generateMetadata({ params });

    expect(metadata.title).toContain("XY-987654321");
    expect(metadata.description).toContain("XY-987654321");
  });
});
