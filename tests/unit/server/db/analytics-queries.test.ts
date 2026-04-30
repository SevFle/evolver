import { describe, it, expect, vi, beforeEach } from "vitest";

const mockGroupBy = vi.fn(() => ({ orderBy: vi.fn(() => []) }));
const mockWhere = vi.fn(() => ({ groupBy: mockGroupBy }));
const mockFrom = vi.fn(() => ({ where: mockWhere }));
const mockSelect = vi.fn(() => ({ from: mockFrom }));

vi.mock("@/server/db", () => ({
  db: {
    select: mockSelect,
  },
}));

import {
  getTimeRangeSince,
  getAnalyticsOverview,
  getDeliveryTimeline,
  getStatusCodeBreakdown,
  getLatencyHistogram,
  getEndpointHealthSummary,
} from "@/server/db/queries/analytics";

describe("getTimeRangeSince", () => {
  it("returns a date 24 hours ago for '24h'", () => {
    const since = getTimeRangeSince("24h");
    const now = new Date();
    const diff = now.getTime() - since.getTime();
    expect(diff).toBeCloseTo(24 * 60 * 60 * 1000, -2);
  });

  it("returns a date 7 days ago for '7d'", () => {
    const since = getTimeRangeSince("7d");
    const now = new Date();
    const diff = now.getTime() - since.getTime();
    expect(diff).toBeCloseTo(7 * 24 * 60 * 60 * 1000, -2);
  });

  it("returns a date 30 days ago for '30d'", () => {
    const since = getTimeRangeSince("30d");
    const now = new Date();
    const diff = now.getTime() - since.getTime();
    expect(diff).toBeCloseTo(30 * 24 * 60 * 60 * 1000, -2);
  });

  it("returns a date in the past", () => {
    const since = getTimeRangeSince("24h");
    expect(since.getTime()).toBeLessThan(Date.now());
  });
});

describe("getAnalyticsOverview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns computed overview with success rate", async () => {
    mockWhere.mockResolvedValueOnce([
      {
        totalDeliveries: 100,
        successful: 85,
        failed: 10,
        pending: 5,
        avgLatencyMs: 250,
        p50Latency: 200,
        p95Latency: 450,
        p99Latency: 800,
      },
    ] as never);

    const result = await getAnalyticsOverview("user-1", "7d");
    expect(mockSelect).toHaveBeenCalled();
    expect(result.totalDeliveries).toBe(100);
    expect(result.successful).toBe(85);
    expect(result.failed).toBe(10);
    expect(result.pending).toBe(5);
    expect(result.successRate).toBe(85);
  });

  it("calculates success rate as rounded percentage", async () => {
    mockWhere.mockResolvedValueOnce([
      {
        totalDeliveries: 200,
        successful: 180,
        failed: 15,
        pending: 5,
        avgLatencyMs: 100,
        p50Latency: 90,
        p95Latency: 200,
        p99Latency: 350,
      },
    ] as never);
    const result = await getAnalyticsOverview("user-1", "24h");
    expect(result.successRate).toBe(90);
  });

  it("returns null successRate when total is 0", async () => {
    mockWhere.mockResolvedValueOnce([
      {
        totalDeliveries: 0,
        successful: 0,
        failed: 0,
        pending: 0,
        avgLatencyMs: null,
        p50Latency: null,
        p95Latency: null,
        p99Latency: null,
      },
    ] as never);
    const result = await getAnalyticsOverview("user-1", "24h");
    expect(result.successRate).toBeNull();
  });

  it("passes endpointId when provided", async () => {
    mockWhere.mockResolvedValueOnce([
      {
        totalDeliveries: 50,
        successful: 40,
        failed: 8,
        pending: 2,
        avgLatencyMs: 150,
        p50Latency: 120,
        p95Latency: 300,
        p99Latency: 500,
      },
    ] as never);
    await getAnalyticsOverview("user-1", "7d", "ep-123");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("returns latency percentiles from db row", async () => {
    mockWhere.mockResolvedValueOnce([
      {
        totalDeliveries: 100,
        successful: 90,
        failed: 5,
        pending: 5,
        avgLatencyMs: 250,
        p50Latency: 200,
        p95Latency: 450,
        p99Latency: 800,
      },
    ] as never);
    const result = await getAnalyticsOverview("user-1", "30d");
    expect(result.avgLatencyMs).toBe(250);
    expect(result.p50Latency).toBe(200);
    expect(result.p95Latency).toBe(450);
    expect(result.p99Latency).toBe(800);
  });
});

describe("getDeliveryTimeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns timeline data from db", async () => {
    const mockData = [
      { bucket: new Date("2024-01-01T00:00:00Z"), totalCount: 50, successCount: 45, failedCount: 5 },
      { bucket: new Date("2024-01-01T01:00:00Z"), totalCount: 30, successCount: 28, failedCount: 2 },
    ];
    mockWhere.mockResolvedValueOnce(mockData as never);

    const result = await getDeliveryTimeline("user-1", "24h");
    expect(result).toEqual(mockData);
  });

  it("calls select for each range variant", async () => {
    mockWhere.mockResolvedValueOnce([] as never);
    await getDeliveryTimeline("user-1", "7d");
    expect(mockSelect).toHaveBeenCalled();

    vi.clearAllMocks();
    mockWhere.mockResolvedValueOnce([] as never);
    await getDeliveryTimeline("user-1", "30d");
    expect(mockSelect).toHaveBeenCalled();
  });

  it("passes endpoint filter when provided", async () => {
    mockWhere.mockResolvedValueOnce([] as never);
    await getDeliveryTimeline("user-1", "24h", "ep-1");
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("getStatusCodeBreakdown", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns status code counts", async () => {
    const mockData = [
      { statusCode: 200, count: 80 },
      { statusCode: 500, count: 12 },
      { statusCode: 404, count: 5 },
    ];
    mockWhere.mockResolvedValueOnce(mockData as never);

    const result = await getStatusCodeBreakdown("user-1", "7d");
    expect(result).toEqual(mockData);
  });

  it("returns empty array when no data", async () => {
    mockWhere.mockResolvedValueOnce([] as never);
    const result = await getStatusCodeBreakdown("user-1", "24h");
    expect(result).toEqual([]);
  });
});

