"use client";

import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EventStatusBadge } from "@/components/dashboard/status-badges";

interface EventRow {
  id: string;
  eventType: string;
  status: string;
  payload: Record<string, unknown>;
  source: string | null;
  createdAt: string;
  endpointId: string | null;
}

function formatRelativeTime(date: string): string {
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

export default function EventsPage() {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const data = await trpc.events.list.query();
        setEvents((data as EventRow[]) ?? []);
      } catch {
        setError("Failed to load events");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="py-12 text-center text-muted-foreground">Loading...</div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Events</h1>
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div>
        <h1 className="text-2xl font-bold">Events</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          View and inspect all webhook events
        </p>
      </div>

      {events.length === 0 ? (
        <div className="mt-8 rounded-lg border">
          <div className="p-8 text-center text-muted-foreground">
            No events yet. Send your first event via the API.
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    <EventStatusBadge status={event.status} />
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{event.eventType}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {event.source ?? "—"}
                    </span>
                  </TableCell>
                  <TableCell>
                    <span
                      className="text-sm text-muted-foreground"
                      title={new Date(event.createdAt).toLocaleString()}
                    >
                      {formatRelativeTime(event.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>
                    <a href={`/events/${event.id}`}>
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
      )}
    </div>
  );
}
