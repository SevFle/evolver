import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ShipmentsPage } from "../src/components/ShipmentsPage";

vi.mock("../src/lib/api-client", () => ({
  apiClient: {
    get: vi.fn().mockResolvedValue({ data: [], success: true }),
    post: vi.fn().mockResolvedValue({ success: true }),
    patch: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
}));

describe("ShipmentsPage", () => {
  it("renders the Shipments heading", () => {
    render(<ShipmentsPage />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Shipments" })
    ).toBeDefined();
  });

  it("renders search input", () => {
    render(<ShipmentsPage />);
    expect(
      screen.getByPlaceholderText(
        "Search by tracking ID, customer, origin, destination..."
      )
    ).toBeDefined();
  });

  it("renders status filter tabs", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("All")).toBeDefined();
    expect(screen.getByText("In Transit")).toBeDefined();
    expect(screen.getByText("Delivered")).toBeDefined();
    expect(screen.getByText("Delayed")).toBeDefined();
    expect(screen.getByText("Customs")).toBeDefined();
  });

  it("has a container div with padding", () => {
    const { container } = render(<ShipmentsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div).toBeDefined();
    expect(div.tagName).toBe("DIV");
    expect(div.style.padding).toBe("2rem");
  });

  it("has max-width constraint on container", () => {
    const { container } = render(<ShipmentsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.maxWidth).toBe("1200px");
  });

  it("centers the container with auto margin", () => {
    const { container } = render(<ShipmentsPage />);
    const div = container.firstElementChild as HTMLElement;
    expect(div.style.margin).toBe("0px auto");
  });

  it("renders the heading with correct font weight", () => {
    const { container } = render(<ShipmentsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontWeight).toBe("600");
  });

  it("renders heading with correct font size", () => {
    const { container } = render(<ShipmentsPage />);
    const h1 = container.querySelector("h1") as HTMLElement;
    expect(h1.style.fontSize).toBe("1.25rem");
  });

  it("shows loading state initially", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("Loading shipments...")).toBeDefined();
  });

  it("shows empty state when data loads with no shipments", async () => {
    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("No shipments found.")).toBeDefined();
    });
  });

  it("shows shipment rows when data loads successfully", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    vi.mocked(apiClient.get).mockResolvedValueOnce({
      data: [
        {
          id: "1",
          trackingId: "SL-123",
          customerName: "Acme Corp",
          origin: "Shanghai",
          destination: "Los Angeles",
          carrier: "Maersk",
          status: "in_transit",
          estimatedDelivery: "2026-06-01",
        },
      ],
      success: true,
    });

    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("SL-123")).toBeDefined();
    });
    expect(screen.getByText("Acme Corp")).toBeDefined();
    expect(screen.getByText("Shanghai")).toBeDefined();
    expect(screen.getByText("Los Angeles")).toBeDefined();
    expect(screen.getByText("Maersk")).toBeDefined();
  });

  it("shows error message when API request fails", async () => {
    const { apiClient } = await import("../src/lib/api-client");
    vi.mocked(apiClient.get).mockRejectedValueOnce(new Error("Network error"));

    render(<ShipmentsPage />);
    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeDefined();
    });
  });

  it("snapshot matches", () => {
    const { container } = render(<ShipmentsPage />);
    expect(container).toMatchSnapshot();
  });
});
