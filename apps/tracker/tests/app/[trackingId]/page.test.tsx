import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render } from "@testing-library/react";

vi.mock("@/lib/tracking-api", () => ({
  getShipmentByTrackingId: vi.fn(),
}));

import { getShipmentByTrackingId } from "@/lib/tracking-api";
import TrackingPage, { generateMetadata } from "@/app/[trackingId]/page";

const mockedGetShipment = getShipmentByTrackingId as ReturnType<typeof vi.fn>;

describe("TrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const fullShipmentData = {
    trackingId: "SL-FULL123",
    origin: "Shanghai",
    destination: "Los Angeles",
    status: "in_transit",
    carrier: "Maersk",
    estimatedDelivery: "2025-06-15",
    milestones: [
      {
        type: "picked_up",
        description: "Package picked up at warehouse",
        location: "Shanghai",
        occurredAt: "2025-01-15T10:00:00Z",
      },
      {
        type: "in_transit",
        description: "Shipment in transit",
        location: "Pacific Ocean",
        occurredAt: "2025-01-16T08:00:00Z",
      },
    ],
  };

  it("renders not found when shipment data is null", async () => {
    mockedGetShipment.mockResolvedValue(null);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "NOTFOUND" }) })
    );
    expect(getByText("Shipment Not Found")).toBeDefined();
    expect(getByText(/No shipment found for tracking ID: NOTFOUND/)).toBeDefined();
  });

  it("renders shipment details when data is found", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getAllByText, getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getAllByText(/Shanghai/).length).toBeGreaterThanOrEqual(1);
    expect(getAllByText(/Los Angeles/).length).toBeGreaterThanOrEqual(1);
    expect(getByText(/SL-FULL123/)).toBeDefined();
  });

  it("renders milestones from shipment data", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText(/Package picked up at warehouse/)).toBeDefined();
    expect(getByText(/Shipment in transit/)).toBeDefined();
  });

  it("renders with empty milestones array", async () => {
    const dataNoMilestones = {
      ...fullShipmentData,
      milestones: [],
    };
    mockedGetShipment.mockResolvedValue(dataNoMilestones);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText(/No milestone updates yet/)).toBeDefined();
  });

  it("renders with undefined milestones (falls back to empty)", async () => {
    const { milestones, ...dataWithoutMilestones } = fullShipmentData;
    mockedGetShipment.mockResolvedValue(dataWithoutMilestones);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText(/No milestone updates yet/)).toBeDefined();
  });

  it("renders carrier info from shipment data", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText(/Maersk/)).toBeDefined();
  });

  it("renders estimated delivery from shipment data", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText(/2025-06-15/)).toBeDefined();
  });

  it("renders status badge", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText("IN TRANSIT")).toBeDefined();
  });

  it("calls getShipmentByTrackingId with correct tracking ID", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    await TrackingPage({ params: Promise.resolve({ trackingId: "SL-CALL123" }) });
    expect(mockedGetShipment).toHaveBeenCalledWith("SL-CALL123");
  });

  it("renders not found for tracking ID that returns null", async () => {
    mockedGetShipment.mockResolvedValue(null);
    const { queryByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "MISSING" }) })
    );
    expect(queryByText("IN TRANSIT")).toBeNull();
    expect(queryByText(/Shanghai/)).toBeNull();
  });

  it("renders delivered status", async () => {
    const deliveredData = { ...fullShipmentData, status: "delivered" };
    mockedGetShipment.mockResolvedValue(deliveredData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-DEL" }) })
    );
    expect(getByText("DELIVERED")).toBeDefined();
  });

  it("renders exception status", async () => {
    const exceptionData = { ...fullShipmentData, status: "exception" };
    mockedGetShipment.mockResolvedValue(exceptionData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-EXC" }) })
    );
    expect(getByText("EXCEPTION")).toBeDefined();
  });

  it("renders shipment without optional fields", async () => {
    const minimalData = {
      trackingId: "SL-MIN",
      origin: "Tokyo",
      destination: "Berlin",
      status: "booked",
    };
    mockedGetShipment.mockResolvedValue(minimalData);
    const { getByText, queryByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-MIN" }) })
    );
    expect(getByText(/Tokyo/)).toBeDefined();
    expect(getByText(/Berlin/)).toBeDefined();
    expect(getByText("BOOKED")).toBeDefined();
    expect(queryByText(/Carrier:/)).toBeNull();
    expect(queryByText(/Est\. delivery:/)).toBeNull();
  });

  it("renders Powered by ShipLens footer", async () => {
    mockedGetShipment.mockResolvedValue(fullShipmentData);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "SL-FULL123" }) })
    );
    expect(getByText("Powered by ShipLens")).toBeDefined();
  });

  it("renders Powered by ShipLens footer in not found state", async () => {
    mockedGetShipment.mockResolvedValue(null);
    const { getByText } = render(
      await TrackingPage({ params: Promise.resolve({ trackingId: "NOTFOUND" }) })
    );
    expect(getByText("Powered by ShipLens")).toBeDefined();
  });
});

describe("generateMetadata", () => {
  it("returns title with tracking ID", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ trackingId: "SL-META123" }),
    });
    expect(metadata).toEqual({
      title: "Tracking SL-META123 — ShipLens",
    });
  });

  it("returns title with different tracking IDs", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ trackingId: "ABC-XYZ" }),
    });
    expect(metadata).toEqual({
      title: "Tracking ABC-XYZ — ShipLens",
    });
  });

  it("returns title with empty tracking ID", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ trackingId: "" }),
    });
    expect(metadata).toEqual({
      title: "Tracking  — ShipLens",
    });
  });
});
