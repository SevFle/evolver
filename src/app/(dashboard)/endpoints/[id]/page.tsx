"use client";

import { useState, useEffect, useCallback, use } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { EndpointStatusBadge, DeliveryStatusBadge } from "@/components/dashboard/status-badges";
import { EndpointFormDialog } from "@/components/dashboard/endpoint-form-dialog";
import { DeleteEndpointDialog } from "@/components/dashboard/delete-endpoint-dialog";
import Link from "next/link";

interface EndpointDetail {
  id: string;
  url: string;
  name: string;
  description: string | null;
  status: string;
  customHeaders: Record<string, string> | null;
  isActive: boolean;
  disabledReason: string | null;
  consecutiveFailures: number;
  maxRetries: number;
  retrySchedule: number[] | null;
  rateLimit: number | null;
  createdAt: string;
  updatedAt: string;
  stats: {
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    successRate: number | null;
    lastDeliveryAt: string | null;
    avgDurationMs: number | null;
  };
}

interface DeliveryRecord {
  id: string;
  status: string;
  attemptNumber: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  isReplay: boolean;
  createdAt: string;
}

export default function EndpointDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [endpoint, setEndpoint] = useState<EndpointDetail | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showSecret, setShowSecret] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const [endpointData, deliveryData] = await Promise.all([
        trpc.endpoints.getWithStats.query({ id }),
        trpc.endpoints.getDeliveries.query({ id }),
      ]);
      setEndpoint(endpointData as EndpointDetail | null);
      setDeliveries((deliveryData as DeliveryRecord[]) ?? []);
    } catch {
      setError("Failed to load endpoint");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function handleRevealSecret() {
    setRevealing(true);
    setError(null);
    try {
      const result = await trpc.endpoints.revealSecret.query({ id, confirm: true });
      setRevealedSecret(result.signingSecret);
      setShowSecret(true);
    } catch {
      setError("Failed to reveal secret");
    } finally {
      setRevealing(false);
    }
  }

  async function handleRotateSecret() {
    if (!confirm("Are you sure? Rotating the secret will invalidate the current signing key.")) return;
    setRotating(true);
    setError(null);
    try {
      const result = await trpc.endpoints.rotateSecret.mutate({ id });
      setNewSecret(result.signingSecret);
      setRevealedSecret(null);
      setShowSecret(true);
    } catch {
      setError("Failed to rotate secret");
    } finally {
      setRotating(false);
    }
  }

  async function handleUpdated() {
    setEditing(false);
    setLoading(true);
    await loadData();
  }

  function handleDeleted() {
    window.location.href = "/endpoints";
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (!endpoint) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Endpoint Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This endpoint does not exist or you do not have access.
        </p>
        <Link href="/endpoints" className="mt-4 inline-block text-sm underline">
          Back to Endpoints
        </Link>
      </div>
    );
  }

  const secret = newSecret ?? revealedSecret;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">{endpoint.name}</h1>
            <EndpointStatusBadge status={endpoint.status} />
          </div>
          <p className="mt-1 text-sm font-mono text-muted-foreground">
            {endpoint.url}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditing(true)}>
            Edit
          </Button>
          <Button
            variant="outline"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleting(true)}
          >
            Delete
          </Button>
        </div>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {newSecret && (
        <div className="mt-4 rounded-md bg-yellow-50 p-3 text-sm text-yellow-800">
          New signing secret generated. Make sure to update your verification
          code. This will only be shown once.
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Success Rate
          </p>
          <p className="mt-1 text-2xl font-bold">
            {endpoint.stats.successRate !== null
              ? `${endpoint.stats.successRate}%`
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Total Deliveries
          </p>
          <p className="mt-1 text-2xl font-bold">
            {endpoint.stats.totalDeliveries}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Last Delivery
          </p>
          <p className="mt-1 text-sm">
            {endpoint.stats.lastDeliveryAt
              ? new Date(endpoint.stats.lastDeliveryAt).toLocaleString()
              : "—"}
          </p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs font-medium text-muted-foreground">
            Avg Latency
          </p>
          <p className="mt-1 text-2xl font-bold">
            {endpoint.stats.avgDurationMs !== null
              ? `${endpoint.stats.avgDurationMs}ms`
              : "—"}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Configuration</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Max Retries</dt>
                <dd className="font-medium">{endpoint.maxRetries}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Retry Schedule</dt>
                <dd className="font-mono text-xs">
                  {endpoint.retrySchedule?.join("s, ")}s
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Rate Limit</dt>
                <dd className="font-medium">
                  {endpoint.rateLimit
                    ? `${endpoint.rateLimit} req/min`
                    : "Unlimited"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Active</dt>
                <dd className="font-medium">
                  {endpoint.isActive ? "Yes" : "No"}
                </dd>
              </div>
              {endpoint.disabledReason && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Disabled Reason</dt>
                  <dd className="font-medium text-destructive">
                    {endpoint.disabledReason}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Created</dt>
                <dd>
                  {new Date(endpoint.createdAt).toLocaleString()}
                </dd>
              </div>
              {endpoint.description && (
                <div>
                  <dt className="text-muted-foreground">Description</dt>
                  <dd className="mt-1">{endpoint.description}</dd>
                </div>
              )}
              {endpoint.customHeaders &&
                Object.keys(endpoint.customHeaders).length > 0 && (
                  <div>
                    <dt className="text-muted-foreground">Custom Headers</dt>
                    <dd className="mt-1">
                      {Object.entries(endpoint.customHeaders).map(
                        ([key, value]) => (
                          <div
                            key={key}
                            className="rounded border px-2 py-1 text-xs font-mono mt-1"
                          >
                            {key}: {value}
                          </div>
                        ),
                      )}
                    </dd>
                  </div>
                )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg">Signing Secret</CardTitle>
                <CardDescription>
                  Used to verify webhook payloads (HMAC-SHA256)
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRotateSecret}
                disabled={rotating}
              >
                {rotating ? "Rotating..." : "Rotate"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {showSecret && secret ? (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted p-3 text-xs font-mono break-all">
                  {secret}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSecret(false)}
                >
                  Hide
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <code className="flex-1 rounded-md bg-muted p-3 text-xs font-mono">
                  {"•".repeat(36)}
                </code>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRevealSecret}
                  disabled={revealing}
                >
                  {revealing ? "Loading..." : "Reveal"}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Recent Deliveries</h2>
        {deliveries.length === 0 ? (
          <div className="mt-4 rounded-lg border">
            <div className="p-6 text-center text-sm text-muted-foreground">
              No deliveries yet.
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {deliveries.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between rounded-lg border p-4"
              >
                <div className="flex items-center gap-4">
                  <DeliveryStatusBadge status={d.status} />
                  <span className="text-sm text-muted-foreground">
                    Attempt #{d.attemptNumber}
                  </span>
                  {d.isReplay && (
                    <span className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-800">
                      Replay
                    </span>
                  )}
                  {d.responseStatusCode !== null && (
                    <span className="text-sm text-muted-foreground">
                      HTTP {d.responseStatusCode}
                    </span>
                  )}
                  {d.durationMs !== null && (
                    <span className="text-sm text-muted-foreground">
                      {d.durationMs}ms
                    </span>
                  )}
                  {d.errorMessage && (
                    <span
                      className="max-w-xs truncate text-sm text-destructive"
                      title={d.errorMessage}
                    >
                      {d.errorMessage}
                    </span>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(d.createdAt).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <Link href="/endpoints" className="text-sm underline">
          Back to Endpoints
        </Link>
      </div>

      {editing && (
        <EndpointFormDialog
          open={editing}
          onOpenChange={(open: boolean) => setEditing(open)}
          endpoint={endpoint}
          onSuccess={handleUpdated}
        />
      )}

      {deleting && (
        <DeleteEndpointDialog
          open={deleting}
          onOpenChange={(open: boolean) => setDeleting(open)}
          endpoint={endpoint}
          onSuccess={handleDeleted}
        />
      )}
    </div>
  );
}
