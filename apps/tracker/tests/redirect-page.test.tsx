import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({
  redirect: (...args: string[]) => mockRedirect(...args),
}));

describe("OldTrackingPage redirect", () => {
  beforeEach(() => {
    vi.resetModules();
    mockRedirect.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects to /track/:trackingId with the given ID", async () => {
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-ABC123" }),
      });
    } catch {
      // redirect throws internally
    }

    expect(mockRedirect).toHaveBeenCalledWith("/track/SL-ABC123");
  });

  it("redirects with different tracking IDs", async () => {
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "XYZ-999" }),
      });
    } catch {
      // redirect throws internally
    }

    expect(mockRedirect).toHaveBeenCalledWith("/track/XYZ-999");
  });

  it("awaits params before redirecting", async () => {
    mockRedirect.mockImplementation(() => {
      throw new Error("NEXT_REDIRECT");
    });

    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    let paramsResolved = false;
    const paramsPromise = new Promise<{ trackingId: string }>((resolve) => {
      setTimeout(() => {
        paramsResolved = true;
        resolve({ trackingId: "ASYNC-123" });
      }, 10);
    });

    try {
      await OldTrackingPage({ params: paramsPromise });
    } catch {
      // redirect throws
    }

    expect(paramsResolved).toBe(true);
    expect(mockRedirect).toHaveBeenCalledWith("/track/ASYNC-123");
  });
});
