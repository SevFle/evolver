"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DeliveryTimelineChart } from "@/components/charts/delivery-timeline-chart";
import { StatusCodeChart } from "@/components/charts/status-code-chart";
import { LatencyHistogramChart } from "@/components/charts/latency-histogram-chart";
import { EndpointHealthTable } from "@/components/dashboard/endpoint-health-table";

type TimeRange = "24h" | "7d" | "30d";

interface Overview {
  totalDeliveries: number;
  successful: number;
  failed: number;
  pending: number;
  successRate: number | null;
  avgLatencyMs: number | null;
  p50Latency: number | null;
  p95Latency: number | null;
  p99Latency: number | null;
}

interface TimelinePoint {
  bucket: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
}

interface StatusCodePoint {
  statusCode: number | null;
  count: number;
}

interface LatencyBucket {
  bucket: string;
  count: number;
  sortKey: number;
}

interface EndpointHealth {
  id: string;
  name: string;
  url: string;
  status: string;
  isActive: boolean;
  totalDeliveries: number;
  successCount: number;
  failedCount: number;
  avgLatencyMs: number | null;
  lastDeliveryAt: string | null;
  successRate: number | null;
}

interface EndpointOption {
  id: string;
  name: string;
  url: string;
}

const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: "24h", label: "24 Hours" },
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
];

function StatCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {sub && (
          <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function AnalyticsPage() {
  const [range, setRange] = useState<TimeRange>("7d");
  const [endpointId, setEndpointId] = useState<string>("");
  const [endpointOptions, setEndpointOptions] = useState<EndpointOption[]>([]);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [timeline, setTimeline] = useState<TimelinePoint[]>([]);
  const [statusCodes, setStatusCodes] = useState<StatusCodePoint[]>([]);
  const [latency, setLatency] = useState<LatencyBucket[]>([]);
  const [endpointHealth, setEndpointHealth] = useState<EndpointHealth[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadEndpoints() {
      try {
        const opts = await trpc.deliveries.filterOptions.query();
        setEndpointOptions((opts.endpoints as EndpointOption[]) ?? []);
      } catch {
        // silently fail
      }
    }
    loadEndpoints();
  }, []);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    const input = { range, endpointId: endpointId || undefined };
    try {
      const [ov, tl, sc, lh, eh] = await Promise.all([
        trpc.analytics.overview.query(input),
        trpc.analytics.timeline.query(input),
        trpc.analytics.statusCodes.query(input),
        trpc.analytics.latencyHistogram.query(input),
        trpc.analytics.endpointHealth.query({ range }),
      ]);
      setOverview(ov as Overview);
      setTimeline(tl as TimelinePoint[]);
      setStatusCodes(sc as StatusCodePoint[]);
      setLatency(lh as LatencyBucket[]);
      setEndpointHealth(eh as EndpointHealth[]);
    } catch {
      setError("Failed to load analytics data");
    } finally {
      setLoading(false);
    }
  }, [range, endpointId]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Analytics</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Delivery rates, latency, and error breakdowns
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Time Range
          </label>
          <div className="flex rounded-md border">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                onClick={() => setRange(tr.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                  range === tr.value
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted"
                }`}
              >
                {tr.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Endpoint
          </label>
          <select
            value={endpointId}
            onChange={(e) => setEndpointId(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">All endpoints</option>
            {endpointOptions.map((ep) => (
              <option key={ep.id} value={ep.id}>
                {ep.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading && !overview ? (
        <div className="mt-8 py-12 text-center text-muted-foreground">
          Loading analytics...
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total Deliveries"
              value={String(overview?.totalDeliveries ?? 0)}
              sub={`${overview?.successful ?? 0} ok, ${overview?.failed ?? 0} failed, ${overview?.pending ?? 0} pending`}
            />
            <StatCard
              label="Success Rate"
              value={overview?.successRate !== null && overview?.successRate !== undefined
                ? `${overview.successRate}%`
                : "—"}
              sub={overview?.successRate !== null && overview?.successRate !== undefined
                ? overview.successRate >= 95
                  ? "Healthy"
                  : overview.successRate >= 80
                    ? "Degraded"
                    : "Needs attention"
                : undefined}
            />
            <StatCard
              label="Avg Latency"
              value={overview?.avgLatencyMs !== null && overview?.avgLatencyMs !== undefined
                ? `${overview.avgLatencyMs}ms`
                : "—"}
              sub={
                overview?.p50Latency !== null
                  ? `p50: ${overview?.p50Latency ?? "—"}ms`
                  : undefined
              }
            />
            <StatCard
              label="P95 / P99 Latency"
              value={
                overview?.p95Latency !== null || overview?.p99Latency !== null
                  ? `${overview?.p95Latency ?? "—"} / ${overview?.p99Latency ?? "—"}ms`
                  : "—"
              }
              sub="95th / 99th percentile"
            />
          </div>

          <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Delivery Timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <DeliveryTimelineChart data={timeline} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Latency Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <LatencyHistogramChart data={latency} />
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Status Code Breakdown</CardTitle>
              </CardHeader>
              <CardContent>
                <StatusCodeChart data={statusCodes} />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Endpoint Health</CardTitle>
              </CardHeader>
              <CardContent>
                <EndpointHealthTable data={endpointHealth} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
