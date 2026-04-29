"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface EndpointFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
  endpoint?: {
    id: string;
    url: string;
    name: string;
    description: string | null;
    customHeaders: Record<string, string> | null;
    maxRetries: number;
    retrySchedule: number[] | null;
    rateLimit: number | null;
  } | null;
}

export function EndpointFormDialog({
  open,
  onOpenChange,
  onSuccess,
  endpoint,
}: EndpointFormDialogProps) {
  const isEditing = !!endpoint;

  const [url, setUrl] = useState(endpoint?.url ?? "");
  const [name, setName] = useState(endpoint?.name ?? "");
  const [description, setDescription] = useState(
    endpoint?.description ?? "",
  );
  const [maxRetries, setMaxRetries] = useState(
    endpoint?.maxRetries ?? 5,
  );
  const [retrySchedule, setRetrySchedule] = useState(
    endpoint?.retrySchedule?.join(", ") ?? "60, 300, 1800, 7200, 43200",
  );
  const [headerKey, setHeaderKey] = useState("");
  const [headerValue, setHeaderValue] = useState("");
  const [headers, setHeaders] = useState<Record<string, string>>(
    endpoint?.customHeaders ?? {},
  );
  const [rateLimit, setRateLimit] = useState(
    endpoint?.rateLimit?.toString() ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addHeader() {
    if (!headerKey.trim()) return;
    setHeaders((prev) => ({ ...prev, [headerKey.trim()]: headerValue }));
    setHeaderKey("");
    setHeaderValue("");
  }

  function removeHeader(key: string) {
    setHeaders((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const parsedSchedule = retrySchedule
        .split(",")
        .map((s) => parseInt(s.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 0);

      const data = {
        url,
        name: name || undefined,
        description: description || undefined,
        customHeaders:
          Object.keys(headers).length > 0 ? headers : undefined,
        maxRetries,
        retrySchedule: parsedSchedule.length > 0 ? parsedSchedule : undefined,
        rateLimit: rateLimit ? parseInt(rateLimit, 10) : undefined,
      };

      if (isEditing && endpoint) {
        await trpc.endpoints.updateConfig.mutate({
          id: endpoint.id,
          ...data,
          rateLimit: rateLimit ? parseInt(rateLimit, 10) : null,
          description: description || undefined,
        });
      } else {
        await trpc.endpoints.create.mutate(data);
      }
      onSuccess();
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Failed to save endpoint";
      setError(message);
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-50 w-full max-w-2xl rounded-lg border bg-background p-6 shadow-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">
            {isEditing ? "Edit Endpoint" : "Create Endpoint"}
          </h2>
          <button
            className="rounded-sm opacity-70 hover:opacity-100"
            onClick={() => onOpenChange(false)}
            type="button"
          >
            <span className="sr-only">Close</span>
            &times;
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1.5">
              Webhook URL <span className="text-destructive">*</span>
            </label>
            <Input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com/webhooks"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The URL where webhook payloads will be delivered
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">Name</label>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My API Endpoint"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              A friendly name to identify this endpoint
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Description
            </label>
            <textarea
              className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What this endpoint is used for..."
              maxLength={500}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Custom Headers
            </label>
            <div className="flex gap-2">
              <Input
                type="text"
                value={headerKey}
                onChange={(e) => setHeaderKey(e.target.value)}
                placeholder="Header name"
                className="flex-1"
              />
              <Input
                type="text"
                value={headerValue}
                onChange={(e) => setHeaderValue(e.target.value)}
                placeholder="Header value"
                className="flex-1"
              />
              <Button type="button" variant="outline" onClick={addHeader}>
                Add
              </Button>
            </div>
            {Object.keys(headers).length > 0 && (
              <div className="mt-2 space-y-1">
                {Object.entries(headers).map(([key, value]) => (
                  <div
                    key={key}
                    className="flex items-center justify-between rounded border px-3 py-1.5 text-sm"
                  >
                    <span>
                      <span className="font-mono text-xs">{key}</span>:{" "}
                      <span className="text-muted-foreground">{value}</span>
                    </span>
                    <button
                      type="button"
                      className="text-destructive hover:text-destructive/80"
                      onClick={() => removeHeader(key)}
                    >
                      &times;
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Max Retries
              </label>
              <Input
                type="number"
                value={maxRetries}
                onChange={(e) =>
                  setMaxRetries(parseInt(e.target.value, 10) || 0)
                }
                min={0}
                max={10}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">
                Rate Limit (req/min)
              </label>
              <Input
                type="number"
                value={rateLimit}
                onChange={(e) => setRateLimit(e.target.value)}
                placeholder="Unlimited"
                min={1}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1.5">
              Retry Schedule (seconds)
            </label>
            <Input
              type="text"
              value={retrySchedule}
              onChange={(e) => setRetrySchedule(e.target.value)}
              placeholder="60, 300, 1800, 7200, 43200"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Comma-separated delays between retry attempts
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving
                ? "Saving..."
                : isEditing
                  ? "Update Endpoint"
                  : "Create Endpoint"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
