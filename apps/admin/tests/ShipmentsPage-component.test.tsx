import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

const mockGet = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    get: (...args: unknown[]) => mockGet(...args),
  },
}));

import { ShipmentsPage } from "../src/components/ShipmentsPage";

const SAMPLE_SHIPMENTS = [
  {
    id: "1",
    trackingId: "SL-001",
    customerName: "Alice",
    origin: "Shanghai",
    destination: "Rotterdam",
    carrier: "Maersk",
    status: "in_transit" as const,
    estimatedDelivery: "2026-06-01",
  },
  {
    id: "2",
    trackingId: "SL-002",
    customerName: "Bob",
    origin: "Tokyo",
    destination: "Los Angeles",
    carrier: "COSCO",
    status: "delivered" as const,
    estimatedDelivery: "2026-05-01",
  },
];

describe("ShipmentsPage component", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("renders loading state initially", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ShipmentsPage />);
    expect(screen.getByText("Loading shipments...")).toBeDefined();
  });

  it("renders shipments after loading", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    expect(screen.getByText("SL-002")).toBeDefined();
    expect(screen.getByText("Alice")).toBeDefined();
    expect(screen.getByText("Bob")).toBeDefined();
  });

  it("renders error state", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("renders error with non-Error thrown", async () => {
    mockGet.mockRejectedValue("string error");
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load shipments")).toBeDefined();
    });
  });

  it("renders empty state when no shipments", async () => {
    mockGet.mockResolvedValue({ data: [] });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No shipments found.")).toBeDefined();
    });
  });

  it("handles null data from API", async () => {
    mockGet.mockResolvedValue({ data: null });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("No shipments found.")).toBeDefined();
    });
  });

  it("renders search input", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(
          "Search by tracking ID, customer, origin, destination..."
        )
      ).toBeDefined();
    });
  });

  it("filters shipments by search term", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });

    const input = screen.getByPlaceholderText(
      "Search by tracking ID, customer, origin, destination..."
    );
    fireEvent.change(input, { target: { value: "Alice" } });

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
      expect(screen.queryByText("SL-002")).toBeNull();
    });
  });

  it("filters shipments by status tab", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });

    const deliveredButton = screen.getAllByText("Delivered").find(
      (el) => el.tagName === "BUTTON"
    )!;
    fireEvent.click(deliveredButton);

    await waitFor(() => {
      expect(screen.queryByText("SL-001")).toBeNull();
      expect(screen.getByText("SL-002")).toBeDefined();
    });
  });

  it("sends status query param when filter is active", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });

    const deliveredButton = screen.getAllByText("Delivered").find(
      (el) => el.tagName === "BUTTON"
    )!;
    fireEvent.click(deliveredButton);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("status=delivered")
      );
    });
  });

  it("sends search query param when search is entered", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    const input = screen.getByPlaceholderText(
      "Search by tracking ID, customer, origin, destination..."
    );
    fireEvent.change(input, { target: { value: "test" } });

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith(
        expect.stringContaining("search=test")
      );
    });
  });

  it("renders table headers", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });

    expect(screen.getByText("Tracking ID")).toBeDefined();
    expect(screen.getByText("Customer")).toBeDefined();
    expect(screen.getByText("Origin")).toBeDefined();
    expect(screen.getByText("Destination")).toBeDefined();
    expect(screen.getByText("Carrier")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("ETA")).toBeDefined();
  });

  it("renders status badges for shipments", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("In Transit")).toBeDefined();
    });
    const deliveredSpans = screen.getAllByText("Delivered").filter(
      (el) => el.tagName === "SPAN"
    );
    expect(deliveredSpans.length).toBeGreaterThan(0);
  });

  it("does not set query params for default filters", async () => {
    mockGet.mockResolvedValue({ data: SAMPLE_SHIPMENTS });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(mockGet).toHaveBeenCalledWith("/api/shipments");
    });
  });

  it("handles shipments with null optional fields", async () => {
    const shipmentsWithNulls = [
      {
        id: "3",
        trackingId: "SL-003",
        customerName: null,
        origin: null,
        destination: null,
        carrier: null,
        status: "pending" as const,
        estimatedDelivery: null,
      },
    ];
    mockGet.mockResolvedValue({ data: shipmentsWithNulls });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
    });

    const cells = screen.getAllByText("—");
    expect(cells.length).toBeGreaterThanOrEqual(4);
  });

  it("filters shipments matching on null customer fields", async () => {
    const shipmentsWithNulls = [
      {
        id: "3",
        trackingId: "SL-003",
        customerName: null,
        origin: null,
        destination: null,
        carrier: null,
        status: "pending" as const,
        estimatedDelivery: null,
      },
    ];
    mockGet.mockResolvedValue({ data: shipmentsWithNulls });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
    });

    mockGet.mockResolvedValue({ data: shipmentsWithNulls });

    const input = screen.getByPlaceholderText(
      "Search by tracking ID, customer, origin, destination..."
    );
    fireEvent.change(input, { target: { value: "SL-003" } });

    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
    });
  });

  it("excludes shipment when search matches no fields including null ones", async () => {
    const shipmentsWithNulls = [
      {
        id: "3",
        trackingId: "SL-003",
        customerName: null,
        origin: null,
        destination: null,
        carrier: null,
        status: "pending" as const,
        estimatedDelivery: null,
      },
    ];
    mockGet.mockResolvedValue({ data: shipmentsWithNulls });
    render(<ShipmentsPage />);

    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
    });

    mockGet.mockResolvedValue({ data: shipmentsWithNulls });

    const input = screen.getByPlaceholderText(
      "Search by tracking ID, customer, origin, destination..."
    );
    fireEvent.change(input, { target: { value: "nonexistent" } });

    await waitFor(() => {
      expect(screen.getByText("No shipments found.")).toBeDefined();
    });
  });
});
