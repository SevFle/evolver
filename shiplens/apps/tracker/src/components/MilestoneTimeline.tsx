interface Milestone {
  status: string;
  location?: string;
  description?: string;
  eventTimestamp: string;
}

export function MilestoneTimeline({ milestones }: { milestones: Milestone[] }) {
  if (milestones.length === 0) {
    return <p className="text-gray-400 text-sm">No milestones recorded yet.</p>;
  }

  return (
    <ol className="relative border-l border-gray-200 ml-4">
      {milestones.map((m, i) => (
        <li key={i} className="mb-6 ml-6">
          <span className="absolute -left-2 w-4 h-4 bg-blue-500 rounded-full border-2 border-white" />
          <time className="text-sm text-gray-500">
            {new Date(m.eventTimestamp).toLocaleString()}
          </time>
          <h3 className="text-lg font-semibold text-gray-900">{m.status.replace(/_/g, " ")}</h3>
          {m.location && <p className="text-sm text-gray-600">{m.location}</p>}
          {m.description && <p className="text-sm text-gray-500">{m.description}</p>}
        </li>
      ))}
    </ol>
  );
}
