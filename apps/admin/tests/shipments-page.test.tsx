import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
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

  it("snapshot matches", () => {
    const { container } = render(<ShipmentsPage />);
    expect(container).toMatchSnapshot();
  });
});
