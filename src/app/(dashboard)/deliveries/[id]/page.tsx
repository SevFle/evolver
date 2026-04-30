"use client";

import { useState, useEffect, use } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { DeliveryStatusBadge } from "@/components/dashboard/status-badges";

interface DeliveryDetailData {
  id: string;
  status: string;
  attemptNumber: number;
  maxAttempts: number;
  responseStatusCode: number | null;
  responseHeaders: Record<string, string> | null;
  responseBody: string | null;
  requestHeaders: Record<string, string> | null;
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

function JsonBlock({
  data,
  defaultOpen = false,
}: {
  data: unknown;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="mb-2 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {open ? "Collapse" : "Expand"}
      </button>
      {open && (
        <pre className="max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
          {typeof data === "string"
            ? data
            : JSON.stringify(data, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function DeliveryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [delivery, setDelivery] = useState<DeliveryDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await trpc.deliveries.get.query({ id });
        setDelivery(data as DeliveryDetailData | null);
      } catch {
        setError("Failed to load delivery");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (error || !delivery) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Delivery Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error ?? "This delivery does not exist or you do not have access."}
        </p>
        <a href="/deliveries" className="mt-4 inline-block text-sm underline">
          Back to Deliveries
        </a>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold">Delivery Details</h1>
            <DeliveryStatusBadge status={delivery.status} />
            {delivery.isReplay && <Badge variant="outline">Replay</Badge>}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Attempt {delivery.attemptNumber} of {delivery.maxAttempts}
          </p>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Delivery Info</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">ID</dt>
                <dd className="mt-0.5 font-mono text-xs">{delivery.id}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Status</dt>
                <dd className="mt-0.5">
                  <DeliveryStatusBadge status={delivery.status} />
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Response</dt>
                <dd className="mt-0.5">
                  {delivery.responseStatusCode !== null ? (
                    <Badge
                      variant={
                        delivery.responseStatusCode >= 200 &&
                        delivery.responseStatusCode < 300
                          ? "success"
                          : delivery.responseStatusCode >= 400 &&
                              delivery.responseStatusCode < 500
                            ? "warning"
                            : "destructive"
                      }
                    >
                      HTTP {delivery.responseStatusCode}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground">No response</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Duration</dt>
                <dd className="mt-0.5">
                  {delivery.durationMs !== null
                    ? `${delivery.durationMs}ms`
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Created</dt>
                <dd className="mt-0.5">
                  {delivery.createdAt
                    ? new Date(delivery.createdAt).toLocaleString()
                    : "—"}
                </dd>
              </div>
              {delivery.completedAt && (
                <div>
                  <dt className="font-medium text-muted-foreground">
                    Completed
                  </dt>
                  <dd className="mt-0.5">
                    {new Date(delivery.completedAt).toLocaleString()}
                  </dd>
                </div>
              )}
              {delivery.nextRetryAt && (
                <div>
                  <dt className="font-medium text-muted-foreground">
                    Next Retry
                  </dt>
                  <dd className="mt-0.5">
                    {new Date(delivery.nextRetryAt).toLocaleString()}
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Event</CardTitle>
            <CardDescription>
              <a
                href={`/events/${delivery.eventId}`}
                className="hover:underline"
              >
                View event
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">Type</dt>
                <dd className="mt-0.5">{delivery.eventType}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">Event ID</dt>
                <dd className="mt-0.5 font-mono text-xs">
                  {delivery.eventId}
                </dd>
              </div>
              {delivery.eventPayload && (
                <div>
                  <dt className="font-medium text-muted-foreground">Payload</dt>
                  <dd className="mt-1">
                    <JsonBlock data={delivery.eventPayload} defaultOpen={false} />
                  </dd>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Endpoint</CardTitle>
            <CardDescription>
              <a
                href={`/endpoints/${delivery.endpointId}`}
                className="hover:underline"
              >
                View endpoint
              </a>
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="font-medium text-muted-foreground">Name</dt>
                <dd className="mt-0.5">{delivery.endpointName}</dd>
              </div>
              <div>
                <dt className="font-medium text-muted-foreground">URL</dt>
                <dd className="mt-0.5 truncate font-mono text-xs">
                  {delivery.endpointUrl}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>
      </div>

      {delivery.errorMessage && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="whitespace-pre-wrap rounded-md bg-red-50 p-3 text-sm text-red-800">
              {delivery.errorMessage}
            </pre>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        {delivery.requestHeaders &&
          Object.keys(delivery.requestHeaders).length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Request Headers</CardTitle>
                <CardDescription>
                  Headers sent to the endpoint (including HMAC signature)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <JsonBlock data={delivery.requestHeaders} defaultOpen={true} />
              </CardContent>
            </Card>
          )}

        {(delivery.responseHeaders || delivery.responseBody) && (
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Response</CardTitle>
              <CardDescription>
                {delivery.responseStatusCode !== null
                  ? `HTTP ${delivery.responseStatusCode}`
                  : "No response received"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {delivery.responseHeaders &&
                Object.keys(delivery.responseHeaders).length > 0 && (
                  <div>
                    <p className="mb-1 text-xs font-medium text-muted-foreground">
                      Headers
                    </p>
                    <JsonBlock
                      data={delivery.responseHeaders}
                      defaultOpen={true}
                    />
                  </div>
                )}
              {delivery.responseBody && (
                <div>
                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                    Body
                  </p>
                  <JsonBlock data={delivery.responseBody} defaultOpen={true} />
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-6">
        <a href="/deliveries" className="text-sm underline">
          Back to Deliveries
        </a>
      </div>
    </div>
  );
}
