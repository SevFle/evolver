import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("NEXT_REDIRECT");
  }),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { redirect } from "next/navigation";
import { notFound } from "next/navigation";

describe("OldTrackingPage redirect", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("redirects valid tracking ID to /track/:id", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({ params: Promise.resolve({ trackingId: "SL-1234" }) })
    ).rejects.toThrow("NEXT_REDIRECT");

    expect(redirect).toHaveBeenCalledWith("/track/SL-1234");
  });

  it("encodes special characters in tracking ID for redirect", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({ params: Promise.resolve({ trackingId: "SL-1234" }) })
    ).rejects.toThrow("NEXT_REDIRECT");
  });

  it("calls notFound for tracking ID without hyphen", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({ params: Promise.resolve({ trackingId: "SL1234" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");

    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound for empty tracking ID", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({ params: Promise.resolve({ trackingId: "" }) })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID with special characters", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-<script>" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID that is too long", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-1234567890123" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID that is too short after hyphen", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-123" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for tracking ID with wrong prefix length", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "ABC-1234" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("redirects valid tracking ID with encoded URI component", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-AB12" }),
      });
    } catch {
      // expected
    }

    expect(redirect).toHaveBeenCalledWith("/track/SL-AB12");
  });

  it("does not call redirect for invalid tracking ID", async () => {
    const { default: OldTrackingPage } = await import(
      "../src/app/[trackingId]/page"
    );

    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "invalid" }),
      });
    } catch {
      // expected
    }

    expect(redirect).not.toHaveBeenCalled();
  });
});
