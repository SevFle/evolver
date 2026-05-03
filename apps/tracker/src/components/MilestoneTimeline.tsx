import type { TrackingMilestone } from "@/lib/tracking-api";

interface MilestoneTimelineProps {
  milestones: TrackingMilestone[];
  primaryColor?: string | null;
}

function formatMilestoneDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function formatMilestoneTime(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function isExceptionType(type: string): boolean {
  return type === "exception";
}

function isCompletedType(type: string): boolean {
  return type === "delivered";
}

export function MilestoneTimeline({
  milestones,
  primaryColor,
}: MilestoneTimelineProps) {
  const brandColor = primaryColor ?? "var(--color-primary)";

  if (milestones.length === 0) {
    return (
      <div className="milestone-empty">
        <svg
          className="milestone-empty-icon"
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12,6 12,12 16,14" />
        </svg>
        <p className="milestone-empty-text">
          No milestone updates yet. Check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="milestone-section">
      <h2 className="milestone-section-title">Shipment Timeline</h2>
      <ol className="milestone-list">
        {milestones.map((m, i) => {
          const isException = isExceptionType(m.type);
          const isCompleted = isCompletedType(m.type);
          const isLatest = i === 0;

          let dotClass = "milestone-dot-default";
          if (isException) dotClass = "milestone-dot-exception";
          else if (isLatest) dotClass = "milestone-dot-latest";
          else if (isCompleted) dotClass = "milestone-dot-completed";

          return (
            <li key={i} className="milestone-item">
              <div className="milestone-marker">
                <span
                  className={`milestone-dot ${dotClass}`}
                  style={
                    isLatest || isCompleted
                      ? { backgroundColor: brandColor }
                      : undefined
                  }
                />
                {i < milestones.length - 1 && (
                  <span className="milestone-line" />
                )}
              </div>
              <div className="milestone-content">
                <div className="milestone-title-row">
                  <p className="milestone-type">
                    {m.type
                      .replace(/_/g, " ")
                      .replace(/^./, (c) => c.toUpperCase())}
                  </p>
                  {isLatest && (
                    <span
                      className="milestone-latest-badge"
                      style={{ backgroundColor: brandColor }}
                    >
                      Latest
                    </span>
                  )}
                </div>
                {m.description && (
                  <p className="milestone-description">{m.description}</p>
                )}
                <div className="milestone-details">
                  {m.location && (
                    <span className="milestone-location">
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                        <circle cx="12" cy="10" r="3" />
                      </svg>
                      {m.location}
                    </span>
                  )}
                  <span className="milestone-time">
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12,6 12,12 16,14" />
                    </svg>
                    {formatMilestoneDate(m.occurredAt)}
                    {formatMilestoneTime(m.occurredAt) && (
                      <> &middot; {formatMilestoneTime(m.occurredAt)}</>
                    )}
                  </span>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
