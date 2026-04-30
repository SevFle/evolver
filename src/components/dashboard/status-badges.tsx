import { Badge } from "@/components/ui/badge";

const DELIVERY_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  success: "success",
  failed: "destructive",
  pending: "warning",
  processing: "secondary",
  retry_scheduled: "warning",
  circuit_open: "destructive",
  dead_letter: "destructive",
};

export function DeliveryStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={DELIVERY_STATUS_VARIANT[status] ?? "secondary"}>
      {status.replace(/_/g, " ")}
    </Badge>
  );
}

const ENDPOINT_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary"> = {
  active: "success",
  degraded: "warning",
  disabled: "destructive",
};

export function EndpointStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={ENDPOINT_STATUS_VARIANT[status] ?? "secondary"}>
      {status}
    </Badge>
  );
}

const EVENT_STATUS_VARIANT: Record<string, "success" | "warning" | "destructive" | "secondary" | "default"> = {
  queued: "secondary",
  delivering: "default",
  delivered: "success",
  failed: "destructive",
};

export function EventStatusBadge({ status }: { status: string }) {
  return (
    <Badge variant={EVENT_STATUS_VARIANT[status] ?? "secondary"}>
      {status}
    </Badge>
  );
}
