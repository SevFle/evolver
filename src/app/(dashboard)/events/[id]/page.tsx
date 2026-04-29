"use client";

import { useState, useEffect, use } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import { DeliveryStatusBadge } from "@/components/dashboard/status-badges";
import Link from "next/link";

interface EventDetail {
  id: string;
  endpointId: string;
  eventType: string;
  payload: Record<string, unknown>;
  metadata: Record<string, unknown>;
  source: string | null;
  status: string;
  replayedFromEventId: string | null;
  createdAt: string;
}

interface DeliveryDetail {
  id: string;
  status: string;
  attemptNumber: number;
  responseStatusCode: number | null;
  errorMessage: string | null;
  durationMs: number | null;
  isReplay: boolean;
  createdAt: string;
}

export default function EventDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [deliveries, setDeliveries] = useState<DeliveryDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [replaying, setReplaying] = useState(false);
  const [replayResult, setReplayResult] = useState<{
    id: string;
    eventType: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [eventData, deliveryData] = await Promise.all([
          trpc.events.get.query({ id }),
          trpc.deliveries.listByEvent.query({ eventId: id }),
        ]);
        setEvent(eventData as EventDetail | null);
        setDeliveries((deliveryData as DeliveryDetail[]) ?? []);
      } catch {
        setError("Failed to load event");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  async function handleReplay() {
    setReplaying(true);
    setError(null);
    setReplayResult(null);
    try {
      const result = await trpc.events.replay.mutate({ eventId: id });
      setReplayResult({
        id: result.id,
        eventType: result.eventType,
      });
    } catch {
      setError("Failed to replay event");
    } finally {
      setReplaying(false);
    }
  }

  if (loading) {
    return (
      <div className="text-center text-muted-foreground py-12">Loading...</div>
    );
  }

  if (!event) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Event Not Found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This event does not exist or you do not have access.
        </p>
        <Link href="/events" className="mt-4 inline-block text-sm underline">
          Back to Events
        </Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Event Details</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {event.eventType}
          </p>
        </div>
        <Button onClick={handleReplay} disabled={replaying}>
          {replaying ? "Replaying..." : "Replay Event"}
        </Button>
      </div>

      {error && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {replayResult && (
        <div className="mt-4 rounded-md bg-green-50 p-3 text-sm text-green-700">
          Event replayed successfully.           New event ID:{" "}
          <a
            href={`/events/${replayResult.id}`}
            className="underline font-medium"
          >
            {replayResult.id}
          </a>
        </div>
      )}

      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="text-lg">Event Information</CardTitle>
          <CardDescription>ID: {event.id}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <dt className="font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1">
                <DeliveryStatusBadge status={event.status} />
              </dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Type</dt>
              <dd className="mt-1">{event.eventType}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Source</dt>
              <dd className="mt-1">{event.source ?? "—"}</dd>
            </div>
            <div>
              <dt className="font-medium text-muted-foreground">Created</dt>
              <dd className="mt-1">
                {new Date(event.createdAt).toLocaleString()}
              </dd>
            </div>
            {event.replayedFromEventId && (
              <div className="col-span-2">
                <dt className="font-medium text-muted-foreground">
                  Replayed From
                </dt>
                <dd className="mt-1">
                  <a
                    href={`/events/${event.replayedFromEventId}`}
                    className="underline text-primary"
                  >
                    {event.replayedFromEventId}
                  </a>
                </dd>
              </div>
            )}
            <div className="col-span-2">
              <dt className="font-medium text-muted-foreground">Payload</dt>
              <dd className="mt-1">
                <pre className="rounded-md bg-muted p-3 text-xs overflow-auto max-h-64">
                  {JSON.stringify(event.payload, null, 2)}
                </pre>
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <div className="mt-6">
        <h2 className="text-lg font-semibold">Delivery Attempts</h2>
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
        <Link href="/events" className="text-sm underline">
          Back to Events
        </Link>
      </div>
    </div>
  );
}
