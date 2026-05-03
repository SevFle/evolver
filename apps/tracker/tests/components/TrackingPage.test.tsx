import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";
import TrackingPage from "../../src/app/[trackingId]/page";

const mockGetShipment = vi.fn();

vi.mock("../../src/lib/tracking-api", () => ({
  getShipmentByTrackingId: (...args: unknown[]) => mockGetShipment(...args),
}));

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders not found when shipment data is null", async () => {
    mockGetShipment.mockResolvedValue(null);

    const params = Promise.resolve({ trackingId: "SL-MISSING" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText("Shipment Not Found")).toBeDefined();
    expect(getByText(/SL-MISSING/)).toBeDefined();
  });

  it("renders shipment header with origin and destination", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-ABC123",
      origin: "Shanghai",
      destination: "Rotterdam",
      status: "in_transit",
      carrier: "Maersk",
      estimatedDelivery: "2025-06-01",
    });

    const params = Promise.resolve({ trackingId: "SL-ABC123" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText(/Shanghai/)).toBeDefined();
    expect(getByText(/Rotterdam/)).toBeDefined();
  });

  it("renders status badge", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-XYZ",
      origin: "Tokyo",
      destination: "London",
      status: "delivered",
    });

    const params = Promise.resolve({ trackingId: "SL-XYZ" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText("DELIVERED")).toBeDefined();
  });

  it("renders milestone timeline when milestones present", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-TIME",
      origin: "Busan",
      destination: "Hamburg",
      status: "in_transit",
      milestones: [
        { type: "picked_up", description: "Picked up", occurredAt: "2025-01-15T10:00:00Z" },
        { type: "in_transit", description: "In transit", location: "Pacific", occurredAt: "2025-01-16T08:00:00Z" },
      ],
    });

    const params = Promise.resolve({ trackingId: "SL-TIME" });
    const { getByText, container } = render(await TrackingPage({ params }));

    expect(getByText("Picked up")).toBeDefined();
    expect(getByText("In transit")).toBeDefined();
    expect(container.querySelectorAll("li").length).toBe(2);
  });

  it("renders empty milestone state when milestones array is empty", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-EMPTY",
      origin: "Miami",
      destination: "Barcelona",
      status: "pending",
      milestones: [],
    });

    const params = Promise.resolve({ trackingId: "SL-EMPTY" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText(/No milestone updates yet/)).toBeDefined();
  });

  it("renders empty milestone state when milestones is undefined", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-NOMS",
      origin: "Sydney",
      destination: "Auckland",
      status: "booked",
    });

    const params = Promise.resolve({ trackingId: "SL-NOMS" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText(/No milestone updates yet/)).toBeDefined();
  });

  it("renders tracking ID in header", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-IDCHECK",
      origin: "Origin",
      destination: "Dest",
      status: "pending",
    });

    const params = Promise.resolve({ trackingId: "SL-IDCHECK" });
    const { getByText } = render(await TrackingPage({ params }));

    expect(getByText(/SL-IDCHECK/)).toBeDefined();
  });

  it("calls getShipmentByTrackingId with correct tracking ID", async () => {
    mockGetShipment.mockResolvedValue({
      trackingId: "SL-CALL",
      origin: "A",
      destination: "B",
      status: "pending",
    });

    const params = Promise.resolve({ trackingId: "SL-CALL" });
    render(await TrackingPage({ params }));

    expect(mockGetShipment).toHaveBeenCalledWith("SL-CALL");
  });
});
