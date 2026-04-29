"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { EndpointStatusBadge } from "@/components/dashboard/status-badges";
import { EndpointFormDialog } from "@/components/dashboard/endpoint-form-dialog";
import { DeleteEndpointDialog } from "@/components/dashboard/delete-endpoint-dialog";

interface EndpointWithStats {
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

export default function EndpointsPage() {
  const [endpoints, setEndpoints] = useState<EndpointWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingEndpoint, setEditingEndpoint] =
    useState<EndpointWithStats | null>(null);
  const [deletingEndpoint, setDeletingEndpoint] =
    useState<EndpointWithStats | null>(null);

  async function loadEndpoints() {
    try {
      const data = await trpc.endpoints.listWithStats.query();
      setEndpoints((data as EndpointWithStats[]) ?? []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEndpoints();
  }, []);

  async function handleCreated() {
    setShowCreate(false);
    await loadEndpoints();
  }

  async function handleUpdated() {
    setEditingEndpoint(null);
    await loadEndpoints();
  }

  async function handleDeleted() {
    setDeletingEndpoint(null);
    await loadEndpoints();
  }

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">Loading...</div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Endpoints</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manage your webhook destination endpoints
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>Add endpoint</Button>
      </div>

      {endpoints.length === 0 ? (
        <div className="mt-8 rounded-lg border">
          <div className="p-8 text-center text-muted-foreground">
            No endpoints yet. Create your first endpoint to start sending
            webhooks.
          </div>
        </div>
      ) : (
        <div className="mt-8 space-y-4">
          {endpoints.map((ep) => (
            <div
              key={ep.id}
              className="rounded-lg border p-5 transition-colors hover:bg-muted/30"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <a
                      href={`/endpoints/${ep.id}`}
                      className="text-base font-semibold hover:underline"
                    >
                      {ep.name}
                    </a>
                    <EndpointStatusBadge status={ep.status} />
                    {!ep.isActive && (
                      <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-800">
                        Inactive
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-sm text-muted-foreground">
                    {ep.url}
                  </p>
                  {ep.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {ep.description}
                    </p>
                  )}
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setEditingEndpoint(ep)}
                  >
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setDeletingEndpoint(ep)}
                  >
                    Delete
                  </Button>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Success Rate
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {ep.stats.successRate !== null
                      ? `${ep.stats.successRate}%`
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Total Deliveries
                  </p>
                  <p className="mt-0.5 text-sm font-semibold">
                    {ep.stats.totalDeliveries}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Last Delivery
                  </p>
                  <p className="mt-0.5 text-sm">
                    {ep.stats.lastDeliveryAt
                      ? new Date(ep.stats.lastDeliveryAt).toLocaleString()
                      : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">
                    Avg Latency
                  </p>
                  <p className="mt-0.5 text-sm">
                    {ep.stats.avgDurationMs !== null
                      ? `${ep.stats.avgDurationMs}ms`
                      : "—"}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <EndpointFormDialog
          open={showCreate}
          onOpenChange={setShowCreate}
          onSuccess={handleCreated}
        />
      )}

      {editingEndpoint && (
        <EndpointFormDialog
          open={!!editingEndpoint}
          onOpenChange={(open: boolean) => {
            if (!open) setEditingEndpoint(null);
          }}
          endpoint={editingEndpoint}
          onSuccess={handleUpdated}
        />
      )}

      {deletingEndpoint && (
        <DeleteEndpointDialog
          open={!!deletingEndpoint}
          onOpenChange={(open: boolean) => {
            if (!open) setDeletingEndpoint(null);
          }}
          endpoint={deletingEndpoint}
          onSuccess={handleDeleted}
        />
      )}
    </div>
  );
}
