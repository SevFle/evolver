"use client";

import { useMemo } from "react";

interface TimelineDataPoint {
  bucket: string;
  totalCount: number;
  successCount: number;
  failedCount: number;
}

const MARGIN = { top: 16, right: 16, bottom: 48, left: 48 };
const WIDTH = 600;
const HEIGHT = 280;

function formatBucketLabel(dateStr: string, index: number, total: number) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "";
  const step = Math.max(1, Math.floor(total / 8));
  if (index % step !== 0 && index !== total - 1) return "";
  const month = d.toLocaleString("en", { month: "short" });
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  const hasMultipleDays =
    total > 1 &&
    new Date(dateStr).toDateString() !==
      new Date(
        index === 0 ? dateStr : new Date(dateStr).toISOString(),
      ).toDateString();
  if (total <= 25) return `${hours}:${minutes}`;
  return `${month} ${day}`;
}

export function DeliveryTimelineChart({
  data,
}: {
  data: TimelineDataPoint[];
}) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxTotal = useMemo(
    () => Math.max(...data.map((d) => d.totalCount), 1),
    [data],
  );

  const yTicks = useMemo(() => {
    const niceMax = Math.ceil(maxTotal / 5) * 5;
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) {
      ticks.push(Math.round((niceMax / 4) * i));
    }
    return ticks;
  }, [maxTotal]);

  const niceMax = yTicks[yTicks.length - 1] ?? 1;

  const points = useMemo(() => {
    if (data.length === 0) return [];
    const step = plotWidth / Math.max(data.length - 1, 1);
    return data.map((d, i) => ({
      x: MARGIN.left + i * step,
      successY: MARGIN.top + plotHeight - (d.successCount / niceMax) * plotHeight,
      failedY: MARGIN.top + plotHeight - (d.failedCount / niceMax) * plotHeight,
      totalY: MARGIN.top + plotHeight - (d.totalCount / niceMax) * plotHeight,
      ...d,
    }));
  }, [data, plotWidth, plotHeight, niceMax]);

  if (data.length === 0) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        No delivery data yet
      </div>
    );
  }

  const successPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.successY}`)
    .join(" ");
  const successArea =
    successPath +
    ` L ${points[points.length - 1]!.x},${MARGIN.top + plotHeight} L ${points[0]!.x},${MARGIN.top + plotHeight} Z`;

  const failedPath = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x},${p.failedY}`)
    .join(" ");
  const failedArea =
    failedPath +
    ` L ${points[points.length - 1]!.x},${MARGIN.top + plotHeight} L ${points[0]!.x},${MARGIN.top + plotHeight} Z`;

  return (
    <svg
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      className="w-full"
      preserveAspectRatio="xMidYMid meet"
    >
      <defs>
        <linearGradient id="successGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(34, 197, 94)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(34, 197, 94)" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="failedGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(239, 68, 68)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="rgb(239, 68, 68)" stopOpacity="0.05" />
        </linearGradient>
      </defs>

      {yTicks.map((tick) => {
        const y = MARGIN.top + plotHeight - (tick / niceMax) * plotHeight;
        return (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              y1={y}
              x2={WIDTH - MARGIN.right}
              y2={y}
              stroke="currentColor"
              strokeOpacity="0.1"
            />
            <text
              x={MARGIN.left - 8}
              y={y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              style={{ fontSize: "11px" }}
            >
              {tick}
            </text>
          </g>
        );
      })}

      <line
        x1={MARGIN.left}
        y1={MARGIN.top + plotHeight}
        x2={WIDTH - MARGIN.right}
        y2={MARGIN.top + plotHeight}
        stroke="currentColor"
        strokeOpacity="0.2"
      />

      <path d={successArea} fill="url(#successGrad)" />
      <path d={successPath} fill="none" stroke="rgb(34, 197, 94)" strokeWidth="2" />

      <path d={failedArea} fill="url(#failedGrad)" />
      <path d={failedPath} fill="none" stroke="rgb(239, 68, 68)" strokeWidth="2" />

      {points.map((p, i) => (
        <g key={i}>
          <text
            x={p.x}
            y={HEIGHT - 8}
            textAnchor="middle"
            className="fill-muted-foreground"
            style={{ fontSize: "10px" }}
          >
            {formatBucketLabel(p.bucket, i, points.length)}
          </text>
        </g>
      ))}

      <g transform={`translate(${MARGIN.left + 8}, ${MARGIN.top + 4})`}>
        <circle cx="0" cy="0" r="4" fill="rgb(34, 197, 94)" />
        <text x="8" dominantBaseline="middle" style={{ fontSize: "11px" }}>
          Success
        </text>
        <circle cx="70" cy="0" r="4" fill="rgb(239, 68, 68)" />
        <text x="78" dominantBaseline="middle" style={{ fontSize: "11px" }}>
          Failed
        </text>
      </g>
    </svg>
  );
}
