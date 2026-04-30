import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { EndpointStatusBadge } from "@/components/dashboard/status-badges";

interface EndpointHealthRow {
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

function SuccessRateBar({ rate }: { rate: number | null }) {
  if (rate === null) return <span className="text-muted-foreground">—</span>;
  const color =
    rate >= 95 ? "bg-green-500" : rate >= 80 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-16 overflow-hidden rounded-full bg-muted">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${rate}%` }}
        />
      </div>
      <span className="text-xs font-medium">{rate}%</span>
    </div>
  );
}

export function EndpointHealthTable({ data }: { data: EndpointHealthRow[] }) {
  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        No endpoints configured
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Endpoint</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Deliveries</TableHead>
          <TableHead>Success Rate</TableHead>
          <TableHead>Avg Latency</TableHead>
          <TableHead>Last Delivery</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((ep) => (
          <TableRow key={ep.id}>
            <TableCell>
              <a
                href={`/endpoints/${ep.id}`}
                className="font-medium hover:underline"
              >
                {ep.name}
              </a>
              <p className="mt-0.5 text-xs text-muted-foreground truncate max-w-48">
                {ep.url}
              </p>
            </TableCell>
            <TableCell>
              <EndpointStatusBadge status={ep.status} />
            </TableCell>
            <TableCell>
              <div className="text-sm">
                <span className="font-medium">{ep.totalDeliveries}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({ep.successCount} ok / {ep.failedCount} fail)
                </span>
              </div>
            </TableCell>
            <TableCell>
              <SuccessRateBar rate={ep.successRate} />
            </TableCell>
            <TableCell>
              <span className="text-sm text-muted-foreground">
                {ep.avgLatencyMs !== null ? `${ep.avgLatencyMs}ms` : "—"}
              </span>
            </TableCell>
            <TableCell>
              <span
                className="text-sm text-muted-foreground"
                title={
                  ep.lastDeliveryAt
                    ? new Date(ep.lastDeliveryAt).toLocaleString()
                    : undefined
                }
              >
                {formatRelativeTime(ep.lastDeliveryAt)}
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
