"use client";

import { useState, useEffect, useCallback } from "react";
import { apiClient } from "@/lib/api-client";
import type { TenantConfig, ApiResponse } from "@shiplens/shared";

type TabKey = "branding" | "notifications" | "api-keys";

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string | null;
}

interface NotificationRule {
  id: string;
  name: string;
  eventCode: string;
  channel: string;
  isActive: boolean;
}

const TABS: { key: TabKey; label: string }[] = [
  { key: "branding", label: "Branding" },
  { key: "notifications", label: "Notifications" },
  { key: "api-keys", label: "API Keys" },
];

function isValidHexColor(value: string): boolean {
  return /^#[0-9A-Fa-f]{6}$/.test(value);
}

function isValidUrl(value: string): boolean {
  if (!value) return true;
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

function isValidDomain(value: string): boolean {
  if (!value) return true;
  return /^[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/.test(value);
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: 500,
  marginBottom: "0.25rem",
  color: "var(--color-text)",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  border: "1px solid var(--color-border)",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  outline: "none",
  backgroundColor: "var(--color-surface)",
};

const inputErrorStyle: React.CSSProperties = {
  ...inputStyle,
  borderColor: "#dc2626",
};

const fieldGroupStyle: React.CSSProperties = {
  marginBottom: "1rem",
};

const errorTextStyle: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "0.75rem",
  marginTop: "0.25rem",
};

const buttonPrimary: React.CSSProperties = {
  padding: "0.5rem 1rem",
  fontSize: "0.875rem",
  fontWeight: 500,
  color: "#ffffff",
  backgroundColor: "var(--color-primary)",
  border: "none",
  borderRadius: "0.375rem",
  cursor: "pointer",
};

const buttonDanger: React.CSSProperties = {
  padding: "0.375rem 0.75rem",
  fontSize: "0.8125rem",
  fontWeight: 500,
  color: "#dc2626",
  backgroundColor: "transparent",
  border: "1px solid #dc2626",
  borderRadius: "0.375rem",
  cursor: "pointer",
};

const cardStyle: React.CSSProperties = {
  backgroundColor: "var(--color-surface)",
  borderRadius: "0.5rem",
  border: "1px solid var(--color-border)",
  padding: "1.5rem",
};

function BrandingSection() {
  const [form, setForm] = useState({
    name: "",
    logoUrl: "",
    primaryColor: "#2563EB",
    secondaryColor: "#1E40AF",
    customDomain: "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await apiClient.get<ApiResponse<TenantConfig>>("/api/tenants/current");
        if (!cancelled && res.data) {
          setForm({
            name: res.data.name ?? "",
            logoUrl: res.data.logoUrl ?? "",
            primaryColor: res.data.primaryColor ?? "#2563EB",
            secondaryColor: "#1E40AF",
            customDomain: res.data.customDomain ?? "",
          });
        }
      } catch {
        setMessage("Failed to load settings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = "Company name is required";
    if (form.logoUrl && !isValidUrl(form.logoUrl)) next.logoUrl = "Invalid URL format";
    if (!isValidHexColor(form.primaryColor)) next.primaryColor = "Must be a valid hex color (e.g. #2563EB)";
    if (!isValidHexColor(form.secondaryColor)) next.secondaryColor = "Must be a valid hex color (e.g. #1E40AF)";
    if (form.customDomain && !isValidDomain(form.customDomain)) next.customDomain = "Invalid domain format";
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const handleSave = useCallback(async () => {
    if (!validate()) return;
    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/tenants/current", form);
      setMessage("Settings saved");
    } catch {
      setMessage("Failed to save settings");
    } finally {
      setSaving(false);
    }
  }, [form, validate]);

  const handleChange = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  if (loading) {
    return <div style={{ color: "var(--color-muted)", padding: "1rem" }}>Loading branding settings...</div>;
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
        Portal Branding
      </h2>

      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="branding-name">Company Name</label>
        <input
          id="branding-name"
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          style={errors.name ? inputErrorStyle : inputStyle}
          aria-invalid={!!errors.name}
        />
        {errors.name && <div style={errorTextStyle}>{errors.name}</div>}
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="branding-logo">Logo URL</label>
        <input
          id="branding-logo"
          type="text"
          value={form.logoUrl}
          onChange={(e) => handleChange("logoUrl", e.target.value)}
          placeholder="https://example.com/logo.png"
          style={errors.logoUrl ? inputErrorStyle : inputStyle}
          aria-invalid={!!errors.logoUrl}
        />
        {errors.logoUrl && <div style={errorTextStyle}>{errors.logoUrl}</div>}
      </div>

      <div style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
        <div style={{ flex: 1, ...fieldGroupStyle, marginBottom: 0 }}>
          <label style={labelStyle} htmlFor="branding-primary-color">Primary Color</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="color"
              value={form.primaryColor}
              onChange={(e) => handleChange("primaryColor", e.target.value)}
              style={{ width: "2.5rem", height: "2.25rem", padding: 0, border: "1px solid var(--color-border)", borderRadius: "0.25rem", cursor: "pointer" }}
              aria-label="Primary color picker"
            />
            <input
              id="branding-primary-color"
              type="text"
              value={form.primaryColor}
              onChange={(e) => handleChange("primaryColor", e.target.value)}
              style={{ flex: 1, ...(errors.primaryColor ? inputErrorStyle : inputStyle) }}
              aria-invalid={!!errors.primaryColor}
            />
          </div>
          {errors.primaryColor && <div style={errorTextStyle}>{errors.primaryColor}</div>}
        </div>

        <div style={{ flex: 1, ...fieldGroupStyle, marginBottom: 0 }}>
          <label style={labelStyle} htmlFor="branding-secondary-color">Secondary Color</label>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <input
              type="color"
              value={form.secondaryColor}
              onChange={(e) => handleChange("secondaryColor", e.target.value)}
              style={{ width: "2.5rem", height: "2.25rem", padding: 0, border: "1px solid var(--color-border)", borderRadius: "0.25rem", cursor: "pointer" }}
              aria-label="Secondary color picker"
            />
            <input
              id="branding-secondary-color"
              type="text"
              value={form.secondaryColor}
              onChange={(e) => handleChange("secondaryColor", e.target.value)}
              style={{ flex: 1, ...(errors.secondaryColor ? inputErrorStyle : inputStyle) }}
              aria-invalid={!!errors.secondaryColor}
            />
          </div>
          {errors.secondaryColor && <div style={errorTextStyle}>{errors.secondaryColor}</div>}
        </div>
      </div>

      <div style={fieldGroupStyle}>
        <label style={labelStyle} htmlFor="branding-domain">Custom Domain</label>
        <input
          id="branding-domain"
          type="text"
          value={form.customDomain}
          onChange={(e) => handleChange("customDomain", e.target.value)}
          placeholder="track.yourcompany.com"
          style={errors.customDomain ? inputErrorStyle : inputStyle}
          aria-invalid={!!errors.customDomain}
        />
        {errors.customDomain && <div style={errorTextStyle}>{errors.customDomain}</div>}
      </div>

      {message && (
        <div style={{ fontSize: "0.875rem", color: message.includes("Failed") ? "#dc2626" : "#047857", marginBottom: "1rem" }}>
          {message}
        </div>
      )}

      <button onClick={handleSave} disabled={saving} style={{ ...buttonPrimary, opacity: saving ? 0.6 : 1 }}>
        {saving ? "Saving..." : "Save Branding"}
      </button>
    </div>
  );
}

function NotificationsSection() {
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [rules, setRules] = useState<NotificationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const tenantRes = await apiClient.get<ApiResponse<TenantConfig>>("/api/tenants/current");
        if (!cancelled && tenantRes.data) {
          const ch = tenantRes.data.notificationChannel;
          setEmailEnabled(ch === "email" || ch === "both");
          setSmsEnabled(ch === "sms" || ch === "both");
        }
      } catch {
        setMessage("Failed to load notification settings");
      }

      try {
        const rulesRes = await apiClient.get<ApiResponse<NotificationRule[]>>("/api/notifications/rules");
        if (!cancelled) setRules(rulesRes.data ?? []);
      } catch {
        // rules may not exist yet
      }

      if (!cancelled) setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  const handleSave = useCallback(async () => {
    let channel: "email" | "sms" | "both" | null = null;
    if (emailEnabled && smsEnabled) channel = "both";
    else if (emailEnabled) channel = "email";
    else if (smsEnabled) channel = "sms";

    setSaving(true);
    setMessage(null);
    try {
      await apiClient.patch("/api/tenants/current", { notificationChannel: channel });
      setMessage("Notification preferences saved");
    } catch {
      setMessage("Failed to save preferences");
    } finally {
      setSaving(false);
    }
  }, [emailEnabled, smsEnabled]);

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    position: "relative",
    width: "2.75rem",
    height: "1.5rem",
    borderRadius: "9999px",
    border: "none",
    cursor: "pointer",
    backgroundColor: active ? "var(--color-primary)" : "#d1d5db",
    transition: "background-color 0.15s",
  });

  const toggleKnobStyle = (active: boolean): React.CSSProperties => ({
    position: "absolute",
    top: "0.125rem",
    left: active ? "1.375rem" : "0.125rem",
    width: "1.25rem",
    height: "1.25rem",
    borderRadius: "50%",
    backgroundColor: "#ffffff",
    transition: "left 0.15s",
  });

  if (loading) {
    return <div style={{ color: "var(--color-muted)", padding: "1rem" }}>Loading notification settings...</div>;
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
        Notification Preferences
      </h2>

      <div style={{ ...fieldGroupStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>Email Notifications</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Send tracking updates via email</div>
        </div>
        <button
          role="switch"
          aria-checked={emailEnabled}
          aria-label="Toggle email notifications"
          onClick={() => setEmailEnabled((v) => !v)}
          style={toggleStyle(emailEnabled)}
        >
          <span style={toggleKnobStyle(emailEnabled)} />
        </button>
      </div>

      <div style={{ ...fieldGroupStyle, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>SMS Notifications</div>
          <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>Send tracking updates via SMS</div>
        </div>
        <button
          role="switch"
          aria-checked={smsEnabled}
          aria-label="Toggle SMS notifications"
          onClick={() => setSmsEnabled((v) => !v)}
          style={toggleStyle(smsEnabled)}
        >
          <span style={toggleKnobStyle(smsEnabled)} />
        </button>
      </div>

      {!emailEnabled && !smsEnabled && (
        <div style={{ ...errorTextStyle, marginBottom: "1rem" }}>At least one notification channel must be enabled</div>
      )}

      {message && (
        <div style={{ fontSize: "0.875rem", color: message.includes("Failed") ? "#dc2626" : "#047857", marginBottom: "1rem" }}>
          {message}
        </div>
      )}

      <button
        onClick={handleSave}
        disabled={saving || (!emailEnabled && !smsEnabled)}
        style={{ ...buttonPrimary, opacity: saving || (!emailEnabled && !smsEnabled) ? 0.6 : 1 }}
      >
        {saving ? "Saving..." : "Save Preferences"}
      </button>

      {rules.length > 0 && (
        <>
          <h3 style={{ fontSize: "0.875rem", fontWeight: 600, marginTop: "1.5rem", marginBottom: "0.75rem" }}>
            Notification Rules
          </h3>
          <div style={{ borderTop: "1px solid var(--color-border)" }}>
            {rules.map((rule) => (
              <div
                key={rule.id}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.75rem 0",
                  borderBottom: "1px solid var(--color-border)",
                  fontSize: "0.875rem",
                }}
              >
                <span>{rule.name}</span>
                <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>{rule.channel}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ApiKeysSection() {
  const [keys, setKeys] = useState<ApiKeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newKeyValue, setNewKeyValue] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const res = await apiClient.get<ApiResponse<ApiKeyItem[]>>("/api/api-keys");
      setKeys(res.data ?? []);
    } catch {
      setError("Failed to load API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

  const handleCreate = useCallback(async () => {
    if (!newKeyName.trim()) return;
    setCreating(true);
    setError(null);
    setNewKeyValue(null);
    try {
      const res = await apiClient.post<{ key: string }>("/api/api-keys", { name: newKeyName.trim() });
      setNewKeyValue(res.key ?? null);
      setNewKeyName("");
      await loadKeys();
    } catch {
      setError("Failed to create API key");
    } finally {
      setCreating(false);
    }
  }, [newKeyName, loadKeys]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await apiClient.delete(`/api/api-keys/${id}`);
      setKeys((prev) => prev.filter((k) => k.id !== id));
    } catch {
      setError("Failed to revoke API key");
    }
  }, []);

  if (loading) {
    return <div style={{ color: "var(--color-muted)", padding: "1rem" }}>Loading API keys...</div>;
  }

  return (
    <div style={cardStyle}>
      <h2 style={{ fontSize: "1rem", fontWeight: 600, marginBottom: "1.25rem" }}>
        API Keys
      </h2>

      {error && (
        <div style={{ fontSize: "0.875rem", color: "#dc2626", marginBottom: "1rem" }}>{error}</div>
      )}

      {newKeyValue && (
        <div style={{
          padding: "0.75rem",
          backgroundColor: "#d1fae5",
          borderRadius: "0.375rem",
          marginBottom: "1rem",
          fontSize: "0.875rem",
        }}>
          <div style={{ fontWeight: 500, marginBottom: "0.25rem" }}>New API key created. Copy it now — it won&apos;t be shown again.</div>
          <code style={{ wordBreak: "break-all" }}>{newKeyValue}</code>
        </div>
      )}

      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <input
          type="text"
          placeholder="Key name (e.g. Production)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          style={{ flex: 1, ...inputStyle }}
          aria-label="New API key name"
        />
        <button
          onClick={handleCreate}
          disabled={creating || !newKeyName.trim()}
          style={{ ...buttonPrimary, opacity: creating || !newKeyName.trim() ? 0.6 : 1, whiteSpace: "nowrap" }}
        >
          {creating ? "Creating..." : "Create Key"}
        </button>
      </div>

      {keys.length === 0 ? (
        <div style={{ textAlign: "center", color: "var(--color-muted)", padding: "1.5rem", fontSize: "0.875rem" }}>
          No API keys yet. Create one above.
        </div>
      ) : (
        <div style={{ borderTop: "1px solid var(--color-border)" }}>
          {keys.map((key) => (
            <div
              key={key.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "0.75rem 0",
                borderBottom: "1px solid var(--color-border)",
              }}
            >
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>{key.name || "Unnamed key"}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
                  {key.prefix}...{key.createdAt ? ` — created ${new Date(key.createdAt).toLocaleDateString()}` : ""}
                </div>
              </div>
              <button onClick={() => handleDelete(key.id)} style={buttonDanger}>
                Revoke
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface SettingsPageProps {
  initialTab?: TabKey;
}

export function SettingsPage({ initialTab = "branding" }: SettingsPageProps) {
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  return (
    <div style={{ padding: "2rem", maxWidth: "800px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "1rem" }}>
        Tenant Settings
      </h1>
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--color-border)", marginBottom: "1.5rem" }}>
        {TABS.map((tab) => (
          <button
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: "0.5rem 1rem",
              fontSize: "0.8125rem",
              fontWeight: activeTab === tab.key ? 600 : 400,
              border: "none",
              borderBottom: activeTab === tab.key ? "2px solid var(--color-primary)" : "2px solid transparent",
              background: "none",
              color: activeTab === tab.key ? "var(--color-primary)" : "var(--color-muted)",
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {activeTab === "branding" && <BrandingSection />}
        {activeTab === "notifications" && <NotificationsSection />}
        {activeTab === "api-keys" && <ApiKeysSection />}
      </div>
    </div>
  );
}
