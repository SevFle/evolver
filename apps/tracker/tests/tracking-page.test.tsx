import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

vi.mock("@/lib/tracking-api", () => ({
  getShipmentByTrackingId: vi.fn(),
  __esModule: true,
}));

import { notFound } from "next/navigation";
import { getShipmentByTrackingId } from "@/lib/tracking-api";

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function getPage() {
    const mod = await import(
      "../src/app/track/[trackingId]/page"
    );
    return mod.default;
  }

  it("calls notFound for invalid tracking ID", async () => {
    const TrackingPage = await getPage();

    await expect(
      TrackingPage({ params: Promise.resolve({ trackingId: "invalid" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound for empty tracking ID", async () => {
    const TrackingPage = await getPage();

    await expect(
      TrackingPage({ params: Promise.resolve({ trackingId: "" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID without hyphen", async () => {
    const TrackingPage = await getPage();

    await expect(
      TrackingPage({ params: Promise.resolve({ trackingId: "SL1234" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID with special characters", async () => {
    const TrackingPage = await getPage();

    await expect(
      TrackingPage({
        params: Promise.resolve({ trackingId: "SL-<script>" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("renders not found UI when shipment data is null", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const TrackingPage = await getPage();
    const { container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(container.querySelector(".tracking-not-found")).not.toBeNull();
    expect(container.textContent).toContain("Shipment Not Found");
  });

  it("renders tracking ID in not found message", async () => {
    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      null
    );

    const TrackingPage = await getPage();
    const { container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-5678" }),
      })
    );

    expect(container.textContent).toContain("SL-5678");
  });

  it("renders shipment data when found", async () => {
    const shipmentData = {
      trackingId: "SL-1234",
      origin: "Shanghai",
      destination: "Los Angeles",
      status: "in_transit",
      milestones: [],
      branding: {
        tenantName: "Acme Corp",
        primaryColor: "#ff0000",
      },
    };

    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      shipmentData
    );

    const TrackingPage = await getPage();
    const { container, getByText } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(container.querySelector(".tracking-shell")).not.toBeNull();
    expect(getByText("Acme Corp")).toBeDefined();
  });

  it("renders origin and destination from shipment data", async () => {
    const shipmentData = {
      trackingId: "SL-1234",
      origin: "Tokyo",
      destination: "New York",
      status: "delivered",
      milestones: [],
      branding: { tenantName: "TestCo" },
    };

    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      shipmentData
    );

    const TrackingPage = await getPage();
    const { getByText } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(getByText("Tokyo")).toBeDefined();
    expect(getByText("New York")).toBeDefined();
  });

  it("renders milestones when present", async () => {
    const shipmentData = {
      trackingId: "SL-1234",
      origin: "Shanghai",
      destination: "LA",
      status: "in_transit",
      milestones: [
        {
          type: "picked_up",
          description: "Picked up from warehouse",
          location: "Shanghai",
          occurredAt: "2025-01-15T10:00:00Z",
        },
      ],
      branding: { tenantName: "TestCo" },
    };

    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      shipmentData
    );

    const TrackingPage = await getPage();
    const { getByText } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    expect(getByText("Shipment Timeline")).toBeDefined();
    expect(getByText("Picked up from warehouse")).toBeDefined();
  });

  it("passes branding props to BrandedShell", async () => {
    const shipmentData = {
      trackingId: "SL-1234",
      origin: "Shanghai",
      destination: "LA",
      status: "in_transit",
      milestones: [],
      branding: {
        tenantName: "Acme Corp",
        logoUrl: "https://example.com/logo.png",
        primaryColor: "#3B82F6",
        tagline: "Fast shipping",
        contactEmail: "support@acme.com",
        supportUrl: "https://help.acme.com",
      },
    };

    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      shipmentData
    );

    const TrackingPage = await getPage();
    const { getByText, container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("alt")).toBe("Acme Corp");
    expect(getByText("Fast shipping")).toBeDefined();
  });

  it("renders with null branding", async () => {
    const shipmentData = {
      trackingId: "SL-1234",
      origin: "Shanghai",
      destination: "LA",
      status: "in_transit",
      milestones: [],
      branding: null,
    };

    (getShipmentByTrackingId as ReturnType<typeof vi.fn>).mockResolvedValue(
      shipmentData
    );

    const TrackingPage = await getPage();
    const { container } = render(
      await TrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234" }),
      })
    );

    const brandName = container.querySelector(".tracking-brand-name");
    expect(brandName?.textContent).toBe("ShipLens");
  });

  it("generates metadata with tracking ID", async () => {
    const mod = await import(
      "../src/app/track/[trackingId]/page"
    );
    const metadata = await mod.generateMetadata({
      params: Promise.resolve({ trackingId: "SL-1234" }),
    });

    expect(metadata.title).toBe("Tracking SL-1234 — ShipLens");
    expect(metadata.description).toBe("Track shipment SL-1234 in real-time");
  });

  it("does not call getShipmentByTrackingId for invalid tracking ID", async () => {
    const TrackingPage = await getPage();

    try {
      await TrackingPage({
        params: Promise.resolve({ trackingId: "bad-id" }),
      });
    } catch {
      // expected
    }

    expect(getShipmentByTrackingId).not.toHaveBeenCalled();
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

  it("includes tracking ID in title", async () => {
    const mod = await import(
      "../src/app/track/[trackingId]/page"
    );
    const result = await mod.generateMetadata({
      params: Promise.resolve({ trackingId: "SL-ABCD" }),
    });

    expect(result.title).toContain("SL-ABCD");
  });

  it("includes tracking ID in description", async () => {
    const mod = await import(
      "../src/app/track/[trackingId]/page"
    );
    const result = await mod.generateMetadata({
      params: Promise.resolve({ trackingId: "SL-XYZ1" }),
    });

    expect(result.description).toContain("SL-XYZ1");
  });
});
