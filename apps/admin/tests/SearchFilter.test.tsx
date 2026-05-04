import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SearchFilter } from "../src/components/SearchFilter";

describe("SearchFilter", () => {
  const defaultProps = {
    search: "",
    onSearchChange: vi.fn(),
    activeStatus: "all",
    onStatusChange: vi.fn(),
  };

  it("renders a search input", () => {
    render(<SearchFilter {...defaultProps} />);
    const input = screen.getByPlaceholderText(/tracking ID/i);
    expect(input).toBeTruthy();
  });

  it("renders all filter tabs", () => {
    render(<SearchFilter {...defaultProps} />);
    expect(screen.getByText("All")).toBeTruthy();
    expect(screen.getByText("In Transit")).toBeTruthy();
    expect(screen.getByText("Delivered")).toBeTruthy();
    expect(screen.getByText("Delayed")).toBeTruthy();
    expect(screen.getByText("Customs")).toBeTruthy();
  });

  it("calls onSearchChange when typing", () => {
    const onSearchChange = vi.fn();
    render(<SearchFilter {...defaultProps} onSearchChange={onSearchChange} />);
    const input = screen.getByPlaceholderText(/tracking ID/i);
    fireEvent.change(input, { target: { value: "SL-123" } });
    expect(onSearchChange).toHaveBeenCalledWith("SL-123");
  });

  it("calls onStatusChange when a tab is clicked", () => {
    const onStatusChange = vi.fn();
    render(<SearchFilter {...defaultProps} onStatusChange={onStatusChange} />);
    fireEvent.click(screen.getByText("Delivered"));
    expect(onStatusChange).toHaveBeenCalledWith("delivered");
  });

  it("displays the current search value", () => {
    render(<SearchFilter {...defaultProps} search="test-query" />);
    const input = screen.getByPlaceholderText(/tracking ID/i) as HTMLInputElement;
    expect(input.value).toBe("test-query");
  });

  it("highlights the active status tab", () => {
    render(<SearchFilter {...defaultProps} activeStatus="in_transit" />);
    const tab = screen.getByText("In Transit");
    expect(tab.style.borderBottom).toContain("var(--color-primary)");
    expect(tab.style.color).toBe("var(--color-primary)");
  });
});