describe("getLatencyHistogram", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns latency bucket data", async () => {
    const mockData = [
      { bucket: "0-50ms", count: 40, sortKey: 10 },
      { bucket: "50-100ms", count: 30, sortKey: 60 },
      { bucket: "100-200ms", count: 20, sortKey: 150 },
    ];
    mockWhere.mockResolvedValueOnce(mockData as never);

    const result = await getLatencyHistogram("user-1", "7d");
    expect(result).toEqual(mockData);
  });

  it("returns empty array when no data", async () => {
    mockWhere.mockResolvedValueOnce([] as never);
    const result = await getLatencyHistogram("user-1", "24h");
    expect(result).toEqual([]);
  });

  it("passes endpoint filter", async () => {
    mockWhere.mockResolvedValueOnce([] as never);
    await getLatencyHistogram("user-1", "7d", "ep-1");
    expect(mockSelect).toHaveBeenCalled();
  });
});

describe("getEndpointHealthSummary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns endpoint health with calculated success rate", async () => {
    const mockData = [
      {
        id: "ep-1",
        name: "Test Endpoint",
        url: "https://example.com/hook",
        status: "active",
        isActive: true,
        totalDeliveries: 100,
        successCount: 95,
        failedCount: 5,
        avgLatencyMs: 200,
        lastDeliveryAt: "2024-01-01T00:00:00Z",
      },
    ];
    const mockOrderBy = vi.fn().mockResolvedValue(mockData);
    const mockGroupByLocal = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhereJoin = vi.fn(() => ({ groupBy: mockGroupByLocal }));
    const mockLeftJoinFn = vi.fn(() => ({ where: mockWhereJoin }));
    const mockFromFn = vi.fn(() => ({ leftJoin: mockLeftJoinFn }));
    mockSelect.mockReturnValueOnce({ from: mockFromFn } as never);

    const result = await getEndpointHealthSummary("user-1", "7d");
    expect(result).toHaveLength(1);
    expect(result[0]!.successRate).toBe(95);
  });

  it("returns null successRate for endpoints with no deliveries", async () => {
    const mockData = [
      {
        id: "ep-2",
        name: "Quiet Endpoint",
        url: "https://example.com/quiet",
        status: "active",
        isActive: true,
        totalDeliveries: 0,
        successCount: 0,
        failedCount: 0,
        avgLatencyMs: null,
        lastDeliveryAt: null,
      },
    ];
    const mockOrderBy = vi.fn().mockResolvedValue(mockData);
    const mockGroupByLocal = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhereJoin = vi.fn(() => ({ groupBy: mockGroupByLocal }));
    const mockLeftJoinFn = vi.fn(() => ({ where: mockWhereJoin }));
    const mockFromFn = vi.fn(() => ({ leftJoin: mockLeftJoinFn }));
    mockSelect.mockReturnValueOnce({ from: mockFromFn } as never);

    const result = await getEndpointHealthSummary("user-1", "30d");
    expect(result).toHaveLength(1);
    expect(result[0]!.successRate).toBeNull();
  });

  it("handles multiple endpoints with different rates", async () => {
    const mockData = [
      {
        id: "ep-1",
        name: "Endpoint A",
        url: "https://a.com",
        status: "active",
        isActive: true,
        totalDeliveries: 50,
        successCount: 48,
        failedCount: 2,
        avgLatencyMs: 100,
        lastDeliveryAt: "2024-01-01T00:00:00Z",
      },
      {
        id: "ep-2",
        name: "Endpoint B",
        url: "https://b.com",
        status: "degraded",
        isActive: true,
        totalDeliveries: 50,
        successCount: 35,
        failedCount: 15,
        avgLatencyMs: 500,
        lastDeliveryAt: "2024-01-01T00:00:00Z",
      },
    ];
    const mockOrderBy = vi.fn().mockResolvedValue(mockData);
    const mockGroupByLocal = vi.fn(() => ({ orderBy: mockOrderBy }));
    const mockWhereJoin = vi.fn(() => ({ groupBy: mockGroupByLocal }));
    const mockLeftJoinFn = vi.fn(() => ({ where: mockWhereJoin }));
    const mockFromFn = vi.fn(() => ({ leftJoin: mockLeftJoinFn }));
    mockSelect.mockReturnValueOnce({ from: mockFromFn } as never);

    const result = await getEndpointHealthSummary("user-1", "7d");
    expect(result).toHaveLength(2);
    expect(result[0]!.successRate).toBe(96);
    expect(result[1]!.successRate).toBe(70);
  });
});
