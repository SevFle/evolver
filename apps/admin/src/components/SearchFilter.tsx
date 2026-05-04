"use client";

interface FilterTab {
  key: string;
  label: string;
}

const FILTER_TABS: FilterTab[] = [
  { key: "all", label: "All" },
  { key: "in_transit", label: "In Transit" },
  { key: "delivered", label: "Delivered" },
  { key: "exception", label: "Delayed" },
  { key: "customs_clearance", label: "Customs" },
];

interface SearchFilterProps {
  search: string;
  onSearchChange: (value: string) => void;
  activeStatus: string;
  onStatusChange: (status: string) => void;
}

export function SearchFilter({
  search,
  onSearchChange,
  activeStatus,
  onStatusChange,
}: SearchFilterProps) {
  return (
    <div style={{ marginBottom: "1rem" }}>
      <input
        type="text"
        placeholder="Search by tracking ID, customer, origin, destination..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        style={{
          width: "100%",
          padding: "0.5rem 0.75rem",
          border: "1px solid var(--color-border)",
          borderRadius: "0.375rem",
          fontSize: "0.875rem",
          outline: "none",
          marginBottom: "0.75rem",
          backgroundColor: "var(--color-surface)",
        }}
      />
      <div
        style={{
          display: "flex",
          gap: "0.25rem",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onStatusChange(tab.key)}
            style={{
              padding: "0.375rem 0.75rem",
              fontSize: "0.8125rem",
              fontWeight: activeStatus === tab.key ? 600 : 400,
              border: "none",
              borderBottom: activeStatus === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "none",
              color: activeStatus === tab.key ? "var(--color-primary)" : "var(--color-muted)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
