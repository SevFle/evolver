import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  usePathname: () => "/shipments",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

import { ShipmentList } from "@/components/ShipmentList";

const mockShipments = [
  {
    id: "1",
    trackingId: "SL-001",
    reference: "REF-1",
    origin: "New York, NY",
    destination: "Los Angeles, CA",
    carrier: "Maersk",
    serviceType: "FCL",
    status: "in_transit" as const,
    estimatedDelivery: "2025-03-15T00:00:00Z",
    actualDelivery: null,
    customerName: "Acme Corp",
    customerEmail: "john@acme.com",
    customerPhone: null,
    metadata: null,
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
  },
  {
    id: "2",
    trackingId: "SL-002",
    reference: null,
    origin: "Shanghai",
    destination: "Rotterdam",
    carrier: "MSC",
    serviceType: "FCL",
    status: "delivered" as const,
    estimatedDelivery: "2025-02-01T00:00:00Z",
    actualDelivery: "2025-02-01T00:00:00Z",
    customerName: "Globex Inc",
    customerEmail: "jane@globex.com",
    customerPhone: null,
    metadata: null,
    createdAt: "2025-01-15T00:00:00Z",
    updatedAt: "2025-02-01T00:00:00Z",
  },
];

function mockFetchResponse(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  });
}

describe("ShipmentList", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_API_URL", "http://localhost:3001");
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("shows loading state initially", () => {
    globalThis.fetch = vi.fn().mockReturnValue(new Promise(() => {}));
    render(<ShipmentList />);
    expect(screen.getByText("Loading...")).toBeDefined();
  });

  it("renders shipments from API", async () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: mockShipments,
      total: 2,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
      expect(screen.getByText("SL-002")).toBeDefined();
    });

    expect(screen.getByText("New York, NY")).toBeDefined();
    expect(screen.getByText("Los Angeles, CA")).toBeDefined();
    expect(screen.getByText("Maersk")).toBeDefined();
    expect(screen.getByText("Acme Corp")).toBeDefined();
    const transitBadges = screen.getAllByText("In Transit");
    expect(transitBadges.length).toBeGreaterThanOrEqual(1);
    const deliveredBadges = screen.getAllByText("Delivered");
    expect(deliveredBadges.length).toBeGreaterThanOrEqual(1);
  });

  it("shows empty state when no shipments", async () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("No shipments found")).toBeDefined();
    });
  });

  it("shows error state on API failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: () => Promise.resolve({}),
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText(/API error: 500/)).toBeDefined();
    });
  });

  it("renders search input", () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);
    const searchInput = screen.getByPlaceholderText(
      "Search by tracking ID, reference, or customer..."
    );
    expect(searchInput).toBeDefined();
  });

  it("renders all status filter buttons", () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);
    expect(screen.getByText("All")).toBeDefined();
    expect(screen.getByText("Booked")).toBeDefined();
    expect(screen.getByText("In Transit")).toBeDefined();
    expect(screen.getByText("At Port")).toBeDefined();
    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Exception")).toBeDefined();
  });

  it("sends status filter param when clicked", async () => {
    const fetchMock = mockFetchResponse({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });
    globalThis.fetch = fetchMock;

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("Loading...")).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.queryByText("Loading...")).toBeNull();
    });

    fireEvent.click(screen.getByText("Exception"));

    await waitFor(() => {
      const calls = fetchMock.mock.calls;
      const lastCallUrl = calls[calls.length - 1]?.[0] as string;
      expect(lastCallUrl).toContain("status=exception");
    });
  });

  it("renders table headers", () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: [],
      total: 0,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);
    expect(screen.getByText("Tracking ID")).toBeDefined();
    expect(screen.getByText("Origin")).toBeDefined();
    expect(screen.getByText("Destination")).toBeDefined();
    expect(screen.getByText("Carrier")).toBeDefined();
    expect(screen.getByText("Customer")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("ETA")).toBeDefined();
  });

  it("shows pagination when total exceeds page size", async () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: mockShipments,
      total: 30,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("30 shipments")).toBeDefined();
      expect(screen.getByText("Previous")).toBeDefined();
      expect(screen.getByText("Next")).toBeDefined();
      expect(screen.getByText("1 / 2")).toBeDefined();
    });
  });

  it("disables Previous button on first page", async () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: mockShipments,
      total: 30,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      const prevBtn = screen.getByText("Previous") as HTMLButtonElement;
      expect(prevBtn.disabled).toBe(true);
    });
  });

  it("shows dash for null fields", async () => {
    const shipmentWithNulls = {
      id: "3",
      trackingId: "SL-003",
      reference: null,
      origin: null,
      destination: null,
      carrier: null,
      serviceType: null,
      status: "pending" as const,
      estimatedDelivery: null,
      actualDelivery: null,
      customerName: null,
      customerEmail: null,
      customerPhone: null,
      metadata: null,
      createdAt: "2025-01-01T00:00:00Z",
      updatedAt: "2025-01-01T00:00:00Z",
    };

    globalThis.fetch = mockFetchResponse({
      success: true,
      data: [shipmentWithNulls],
      total: 1,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
      const dashes = screen.getAllByText("—");
      expect(dashes.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("formats ETA dates", async () => {
    globalThis.fetch = mockFetchResponse({
      success: true,
      data: mockShipments,
      total: 2,
      page: 1,
      pageSize: 20,
    });

    render(<ShipmentList />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    const etaCells = screen.getAllByText(/2025/);
    expect(etaCells.length).toBeGreaterThanOrEqual(1);
  });
});
