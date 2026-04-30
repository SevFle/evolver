"use client";

import { useMemo } from "react";

interface LatencyBucket {
  bucket: string;
  count: number;
  sortKey: number;
}

const MARGIN = { top: 16, right: 24, bottom: 16, left: 80 };
const WIDTH = 500;
const HEIGHT = 280;
const BAR_HEIGHT = 24;
const BAR_GAP = 4;

function bucketColor(bucket: string): string {
  if (bucket === "0-50ms") return "rgb(34, 197, 94)";
  if (bucket === "50-100ms") return "rgb(74, 222, 128)";
  if (bucket === "100-200ms") return "rgb(234, 179, 8)";
  if (bucket === "200-500ms") return "rgb(249, 115, 22)";
  if (bucket === "500ms-1s") return "rgb(239, 68, 68)";
  if (bucket === "1-2s") return "rgb(220, 38, 38)";
  if (bucket === "2-5s") return "rgb(185, 28, 28)";
  return "rgb(153, 27, 27)";
}

const ALL_BUCKETS = [
  "0-50ms",
  "50-100ms",
  "100-200ms",
  "200-500ms",
  "500ms-1s",
  "1-2s",
  "2-5s",
  "5s+",
];

export function LatencyHistogramChart({ data }: { data: LatencyBucket[] }) {
  const filled = useMemo(() => {
    const map = new Map(data.map((d) => [d.bucket, d]));
    return ALL_BUCKETS.map((b) => map.get(b) ?? { bucket: b, count: 0, sortKey: 0 });
  }, [data]);

  const maxCount = useMemo(
    () => Math.max(...filled.map((d) => d.count), 1),
    [filled],
  );

  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const totalHeight = MARGIN.top + filled.length * (BAR_HEIGHT + BAR_GAP) + MARGIN.bottom;

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No latency data yet
      </div>
    );
  }

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${totalHeight}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const x = MARGIN.left + frac * plotWidth;
        return (
          <g key={frac}>
            <line
              x1={x}
              y1={MARGIN.top}
              x2={x}
              y2={totalHeight - MARGIN.bottom}
              stroke="currentColor"
              strokeOpacity="0.08"
            />
            <text
              x={x}
              y={MARGIN.top - 4}
              textAnchor="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "10px" }}
            >
              {Math.round(maxCount * frac)}
            </text>
          </g>
        );
      })}

      {filled.map((d, i) => {
        const y = MARGIN.top + i * (BAR_HEIGHT + BAR_GAP);
        const barWidth = (d.count / maxCount) * plotWidth;
        return (
          <g key={d.bucket}>
            <text
              x={MARGIN.left - 8}
              y={y + BAR_HEIGHT / 2}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "11px", fontWeight: 500 }}
            >
              {d.bucket}
            </text>
            <rect
              x={MARGIN.left}
              y={y}
              width={Math.max(barWidth, 2)}
              height={BAR_HEIGHT}
              rx={3}
              fill={bucketColor(d.bucket)}
              fillOpacity={0.8}
            />
            {d.count > 0 && (
              <text
                x={MARGIN.left + barWidth + 6}
                y={y + BAR_HEIGHT / 2}
                dominantBaseline="middle"
                className="fill-muted-foreground"
                style={{ fontSize: "10px" }}
              >
                {d.count}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
