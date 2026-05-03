import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: vi.fn(),
}));

import { notFound } from "next/navigation";
import { isValidTrackingId } from "@/app/track/[trackingId]/page";

describe("isValidTrackingId", () => {
  it("accepts valid tracking ID SL-ABC123", () => {
    expect(isValidTrackingId("SL-ABC123")).toBe(true);
  });

  it("accepts valid tracking ID AB-1234", () => {
    expect(isValidTrackingId("AB-1234")).toBe(true);
  });

  it("accepts valid tracking ID with minimum length after hyphen", () => {
    expect(isValidTrackingId("XY-1234")).toBe(true);
  });

  it("accepts valid tracking ID with maximum length after hyphen", () => {
    expect(isValidTrackingId("XY-123456789012")).toBe(true);
  });

  it("accepts lowercase tracking IDs", () => {
    expect(isValidTrackingId("sl-abc123")).toBe(true);
  });

  it("accepts mixed case tracking IDs", () => {
    expect(isValidTrackingId("Sl-AbC123")).toBe(true);
  });

  it("accepts all-numeric after hyphen", () => {
    expect(isValidTrackingId("AB-999999")).toBe(true);
  });

  it("accepts all-alpha after hyphen", () => {
    expect(isValidTrackingId("ZZ-ABCDEFGH")).toBe(true);
  });

  it("rejects empty string", () => {
    expect(isValidTrackingId("")).toBe(false);
  });

  it("rejects string without hyphen", () => {
    expect(isValidTrackingId("SLABC123")).toBe(false);
  });

  it("rejects prefix shorter than 2 characters", () => {
    expect(isValidTrackingId("A-ABC123")).toBe(false);
  });

  it("rejects prefix longer than 2 characters", () => {
    expect(isValidTrackingId("ABC-ABC123")).toBe(false);
  });

  it("rejects suffix shorter than 4 characters", () => {
    expect(isValidTrackingId("SL-AB")).toBe(false);
  });

  it("rejects suffix longer than 12 characters", () => {
    expect(isValidTrackingId("SL-1234567890123")).toBe(false);
  });

  it("rejects special characters in tracking ID", () => {
    expect(isValidTrackingId("SL-ABC@123")).toBe(false);
  });

  it("rejects spaces in tracking ID", () => {
    expect(isValidTrackingId("SL ABC123")).toBe(false);
  });

  it("rejects hyphen-only input", () => {
    expect(isValidTrackingId("-")).toBe(false);
  });

  it("rejects numbers in prefix", () => {
    expect(isValidTrackingId("1L-ABC123")).toBe(false);
  });

  it("rejects special characters in prefix", () => {
    expect(isValidTrackingId("!L-ABC123")).toBe(false);
  });

  it("rejects multiple hyphens", () => {
    expect(isValidTrackingId("SL--ABC123")).toBe(false);
  });

  it("rejects tracking ID with underscores", () => {
    expect(isValidTrackingId("SL-ABC_123")).toBe(false);
  });

  it("rejects path traversal attempt", () => {
    expect(isValidTrackingId("../etc/passwd")).toBe(false);
  });

  it("rejects XSS attempt", () => {
    expect(isValidTrackingId("<script>alert(1)</script>")).toBe(false);
  });

  it("rejects SQL injection attempt", () => {
    expect(isValidTrackingId("SL-1' OR '1'='1")).toBe(false);
  });
});

describe("TrackingPage - validation integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
    vi.mocked(notFound).mockReset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("does not fetch data for invalid tracking IDs", async () => {
    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/components/BrandedShell", () => ({
      BrandedShell: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
    }));
    vi.doMock("@/components/ShipmentHeader", () => ({
      ShipmentHeader: () => <div />,
    }));
    vi.doMock("@/components/MilestoneTimeline", () => ({
      MilestoneTimeline: () => <div />,
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "INVALID" });

    await expect(TrackingPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("fetches data for valid tracking IDs without calling notFound", async () => {
    const mockGetShipment = vi.fn().mockResolvedValue({
      trackingId: "SL-ABC123",
      origin: "Shanghai",
      destination: "LA",
      status: "in_transit",
      milestones: [],
      branding: { tenantName: "Test" },
    });

    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: mockGetShipment,
    }));
    vi.doMock("@/components/BrandedShell", () => ({
      BrandedShell: ({ children }: { children: React.ReactNode }) => (
        <div data-testid="shell">{children}</div>
      ),
    }));
    vi.doMock("@/components/ShipmentHeader", () => ({
      ShipmentHeader: () => <div />,
    }));
    vi.doMock("@/components/MilestoneTimeline", () => ({
      MilestoneTimeline: () => <div />,
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "SL-ABC123" });
    await TrackingPage({ params });

    expect(mockGetShipment).toHaveBeenCalledWith("SL-ABC123");
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound for path traversal attempts", async () => {
    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/components/BrandedShell", () => ({
      BrandedShell: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
    }));
    vi.doMock("@/components/ShipmentHeader", () => ({
      ShipmentHeader: () => <div />,
    }));
    vi.doMock("@/components/MilestoneTimeline", () => ({
      MilestoneTimeline: () => <div />,
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "../etc/passwd" });
    await expect(TrackingPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("calls notFound for XSS attempts", async () => {
    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/components/BrandedShell", () => ({
      BrandedShell: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
    }));
    vi.doMock("@/components/ShipmentHeader", () => ({
      ShipmentHeader: () => <div />,
    }));
    vi.doMock("@/components/MilestoneTimeline", () => ({
      MilestoneTimeline: () => <div />,
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({
      trackingId: "<script>alert(1)</script>",
    });
    await expect(TrackingPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });

  it("calls notFound for IDs that are too short", async () => {
    vi.doMock("@/lib/tracking-api", () => ({
      getShipmentByTrackingId: vi.fn().mockResolvedValue(null),
    }));
    vi.doMock("@/components/BrandedShell", () => ({
      BrandedShell: ({ children }: { children: React.ReactNode }) => (
        <div>{children}</div>
      ),
    }));
    vi.doMock("@/components/ShipmentHeader", () => ({
      ShipmentHeader: () => <div />,
    }));
    vi.doMock("@/components/MilestoneTimeline", () => ({
      MilestoneTimeline: () => <div />,
    }));

    vi.mocked(notFound).mockImplementation(() => {
      throw new Error("NOT_FOUND");
    });

    const { default: TrackingPage } = await import(
      "@/app/track/[trackingId]/page"
    );

    const params = Promise.resolve({ trackingId: "X-1" });
    await expect(TrackingPage({ params })).rejects.toThrow("NOT_FOUND");
    expect(notFound).toHaveBeenCalledTimes(1);
  });
});
