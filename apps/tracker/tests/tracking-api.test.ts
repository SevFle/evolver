import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("next/headers", () => ({
  headers: vi.fn(),
}));

import { headers } from "next/headers";

function mockHeaders(host: string | null) {
  const map = new Map<string, string>();
  if (host !== null) map.set("host", host);
  (headers as ReturnType<typeof vi.fn>).mockResolvedValue({
    get: (name: string) => map.get(name) ?? null,
  });
}

describe("getShipmentByTrackingId", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns shipment data on successful fetch", async () => {
    mockHeaders("acme.shiplens.io");

    const shipmentData = {
      success: true,
      data: {
        trackingId: "SL-123",
        origin: "Shanghai",
        destination: "LA",
        status: "in_transit",
        milestones: [],
        branding: {
          tenantName: "Acme Corp",
          primaryColor: "#ff0000",
        },
      },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(shipmentData),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("SL-123");

    expect(result).toEqual(shipmentData.data);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tracking-pages/SL-123"),
      expect.objectContaining({
        headers: expect.objectContaining({ "x-tenant-slug": "acme" }),
      })
    );
  });

  it("returns null when response is not ok", async () => {
    mockHeaders("acme.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status: 404,
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("NOTFOUND");
    expect(result).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    mockHeaders("acme.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error")
    );

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("SL-ERR");
    expect(result).toBeNull();
  });

  it("returns null when data field is null in response", async () => {
    mockHeaders("acme.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: null }),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("SL-NULL");
    expect(result).toBeNull();
  });

  it("does not include tenant-slug header when no tenant resolved", async () => {
    mockHeaders("www.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { trackingId: "SL-1" } }),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    await getShipmentByTrackingId("SL-1");

    const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock
      .calls[0];
    expect(callArgs[1].headers).toEqual({});
  });

  it("uses API_INTERNAL_URL from environment when set", async () => {
    mockHeaders("acme.shiplens.io");
    process.env.API_INTERNAL_URL = "http://custom-api:4000";

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { trackingId: "SL-1" } }),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    await getShipmentByTrackingId("SL-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "http://custom-api:4000/api/tracking-pages/SL-1",
      expect.anything()
    );

    delete process.env.API_INTERNAL_URL;
  });

  it("URL-encodes the tracking ID", async () => {
    mockHeaders("acme.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { trackingId: "SL-123" } }),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    await getShipmentByTrackingId("SL-123");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/tracking-pages/SL-123"),
      expect.anything()
    );
  });

  it("rejects tracking IDs with invalid characters", async () => {
    mockHeaders("acme.shiplens.io");

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );

    expect(await getShipmentByTrackingId("SL 123")).toBeNull();
    expect(await getShipmentByTrackingId("SL/123")).toBeNull();
    expect(await getShipmentByTrackingId("SL<script>")).toBeNull();
    expect(await getShipmentByTrackingId("")).toBeNull();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("accepts tracking IDs with valid characters", async () => {
    mockHeaders("acme.shiplens.io");

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({ success: true, data: { trackingId: "SL_abc-123" } }),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("SL_abc-123");

    expect(result?.trackingId).toBe("SL_abc-123");
    expect(globalThis.fetch).toHaveBeenCalled();
  });

  it("returns full TrackingPageData with milestones and branding", async () => {
    mockHeaders("acme.shiplens.io");

    const fullData = {
      success: true,
      data: {
        trackingId: "SL-FULL",
        origin: "Shanghai, CN",
        destination: "Los Angeles, US",
        status: "in_transit",
        carrier: "Maersk",
        serviceType: "FCL",
        estimatedDelivery: "2025-06-01T00:00:00Z",
        reference: "PO-123",
        milestones: [
          {
            type: "picked_up",
            description: "Picked up",
            location: "Shanghai",
            occurredAt: "2025-01-15T10:00:00Z",
          },
        ],
        branding: {
          tenantName: "Acme Forwarding",
          logoUrl: "https://example.com/logo.png",
          primaryColor: "#3B82F6",
          tagline: "Fast & Reliable",
          contactEmail: "support@acme.com",
          contactPhone: "+1-555-1234",
        },
      },
    };

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(fullData),
    });

    const { getShipmentByTrackingId } = await import(
      "../src/lib/tracking-api"
    );
    const result = await getShipmentByTrackingId("SL-FULL");

    expect(result?.trackingId).toBe("SL-FULL");
    expect(result?.milestones).toHaveLength(1);
    expect(result?.branding?.tenantName).toBe("Acme Forwarding");
  });
});
