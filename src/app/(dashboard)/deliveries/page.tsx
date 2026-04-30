"use client";

import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { DeliveryStatusBadge } from "@/components/dashboard/status-badges";

interface DeliveryRow {
  id: string;
  status: string;
  attemptNumber: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  isReplay: boolean;
  createdAt: string | null;
  completedAt: string | null;
  nextRetryAt: string | null;
  eventId: string;
  endpointId: string;
  eventType: string;
  eventPayload: Record<string, unknown> | null;
  endpointName: string;
  endpointUrl: string;
}

interface FilterOption {
  id: string;
  name: string;
  url: string;
}

const STATUS_OPTIONS = [
  "pending",
  "processing",
  "success",
  "failed",
  "retry_scheduled",
  "circuit_open",
  "dead_letter",
] as const;

function formatRelativeTime(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const seconds = Math.floor(diffMs / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function HttpStatusBadge({ code }: { code: number | null }) {
  if (code === null) return <span className="text-muted-foreground">—</span>;
  let variant: "success" | "warning" | "destructive" | "secondary" = "secondary";
  if (code >= 200 && code < 300) variant = "success";
  else if (code >= 400 && code < 500) variant = "warning";
  else if (code >= 500 || code === 0) variant = "destructive";
  return <Badge variant={variant}>{code}</Badge>;
}

export default function DeliveriesPage() {
  const [deliveries, setDeliveries] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string[]>([]);
  const [endpointFilter, setEndpointFilter] = useState<string>("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [endpointOptions, setEndpointOptions] = useState<FilterOption[]>([]);

  useEffect(() => {
    async function loadFilterOptions() {
      try {
        const opts = await trpc.deliveries.filterOptions.query();
        setEndpointOptions((opts.endpoints as FilterOption[]) ?? []);
      } catch {
        // silently fail
      }
    }
    loadFilterOptions();
  }, []);

  const loadDeliveries = useCallback(
    async (append = false) => {
      if (!append) setLoading(true);
      setError(null);
      try {
        const result = await trpc.deliveries.list.query({
          status: statusFilter.length > 0 ? (statusFilter as Array<"pending" | "processing" | "success" | "failed" | "retry_scheduled" | "circuit_open" | "dead_letter">) : undefined,
          endpointId: endpointFilter || undefined,
          from: dateFrom || undefined,
          to: dateTo || undefined,
          cursor: append ? cursor : undefined,
          limit: 50,
        });
        const data = result as {
          items: DeliveryRow[];
          nextCursor: string | null;
        };
        setDeliveries((prev) =>
          append ? [...prev, ...(data.items ?? [])] : (data.items ?? []),
        );
        setNextCursor(data.nextCursor);
        if (data.items && data.items.length > 0 && data.nextCursor) {
          setCursor(data.nextCursor);
        }
      } catch {
        setError("Failed to load deliveries");
      } finally {
        setLoading(false);
      }
    },
    [statusFilter, endpointFilter, dateFrom, dateTo, cursor],
  );

  useEffect(() => {
    setCursor(undefined);
    setNextCursor(null);
    loadDeliveries(false);
  }, [statusFilter, endpointFilter, dateFrom, dateTo]);

  function toggleStatus(status: string) {
    setStatusFilter((prev) =>
      prev.includes(status)
        ? prev.filter((s) => s !== status)
        : [...prev, status],
    );
  }

  function clearFilters() {
    setStatusFilter([]);
    setEndpointFilter("");
    setDateFrom("");
    setDateTo("");
  }

  const hasActiveFilters =
    statusFilter.length > 0 ||
    endpointFilter !== "" ||
    dateFrom !== "" ||
    dateTo !== "";

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Deliveries</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Monitor webhook delivery status and inspect payloads
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">Status:</span>
          {STATUS_OPTIONS.map((status) => (
            <button
              key={status}
              onClick={() => toggleStatus(status)}
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                statusFilter.includes(status)
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
              }`}
            >
              {status.replace(/_/g, " ")}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              Endpoint
            </label>
            <select
              value={endpointFilter}
              onChange={(e) => setEndpointFilter(e.target.value)}
              className="h-10 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">All endpoints</option>
              {endpointOptions.map((ep) => (
                <option key={ep.id} value={ep.id}>
                  {ep.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              From
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">
              To
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10"
            />
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear filters
            </Button>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="mt-6">
        {loading && deliveries.length === 0 ? (
          <div className="py-12 text-center text-muted-foreground">
            Loading...
          </div>
        ) : deliveries.length === 0 ? (
          <div className="rounded-lg border">
            <div className="p-8 text-center text-muted-foreground">
              {hasActiveFilters
                ? "No deliveries match your filters."
                : "No deliveries yet. Send your first event to see deliveries here."}
            </div>
          </div>
        ) : (
          <>
            <div className="rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Status</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Endpoint</TableHead>
                    <TableHead>Response</TableHead>
                    <TableHead>Duration</TableHead>
                    <TableHead>Time</TableHead>
                    <TableHead className="w-12" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveries.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <DeliveryStatusBadge status={d.status} />
                          {d.isReplay && (
                            <Badge variant="outline">Replay</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <a
                          href={`/events/${d.eventId}`}
                          className="font-medium hover:underline"
                        >
                          {d.eventType}
                        </a>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">{d.endpointName}</span>
                      </TableCell>
                      <TableCell>
                        <HttpStatusBadge code={d.responseStatusCode} />
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground">
                          {d.durationMs !== null ? `${d.durationMs}ms` : "—"}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span
                          className="text-sm text-muted-foreground"
                          title={d.createdAt ? new Date(d.createdAt).toLocaleString() : undefined}
                        >
                          {formatRelativeTime(d.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <a href={`/deliveries/${d.id}`}>
                          <Button variant="ghost" size="sm">
                            View
                          </Button>
                        </a>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {nextCursor && (
              <div className="mt-4 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => loadDeliveries(true)}
                  disabled={loading}
                >
                  {loading ? "Loading..." : "Load more"}
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
