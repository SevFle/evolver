import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

const mockGet = vi.fn();
vi.mock("@/lib/api-client", () => ({
  apiClient: { get: (...args: any[]) => mockGet(...args) },
}));

import ShipmentsPage from "../../src/app/shipments/page";

const MOCK_SHIPMENTS = [
  {
    trackingId: "SL-001",
    customerName: "John Doe",
    origin: "Shanghai",
    destination: "Los Angeles",
    status: "in_transit",
    estimatedDelivery: "2025-01-15",
    lastMilestone: "Departed origin",
    lastMilestoneTime: "2025-01-10T10:00:00Z",
  },
  {
    trackingId: "SL-002",
    customerName: "Jane Smith",
    origin: "Tokyo",
    destination: "New York",
    status: "delivered",
    estimatedDelivery: "2025-01-10",
    lastMilestone: "Delivered",
    lastMilestoneTime: "2025-01-09T15:00:00Z",
  },
];

describe("ShipmentsPage", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("shows loading skeleton while fetching", () => {
    mockGet.mockReturnValue(new Promise(() => {}));
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipments")).toBeDefined();
    expect(screen.getByText("Filter by status:")).toBeDefined();
    expect(screen.queryByText("No shipments yet")).toBeNull();
  });

  it("shows error when API fails with Error", async () => {
    mockGet.mockRejectedValue(new Error("Network error"));
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("shows generic error for non-Error exceptions", async () => {
    mockGet.mockRejectedValue("string error");
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Failed to load shipments")).toBeDefined();
    });
  });

  it("shows empty state when no shipments", async () => {
    mockGet.mockResolvedValue({ success: true, data: [] });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("No shipments yet")).toBeDefined();
    });
  });

  it("shows empty state with filter when no matching shipments", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    const select = screen.getByDisplayValue("All statuses");
    fireEvent.change(select, { target: { value: "exception" } });
    expect(screen.getByText("No matching shipments")).toBeDefined();
  });

  it("renders shipments in table", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    expect(screen.getByText("SL-002")).toBeDefined();
    expect(screen.getByText("John Doe")).toBeDefined();
    expect(screen.getByText("Jane Smith")).toBeDefined();
    expect(screen.getByText("Shanghai")).toBeDefined();
    expect(screen.getByText("Los Angeles")).toBeDefined();
    expect(screen.getByText("Tokyo")).toBeDefined();
    expect(screen.getByText("New York")).toBeDefined();
  });

  it("renders links to shipment detail pages", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    expect(screen.getByText("SL-001").closest("a")?.getAttribute("href")).toBe("/shipments/SL-001");
    expect(screen.getByText("SL-002").closest("a")?.getAttribute("href")).toBe("/shipments/SL-002");
  });

  it("shows formatted status badges", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("In Transit")).toBeDefined();
    });
    const deliveredElements = screen.getAllByText("Delivered");
    expect(deliveredElements.length).toBeGreaterThanOrEqual(2);
    const badge = deliveredElements.find((el) => el.tagName === "SPAN");
    expect(badge).toBeDefined();
  });

  it("shows formatted dates for estimated delivery", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Jan 15, 2025")).toBeDefined();
    });
    expect(screen.getByText("Jan 10, 2025")).toBeDefined();
  });

  it("shows em-dash for missing optional fields", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          trackingId: "SL-003",
          origin: "Busan",
          destination: "Seattle",
          status: "pending",
        },
      ],
    });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-003")).toBeDefined();
    });
    const emDashes = screen.getAllByText("\u2014");
    expect(emDashes.length).toBeGreaterThanOrEqual(1);
  });

  it("shows last milestone in table", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Departed origin")).toBeDefined();
    });
    const deliveredTds = screen.getAllByText("Delivered").filter((el) => el.tagName === "TD");
    expect(deliveredTds.length).toBeGreaterThanOrEqual(1);
  });

  it("shows plural shipment count", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText(/2 shipments/)).toBeDefined();
    });
  });

  it("shows singular shipment count", async () => {
    mockGet.mockResolvedValue({ success: true, data: [MOCK_SHIPMENTS[0]] });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    expect(screen.getByText(/^1 shipment$/)).toBeDefined();
    expect(screen.queryByText(/1 shipments/)).toBeNull();
  });

  it("sorts by column ascending on first click", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Tracking ID"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("SL-001");
    expect(rows[1].textContent).toContain("SL-002");
  });

  it("reverses sort on second click of same column", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Tracking ID"));
    fireEvent.click(screen.getByText("Tracking ID"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("SL-002");
    expect(rows[1].textContent).toContain("SL-001");
  });

  it("sorts by a different column resetting to ascending", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    fireEvent.click(screen.getByText("Destination"));
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows[0].textContent).toContain("Los Angeles");
    expect(rows[1].textContent).toContain("New York");
  });

  it("filters by status and shows matching count", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    const select = screen.getByDisplayValue("All statuses");
    fireEvent.change(select, { target: { value: "delivered" } });
    expect(screen.getByText("SL-002")).toBeDefined();
    expect(screen.queryByText("SL-001")).toBeNull();
    expect(screen.getByText(/1 shipment/)).toBeDefined();
    expect(screen.getByText(/matching "Delivered"/)).toBeDefined();
  });

  it("handles null data response gracefully", async () => {
    mockGet.mockResolvedValue({ success: true, data: null });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("No shipments yet")).toBeDefined();
    });
  });

  it("cancels fetch on unmount", async () => {
    let resolvePromise: (value: any) => void;
    mockGet.mockReturnValue(
      new Promise((resolve) => {
        resolvePromise = resolve;
      })
    );
    const { unmount } = render(<ShipmentsPage />);
    unmount();
    resolvePromise!({ success: true, data: MOCK_SHIPMENTS });
  });

  it("renders status filter with all options", async () => {
    mockGet.mockResolvedValue({ success: true, data: [] });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("No shipments yet")).toBeDefined();
    });
    expect(screen.getByText("Filter by status:")).toBeDefined();
    expect(screen.getByText("All statuses")).toBeDefined();
  });

  it("renders all table column headers", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    expect(screen.getByText("Tracking ID")).toBeDefined();
    expect(screen.getByText("Customer")).toBeDefined();
    expect(screen.getByText("Origin")).toBeDefined();
    expect(screen.getByText("Destination")).toBeDefined();
    expect(screen.getByText("Status")).toBeDefined();
    expect(screen.getByText("ETA")).toBeDefined();
    expect(screen.getByText("Last Milestone")).toBeDefined();
  });

  it("handles date formatting error gracefully", async () => {
    const origToLocaleDateString = Date.prototype.toLocaleDateString;
    Date.prototype.toLocaleDateString = () => {
      throw new Error("format error");
    };
    try {
      mockGet.mockResolvedValue({
        success: true,
        data: [
          {
            trackingId: "SL-ERR",
            origin: "A",
            destination: "B",
            status: "pending",
            estimatedDelivery: "not-a-date",
          },
        ],
      });
      render(<ShipmentsPage />);
      await waitFor(() => {
        expect(screen.getByText("SL-ERR")).toBeDefined();
      });
      expect(screen.getByText("not-a-date")).toBeDefined();
    } finally {
      Date.prototype.toLocaleDateString = origToLocaleDateString;
    }
  });

  it("shows formatted status for customs_clearance", async () => {
    mockGet.mockResolvedValue({
      success: true,
      data: [
        {
          trackingId: "SL-CC",
          origin: "A",
          destination: "B",
          status: "customs_clearance",
        },
      ],
    });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Customs Clearance")).toBeDefined();
    });
  });

  it("highlights row on mouse enter", async () => {
    mockGet.mockResolvedValue({ success: true, data: MOCK_SHIPMENTS });
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-001")).toBeDefined();
    });
    const row = screen.getByText("SL-001").closest("tr");
    expect(row).not.toBeNull();
    fireEvent.mouseEnter(row!);
    expect(row?.style.background).toBe("rgb(249, 250, 251)");
    fireEvent.mouseLeave(row!);
    expect(row?.style.background).toBe("");
  });
});
