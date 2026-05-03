import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { redirect, notFound } from "next/navigation";
import OldTrackingPage from "@/app/[trackingId]/page";

describe("OldTrackingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects to /track/:id for valid tracking ID", async () => {
    await OldTrackingPage({
      params: Promise.resolve({ trackingId: "SL-1234" }),
    });
    expect(redirect).toHaveBeenCalledWith("/track/SL-1234");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound for invalid tracking ID", async () => {
    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "invalid" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });

  it("calls notFound for empty string tracking ID", async () => {
    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("calls notFound for lowercase tracking ID", async () => {
    await expect(
      OldTrackingPage({
        params: Promise.resolve({ trackingId: "sl-1234" }),
      })
    ).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
