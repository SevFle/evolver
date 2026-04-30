import { describe, it, expect, vi, beforeEach } from "vitest";

const {
  mockGetAnalyticsOverview,
  mockGetDeliveryTimeline,
  mockGetStatusCodeBreakdown,
  mockGetLatencyHistogram,
  mockGetEndpointHealthSummary,
} = vi.hoisted(() => ({
  mockGetAnalyticsOverview: vi.fn(),
  mockGetDeliveryTimeline: vi.fn(),
  mockGetStatusCodeBreakdown: vi.fn(),
  mockGetLatencyHistogram: vi.fn(),
  mockGetEndpointHealthSummary: vi.fn(),
}));

vi.mock("@/server/db/queries/analytics", () => ({
  getAnalyticsOverview: mockGetAnalyticsOverview,
  getDeliveryTimeline: mockGetDeliveryTimeline,
  getStatusCodeBreakdown: mockGetStatusCodeBreakdown,
  getLatencyHistogram: mockGetLatencyHistogram,
  getEndpointHealthSummary: mockGetEndpointHealthSummary,
}));

import { createCallerFactory } from "@/server/trpc/init";
import { appRouter } from "@/server/trpc/router";

const createCaller = createCallerFactory(appRouter);

describe("analytics router — overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getAnalyticsOverview with userId and range", async () => {
    mockGetAnalyticsOverview.mockResolvedValueOnce({
      totalDeliveries: 100,
      successful: 85,
      failed: 10,
      pending: 5,
      successRate: 85,
      avgLatencyMs: 250,
      p50Latency: 200,
      p95Latency: 450,
      p99Latency: 800,
    });
    const caller = createCaller({ userId: "user-1" });
    const result = await caller.analytics.overview({ range: "7d" });
    expect(mockGetAnalyticsOverview).toHaveBeenCalledWith("user-1", "7d", undefined);
    expect(result.totalDeliveries).toBe(100);
    expect(result.successRate).toBe(85);
  });

  it("passes endpointId to getAnalyticsOverview", async () => {
    mockGetAnalyticsOverview.mockResolvedValueOnce({
      totalDeliveries: 50,
      successful: 45,
      failed: 3,
      pending: 2,
      successRate: 90,
      avgLatencyMs: 150,
      p50Latency: 120,
      p95Latency: 300,
      p99Latency: 500,
    });
    const caller = createCaller({ userId: "user-1" });
    await caller.analytics.overview({ range: "24h", endpointId: "00000000-0000-0000-0000-000000000123" });
    expect(mockGetAnalyticsOverview).toHaveBeenCalledWith("user-1", "24h", "00000000-0000-0000-0000-000000000123");
  });

  it("rejects invalid range values", async () => {
    const caller = createCaller({ userId: "user-1" });
    await expect(
      caller.analytics.overview({ range: "1y" as "24h" }),
    ).rejects.toThrow();
  });

  it("rejects invalid endpointId format", async () => {
    const caller = createCaller({ userId: "user-1" });
    await expect(
      caller.analytics.overview({ range: "7d", endpointId: "not-a-uuid" }),
    ).rejects.toThrow();
  });
});

describe("analytics router — timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getDeliveryTimeline with correct params", async () => {
    const mockData = [
      { bucket: new Date("2024-01-01T00:00:00Z"), totalCount: 50, successCount: 45, failedCount: 5 },
    ];
    mockGetDeliveryTimeline.mockResolvedValueOnce(mockData);
    const caller = createCaller({ userId: "user-1" });
    const result = await caller.analytics.timeline({ range: "24h" });
    expect(mockGetDeliveryTimeline).toHaveBeenCalledWith("user-1", "24h", undefined);
    expect(result).toEqual(mockData);
  });

  it("passes endpointId filter", async () => {
    mockGetDeliveryTimeline.mockResolvedValueOnce([]);
    const caller = createCaller({ userId: "user-1" });
    await caller.analytics.timeline({ range: "7d", endpointId: "00000000-0000-0000-0000-000000000456" });
    expect(mockGetDeliveryTimeline).toHaveBeenCalledWith("user-1", "7d", "00000000-0000-0000-0000-000000000456");
  });
});

