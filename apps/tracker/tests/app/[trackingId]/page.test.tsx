import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    const err = new Error(`NEXT_REDIRECT`);
    (err as any).digest = "NEXT_REDIRECT";
    (err as any).redirectDestination = path;
    throw err;
  },
}));

import OldTrackingPage from "@/app/[trackingId]/page";

describe("OldTrackingPage (redirect)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("redirects /:trackingId to /track/:trackingId", async () => {
    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-ABC123" }),
      });
      expect.fail("Should have thrown NEXT_REDIRECT");
    } catch (err: any) {
      expect(err.message).toBe("NEXT_REDIRECT");
      expect(err.redirectDestination).toBe("/track/SL-ABC123");
    }
  });

  it("redirects with different tracking IDs", async () => {
    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "XYZ-999" }),
      });
      expect.fail("Should have thrown NEXT_REDIRECT");
    } catch (err: any) {
      expect(err.redirectDestination).toBe("/track/XYZ-999");
    }
  });

  it("redirects with empty tracking ID", async () => {
    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "" }),
      });
      expect.fail("Should have thrown NEXT_REDIRECT");
    } catch (err: any) {
      expect(err.redirectDestination).toBe("/track/");
    }
  });

  it("redirects with special characters in tracking ID", async () => {
    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: "SL-ABC/DEF%20" }),
      });
      expect.fail("Should have thrown NEXT_REDIRECT");
    } catch (err: any) {
      expect(err.redirectDestination).toBe("/track/SL-ABC/DEF%20");
    }
  });

  it("redirects with very long tracking ID", async () => {
    const longId = "SL-" + "A".repeat(200);
    try {
      await OldTrackingPage({
        params: Promise.resolve({ trackingId: longId }),
      });
      expect.fail("Should have thrown NEXT_REDIRECT");
    } catch (err: any) {
      expect(err.redirectDestination).toBe(`/track/${longId}`);
    }
  });

  it("awaits params before extracting trackingId", async () => {
    let resolved = false;
    const params = Promise.resolve({ trackingId: "SL-ASYNC" }).then((v) => {
      resolved = true;
      return v;
    });

    try {
      await OldTrackingPage({ params });
    } catch {
      expect(resolved).toBe(true);
    }
  });
});
