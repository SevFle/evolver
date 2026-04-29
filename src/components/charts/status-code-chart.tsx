"use client";

import { useMemo } from "react";

interface StatusCodeDataPoint {
  statusCode: number | null;
  count: number;
}

const MARGIN = { top: 16, right: 16, bottom: 48, left: 48 };
const WIDTH = 500;
const HEIGHT = 260;

function statusCodeColor(code: number | null): string {
  if (code === null) return "#6b7280";
  if (code >= 200 && code < 300) return "rgb(34, 197, 94)";
  if (code >= 300 && code < 400) return "rgb(59, 130, 246)";
  if (code >= 400 && code < 500) return "rgb(234, 179, 8)";
  if (code >= 500) return "rgb(239, 68, 68)";
  return "#6b7280";
}

function statusCodeLabel(code: number | null): string {
  if (code === null) return "N/A";
  return String(code);
}

function statusCategory(code: number | null): string {
  if (code === null) return "No response";
  if (code >= 200 && code < 300) return "2xx Success";
  if (code >= 300 && code < 400) return "3xx Redirect";
  if (code >= 400 && code < 500) return "4xx Client Error";
  if (code >= 500) return "5xx Server Error";
  return "Other";
}

export function StatusCodeChart({ data }: { data: StatusCodeDataPoint[] }) {
  const plotWidth = WIDTH - MARGIN.left - MARGIN.right;
  const plotHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data],
  );

  const barWidth = useMemo(() => {
    if (data.length === 0) return 0;
    return Math.min(40, (plotWidth / data.length) * 0.6);
  }, [data.length, plotWidth]);

  const barSpacing = useMemo(() => {
    if (data.length <= 1) return plotWidth / 2;
    return plotWidth / data.length;
  }, [data.length, plotWidth]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-muted-foreground">
        No status code data yet
      </div>
    );
  }

  return (
    <div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const val = Math.round(maxCount * frac);
          const y = MARGIN.top + plotHeight - frac * plotHeight;
          return (
            <g key={frac}>
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
                {val}
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

        {data.map((d, i) => {
          const x = MARGIN.left + i * barSpacing + barSpacing / 2 - barWidth / 2;
          const barHeight = (d.count / maxCount) * plotHeight;
          const y = MARGIN.top + plotHeight - barHeight;
          return (
            <g key={i}>
              <rect
                x={x}
                y={y}
                width={barWidth}
                height={barHeight}
                rx={3}
                fill={statusCodeColor(d.statusCode)}
                fillOpacity={0.8}
              />
              <text
                x={x + barWidth / 2}
                y={MARGIN.top + plotHeight + 16}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: "11px", fontWeight: 500 }}
              >
                {statusCodeLabel(d.statusCode)}
              </text>
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-muted-foreground"
                style={{ fontSize: "10px" }}
              >
                {d.count}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="mt-3 flex flex-wrap gap-3 px-2">
        {data.map((d, i) => (
          <span key={i} className="text-xs text-muted-foreground">
            <span
              className="mr-1 inline-block h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: statusCodeColor(d.statusCode) }}
            />
            {statusCodeLabel(d.statusCode)} ({statusCategory(d.statusCode)}):{" "}
            {d.count}
          </span>
        ))}
      </div>
    </div>
  );
}