describe("analytics router — statusCodes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getStatusCodeBreakdown with correct params", async () => {
    const mockData = [
      { statusCode: 200, count: 80 },
      { statusCode: 500, count: 12 },
    ];
    mockGetStatusCodeBreakdown.mockResolvedValueOnce(mockData);
    const caller = createCaller({ userId: "user-1" });
    const result = await caller.analytics.statusCodes({ range: "30d" });
    expect(mockGetStatusCodeBreakdown).toHaveBeenCalledWith("user-1", "30d", undefined);
    expect(result).toEqual(mockData);
  });
});

describe("analytics router — latencyHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getLatencyHistogram with correct params", async () => {
    const mockData = [
      { bucket: "0-50ms", count: 40, sortKey: 10 },
      { bucket: "50-100ms", count: 30, sortKey: 60 },
    ];
    mockGetLatencyHistogram.mockResolvedValueOnce(mockData);
    const caller = createCaller({ userId: "user-1" });
    const result = await caller.analytics.latencyHistogram({ range: "7d" });
    expect(mockGetLatencyHistogram).toHaveBeenCalledWith("user-1", "7d", undefined);
    expect(result).toEqual(mockData);
  });

  it("passes endpointId to getLatencyHistogram", async () => {
    mockGetLatencyHistogram.mockResolvedValueOnce([]);
    const caller = createCaller({ userId: "user-1" });
    await caller.analytics.latencyHistogram({ range: "24h", endpointId: "00000000-0000-0000-0000-000000000789" });
    expect(mockGetLatencyHistogram).toHaveBeenCalledWith("user-1", "24h", "00000000-0000-0000-0000-000000000789");
  });
});

describe("analytics router — endpointHealth", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls getEndpointHealthSummary with userId and range", async () => {
    const mockData = [
      {
        id: "ep-1",
        name: "Test",
        url: "https://example.com",
        status: "active",
        isActive: true,
        totalDeliveries: 100,
        successCount: 95,
        failedCount: 5,
        avgLatencyMs: 200,
        lastDeliveryAt: "2024-01-01T00:00:00Z",
        successRate: 95,
      },
    ];
    mockGetEndpointHealthSummary.mockResolvedValueOnce(mockData);
    const caller = createCaller({ userId: "user-1" });
    const result = await caller.analytics.endpointHealth({ range: "7d" });
    expect(mockGetEndpointHealthSummary).toHaveBeenCalledWith("user-1", "7d");
    expect(result).toEqual(mockData);
  });

  it("does not accept endpointId in input schema", async () => {
    const caller = createCaller({ userId: "user-1" });
    mockGetEndpointHealthSummary.mockResolvedValueOnce([]);
    await expect(
      caller.analytics.endpointHealth({ range: "24h", endpointId: "ep-1" } as never),
    ).resolves.toBeDefined();
  });
});

describe("analytics router — authentication", () => {
  it("requires authentication for overview", async () => {
    const caller = createCaller({});
    await expect(
      caller.analytics.overview({ range: "7d" }),
    ).rejects.toThrow("Authentication required");
  });

  it("requires authentication for timeline", async () => {
    const caller = createCaller({});
    await expect(
      caller.analytics.timeline({ range: "7d" }),
    ).rejects.toThrow("Authentication required");
  });

  it("requires authentication for statusCodes", async () => {
    const caller = createCaller({});
    await expect(
      caller.analytics.statusCodes({ range: "7d" }),
    ).rejects.toThrow("Authentication required");
  });

  it("requires authentication for latencyHistogram", async () => {
    const caller = createCaller({});
    await expect(
      caller.analytics.latencyHistogram({ range: "7d" }),
    ).rejects.toThrow("Authentication required");
  });

  it("requires authentication for endpointHealth", async () => {
    const caller = createCaller({});
    await expect(
      caller.analytics.endpointHealth({ range: "7d" }),
    ).rejects.toThrow("Authentication required");
  });
});
