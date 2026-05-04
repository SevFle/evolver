import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/tracking-api", () => ({
  getShipmentByTrackingId: vi.fn(),
}));

vi.mock("@/components/BrandedShell", () => ({
  BrandedShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="branded-shell">{children}</div>
  ),
}));

vi.mock("@/components/ShipmentHeader", () => ({
  ShipmentHeader: ({ shipment }: { shipment: { trackingId: string } }) => (
    <div data-testid="shipment-header">{shipment.trackingId}</div>
  ),
}));

vi.mock("@/components/MilestoneTimeline", () => ({
  MilestoneTimeline: ({ milestones }: { milestones: { type: string }[] }) => (
    <div data-testid="milestone-timeline">{milestones.length} milestones</div>
  ),
}));

import TrackingPage, { generateMetadata } from "@/app/track/[trackingId]/page";
import { getShipmentByTrackingId } from "@/lib/tracking-api";

const mockGetShipment = vi.mocked(getShipmentByTrackingId);

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders not found when shipment returns null", async () => {
    mockGetShipment.mockResolvedValueOnce(null);
    const jsx = await TrackingPage({
      params: Promise.resolve({ trackingId: "SL-NOTFOUND" }),
    });
    render(jsx);
    expect(screen.getByText("Shipment Not Found")).toBeDefined();
    expect(screen.getByText("SL-NOTFOUND")).toBeDefined();
  });

  it("renders shipment data when found", async () => {
    mockGetShipment.mockResolvedValueOnce({
      trackingId: "SL-123",
      origin: "Shanghai",
      destination: "Los Angeles",
      status: "in_transit",
      milestones: [
        { type: "pickup", description: "Picked up", occurredAt: "2026-01-01" },
      ],
      branding: { tenantName: "TestCo" },
    });
    const jsx = await TrackingPage({
      params: Promise.resolve({ trackingId: "SL-123" }),
    });
    render(jsx);
    expect(screen.getByTestId("shipment-header")).toBeDefined();
    expect(screen.getByTestId("milestone-timeline")).toBeDefined();
  });

  it("renders with null branding", async () => {
    mockGetShipment.mockResolvedValueOnce({
      trackingId: "SL-456",
      origin: "Tokyo",
      destination: "New York",
      status: "delivered",
    });
    const jsx = await TrackingPage({
      params: Promise.resolve({ trackingId: "SL-456" }),
    });
    render(jsx);
    expect(screen.getByTestId("branded-shell")).toBeDefined();
  });

  it("generates metadata with tracking ID", async () => {
    const meta = await generateMetadata({
      params: Promise.resolve({ trackingId: "SL-META" }),
    });
    expect(meta.title).toBe("Tracking SL-META — ShipLens");
    expect(meta.description).toBe("Track shipment SL-META in real-time");
  });

  it("renders not found hint text", async () => {
    mockGetShipment.mockResolvedValueOnce(null);
    const jsx = await TrackingPage({
      params: Promise.resolve({ trackingId: "SL-GONE" }),
    });
    render(jsx);
    expect(
      screen.getByText("Please check the tracking ID and try again.")
    ).toBeDefined();
  });
});
