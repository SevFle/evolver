"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

interface DeleteEndpointDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint: {
    id: string;
    name: string;
    url: string;
  };
  onSuccess: () => void;
}

export function DeleteEndpointDialog({
  open,
  onOpenChange,
  endpoint,
  onSuccess,
}: DeleteEndpointDialogProps) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await trpc.endpoints.delete.mutate({ id: endpoint.id });
      onSuccess();
    } catch {
      setError("Failed to delete endpoint");
    } finally {
      setDeleting(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/80" onClick={() => onOpenChange(false)} />
      <div
        className="relative z-50 w-full max-w-lg rounded-lg border bg-background p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col space-y-2">
          <h2 className="text-lg font-semibold">Delete Endpoint</h2>
          <p className="text-sm text-muted-foreground">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-foreground">
              {endpoint.name}
            </span>
            ? This action cannot be undone.
          </p>
          <p className="text-sm text-muted-foreground">
            URL: <span className="font-mono text-xs">{endpoint.url}</span>
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Deleting..." : "Delete Endpoint"}
          </Button>
        </div>
      </div>
    </div>
  );
}
