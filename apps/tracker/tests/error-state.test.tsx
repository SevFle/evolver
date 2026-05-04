import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import TrackingError from "@/app/track/[trackingId]/error";

describe("TrackingError", () => {
  const resetMock = vi.fn();
  const error = new Error("Test error");

  it("renders error title", () => {
    render(<TrackingError error={error} reset={resetMock} />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  it("renders error message", () => {
    render(<TrackingError error={error} reset={resetMock} />);
    expect(
      screen.getByText(/We couldn't load the tracking information/)
    ).toBeDefined();
  });

  it("renders try again button", () => {
    render(<TrackingError error={error} reset={resetMock} />);
    expect(screen.getByText("Try Again")).toBeDefined();
  });

  it("calls reset when button clicked", () => {
    render(<TrackingError error={error} reset={resetMock} />);
    fireEvent.click(screen.getByText("Try Again"));
    expect(resetMock).toHaveBeenCalledTimes(1);
  });

  it("renders error icon", () => {
    const { container } = render(
      <TrackingError error={error} reset={resetMock} />
    );
    const icon = container.querySelector(".tracking-error-icon");
    expect(icon).not.toBeNull();
  });

  it("renders within BrandedShell", () => {
    render(<TrackingError error={error} reset={resetMock} />);
    expect(screen.getByText("Powered by")).toBeDefined();
  });

  it("handles error with digest", () => {
    const errorWithDigest = Object.assign(new Error("Server error"), {
      digest: "abc123",
    });
    render(<TrackingError error={errorWithDigest} reset={resetMock} />);
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });
});
