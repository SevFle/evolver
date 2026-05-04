import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import ShipmentsPage from "../src/app/shipments/page";

describe("ShipmentsPage", () => {
  it("renders the Shipments heading", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipments")).toBeDefined();
  });

  it("renders the coming soon message", () => {
    render(<ShipmentsPage />);
    expect(screen.getByText("Shipment management coming soon.")).toBeDefined();
  });

  it("applies valid style objects (not null) to container", () => {
    const { container } = render(<ShipmentsPage />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toBeNull();
    expect(wrapper.tagName).toBe("DIV");
    expect(wrapper.style).toBeDefined();
    expect(wrapper.style.padding).toBe("2rem");
  });

  it("matches snapshot", () => {
    const { container } = render(<ShipmentsPage />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
