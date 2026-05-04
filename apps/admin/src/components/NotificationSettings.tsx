"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type {
  NotificationPrefMilestone,
  NotificationPrefChannel,
  NotificationPreference,
} from "@shiplens/shared";

const MILESTONE_LABELS: Record<NotificationPrefMilestone, string> = {
  created: "Created",
  picked_up: "Picked Up",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  exception: "Exception",
};

const CHANNEL_OPTIONS: { value: NotificationPrefChannel; label: string }[] = [
  { value: "email", label: "Email" },
  { value: "sms", label: "SMS" },
  { value: "both", label: "Both" },
];

interface PreferenceRow {
  milestoneType: NotificationPrefMilestone;
  channel: NotificationPrefChannel;
  enabled: boolean;
  customTemplate: string;
}

function initRows(prefs: NotificationPreference[]): PreferenceRow[] {
  const map = new Map(prefs.map((p) => [p.milestoneType, p]));
  return (
    ["created", "picked_up", "in_transit", "out_for_delivery", "delivered", "exception"] as NotificationPrefMilestone[]
  ).map((m) => {
    const existing = map.get(m);
    return {
      milestoneType: m,
      channel: existing?.channel ?? "email",
      enabled: existing?.enabled ?? true,
      customTemplate: existing?.customTemplate ?? "",
    };
  });
}

export function NotificationSettings() {
  const [rows, setRows] = useState<PreferenceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchPrefs() {
      setLoading(true);
      setError(null);
      try {
        const res = await apiClient.get<{ success: boolean; data: NotificationPreference[] }>(
          "/api/notifications/preferences"
        );
        if (!cancelled) setRows(initRows(res.data ?? []));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load preferences");
          setRows(initRows([]));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchPrefs();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = useCallback((milestoneType: NotificationPrefMilestone) => {
    setRows((prev) =>
      prev.map((r) => (r.milestoneType === milestoneType ? { ...r, enabled: !r.enabled } : r))
    );
  }, []);

  const handleChannelChange = useCallback(
    (milestoneType: NotificationPrefMilestone, channel: NotificationPrefChannel) => {
      setRows((prev) => prev.map((r) => (r.milestoneType === milestoneType ? { ...r, channel } : r)));
    },
    []
  );

  const handleTemplateChange = useCallback((milestoneType: NotificationPrefMilestone, customTemplate: string) => {
    setRows((prev) => prev.map((r) => (r.milestoneType === milestoneType ? { ...r, customTemplate } : r)));
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveMessage(null);
    setError(null);

    try {
      for (const row of rows) {
        await apiClient.put("/api/notifications/preferences", {
          milestoneType: row.milestoneType,
          channel: row.channel,
          enabled: row.enabled,
          customTemplate: row.customTemplate || null,
        });
      }
      setSaveMessage("Preferences saved successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }, [rows]);

  if (loading) {
    return (
      <div style={{ padding: "2rem", textAlign: "center", color: "var(--color-muted)" }}>
        Loading notification preferences...
      </div>
    );
  }

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
        Notification Preferences
      </h1>
      <p style={{ color: "var(--color-muted)", marginBottom: "1.5rem" }}>
        Configure which shipment milestones trigger notifications and how they are delivered.
      </p>

      {error && (
        <div style={{ padding: "0.75rem", marginBottom: "1rem", color: "#dc2626", fontSize: "0.875rem" }}>
          {error}
        </div>
      )}

      {saveMessage && (
        <div style={{ padding: "0.75rem", marginBottom: "1rem", color: "#047857", fontSize: "0.875rem" }}>
          {saveMessage}
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {rows.map((row) => (
          <div
            key={row.milestoneType}
            style={{
              backgroundColor: "var(--color-surface)",
              border: "1px solid var(--color-border)",
              borderRadius: "0.5rem",
              padding: "1rem",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
              <span style={{ fontWeight: 500, fontSize: "0.9375rem" }}>
                {MILESTONE_LABELS[row.milestoneType]}
              </span>
              <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={row.enabled}
                  onChange={() => handleToggle(row.milestoneType)}
                  style={{ width: "1rem", height: "1rem", cursor: "pointer" }}
                  data-testid={`toggle-${row.milestoneType}`}
                />
                <span style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
                  {row.enabled ? "Enabled" : "Disabled"}
                </span>
              </label>
            </div>

            <div style={{ marginBottom: "0.75rem" }}>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginRight: "0.5rem" }}>
                Channel:
              </span>
              <select
                value={row.channel}
                onChange={(e) => handleChannelChange(row.milestoneType, e.target.value as NotificationPrefChannel)}
                style={{
                  padding: "0.25rem 0.5rem",
                  fontSize: "0.8125rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.25rem",
                  backgroundColor: "var(--color-surface)",
                }}
                data-testid={`channel-${row.milestoneType}`}
              >
                {CHANNEL_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", display: "block", marginBottom: "0.25rem" }}>
                Custom Template:
              </span>
              <textarea
                value={row.customTemplate}
                onChange={(e) => handleTemplateChange(row.milestoneType, e.target.value)}
                placeholder="Leave empty to use default message"
                rows={2}
                style={{
                  width: "100%",
                  padding: "0.5rem",
                  fontSize: "0.8125rem",
                  border: "1px solid var(--color-border)",
                  borderRadius: "0.25rem",
                  resize: "vertical",
                  backgroundColor: "var(--color-surface)",
                }}
                data-testid={`template-${row.milestoneType}`}
              />
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          marginTop: "1.5rem",
          padding: "0.625rem 1.5rem",
          fontSize: "0.875rem",
          fontWeight: 500,
          color: "#ffffff",
          backgroundColor: saving ? "#93c5fd" : "var(--color-primary)",
          border: "none",
          borderRadius: "0.375rem",
          cursor: saving ? "not-allowed" : "pointer",
        }}
        data-testid="save-button"
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>
    </div>
  );
}
