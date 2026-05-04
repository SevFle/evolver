import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import TrackingLoading from "@/app/track/[trackingId]/loading";

describe("TrackingLoading", () => {
  it("renders loading text", () => {
    const { getByText } = render(<TrackingLoading />);
    expect(getByText("Loading shipment details...")).toBeDefined();
  });

  it("renders spinner element", () => {
    const { container } = render(<TrackingLoading />);
    const spinner = container.querySelector(".tracking-loading-spinner");
    expect(spinner).not.toBeNull();
  });

  it("renders within BrandedShell", () => {
    const { getByText } = render(<TrackingLoading />);
    expect(getByText("Powered by")).toBeDefined();
  });

  it("renders loading container", () => {
    const { container } = render(<TrackingLoading />);
    const loadingDiv = container.querySelector(".tracking-loading");
    expect(loadingDiv).not.toBeNull();
  });
});
