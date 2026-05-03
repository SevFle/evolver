import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { Suspense } from "react";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: any) => (
    <a href={href} {...props}>{children}</a>
  ),
}));

import ShipmentDetailPage from "../../src/app/shipments/[trackingId]/page";

function renderWithSuspense(ui: React.ReactElement) {
  return render(<Suspense fallback={<div>Loading...</div>}>{ui}</Suspense>);
}

describe("ShipmentDetailPage", () => {
  it("renders tracking ID in heading", async () => {
    await act(async () => {
      renderWithSuspense(
        <ShipmentDetailPage
          params={Promise.resolve({ trackingId: "SL-123" })}
        />
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Shipment SL-123/)).toBeDefined();
    });
  });

  it("renders back link to shipments", async () => {
    await act(async () => {
      renderWithSuspense(
        <ShipmentDetailPage
          params={Promise.resolve({ trackingId: "SL-123" })}
        />
      );
    });
    await waitFor(() => {
      const backLink = screen.getByText(/Back to shipments/);
      expect(backLink).toBeDefined();
      expect(backLink.closest("a")?.getAttribute("href")).toBe("/shipments");
    });
  });

  it("renders coming soon text", async () => {
    await act(async () => {
      renderWithSuspense(
        <ShipmentDetailPage
          params={Promise.resolve({ trackingId: "SL-123" })}
        />
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/coming soon/)).toBeDefined();
    });
  });

  it("renders with different tracking IDs", async () => {
    await act(async () => {
      renderWithSuspense(
        <ShipmentDetailPage
          params={Promise.resolve({ trackingId: "ABC-XYZ-999" })}
        />
      );
    });
    await waitFor(() => {
      expect(screen.getByText(/Shipment ABC-XYZ-999/)).toBeDefined();
    });
  });
});
