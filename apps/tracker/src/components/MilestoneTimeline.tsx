interface Milestone {
  type: string;
  description: string;
  location?: string;
  occurredAt: string;
}

interface MilestoneTimelineProps {
  milestones: Milestone[];
}

export function MilestoneTimeline({ milestones }: MilestoneTimelineProps) {
  if (milestones.length === 0) {
    return (
      <p style={{ color: "var(--color-muted)" }}>
        No milestone updates yet. Check back soon.
      </p>
    );
  }

  return (
    <ol
      style={{
        listStyle: "none",
        padding: 0,
        borderLeft: "2px solid var(--color-border)",
        marginLeft: "0.5rem",
      }}
    >
      {milestones.map((m, i) => (
        <li
          key={i}
          style={{
            paddingLeft: "1.5rem",
            paddingBottom: "1.5rem",
            position: "relative",
          }}
        >
          <span
            style={{
              position: "absolute",
              left: "-0.5rem",
              top: "0.25rem",
              width: "0.75rem",
              height: "0.75rem",
              borderRadius: "50%",
              background:
                i === 0 ? "var(--color-primary)" : "var(--color-border)",
            }}
          />
          <p style={{ fontWeight: 500, textTransform: "capitalize" }}>
            {m.type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
          </p>
          {m.description && (
            <p style={{ color: "var(--color-muted)", fontSize: "0.875rem" }}>
              {m.description}
            </p>
          )}
          {m.location && (
            <p style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}>
              {m.location}
            </p>
          )}
          <p style={{ color: "var(--color-muted)", fontSize: "0.75rem" }}>
            {new Date(m.occurredAt).toLocaleString()}
          </p>
        </li>
      ))}
    </ol>
  );
}
