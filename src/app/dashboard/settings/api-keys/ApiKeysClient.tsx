"use client";

import { useState, useTransition } from "react";
import { createApiKey, revokeApiKey } from "@/app/actions/api-keys";

type ApiKey = {
  id: string;
  name: string;
  scopes: string[];
  storeId: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
};

const SCOPE_LABELS: Record<string, string> = {
  "stock.read": "Stock Read",
  "orders.write": "Orders Write",
  "orders.read": "Orders Read",
};

export function ApiKeysClient({ initialKeys }: { initialKeys: ApiKey[] }) {
  const [keys, setKeys] = useState<ApiKey[]>(initialKeys);
  const [newRawKey, setNewRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [isPending, startTransition] = useTransition();

  async function handleCreate(formData: FormData) {
    startTransition(async () => {
      const res = await createApiKey(formData) as {
        success?: boolean;
        rawKey?: string;
        key?: { id: string; name: string };
        error?: Record<string, string[]> | string;
      };

      if (res.error) {
        const err = res.error;
        setErrors(typeof err === "object" ? err as Record<string, string[]> : { _: [String(err)] });
        return;
      }
      if (res.rawKey) {
        setNewRawKey(res.rawKey);
        setShowForm(false);
        setErrors({});
        window.location.reload();
      }
    });
  }

  async function handleRevoke(id: string) {
    if (!confirm("Revoke this key? This cannot be undone.")) return;
    startTransition(async () => {
      await revokeApiKey(id);
      setKeys((k) => k.filter((key) => key.id !== id));
    });
  }

  function copyKey() {
    if (!newRawKey) return;
    navigator.clipboard.writeText(newRawKey).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div style={{ maxWidth: 720 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>API Keys</h1>
          <p style={{ margin: "4px 0 0", color: "#6b7280", fontSize: 14 }}>
            Keys for machine-to-machine access to <code>/api/v1/*</code>. Each key is shown only once at creation.
          </p>
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 600 }}
        >
          {showForm ? "Cancel" : "+ New Key"}
        </button>
      </div>

      {/* One-time raw key display */}
      {newRawKey && (
        <div style={{ background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 8, padding: 16, marginBottom: 24 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 700, color: "#92400e" }}>
            ⚠ Copy your key now — it will not be shown again.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <code style={{ flex: 1, background: "#fff", padding: "8px 12px", borderRadius: 6, fontSize: 13, overflowX: "auto", wordBreak: "break-all" }}>
              {newRawKey}
            </code>
            <button
              onClick={copyKey}
              style={{ background: copied ? "#16a34a" : "#374151", color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", cursor: "pointer", minWidth: 80 }}
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <button onClick={() => setNewRawKey(null)} style={{ marginTop: 8, background: "none", border: "none", color: "#92400e", cursor: "pointer", fontSize: 13 }}>
            I&apos;ve saved it — dismiss
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form action={handleCreate} style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: 8, padding: 20, marginBottom: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 4, fontSize: 14 }}>Key name</label>
            <input
              name="name"
              placeholder="e.g. My eRetail Integration"
              required
              style={{ width: "100%", padding: "8px 12px", border: "1px solid #d1d5db", borderRadius: 6, fontSize: 14, boxSizing: "border-box" }}
            />
            {errors.name && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{errors.name[0]}</p>}
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontWeight: 600, marginBottom: 6, fontSize: 14 }}>Scopes</label>
            {(["stock.read", "orders.write", "orders.read"] as const).map((scope) => (
              <label key={scope} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, fontSize: 14, cursor: "pointer" }}>
                <input type="checkbox" name="scopes" value={scope} />
                <span>
                  <strong>{SCOPE_LABELS[scope]}</strong>
                  <span style={{ color: "#6b7280", marginLeft: 6 }}>
                    {scope === "stock.read" && "— read catalogue + stock levels"}
                    {scope === "orders.write" && "— create external orders"}
                    {scope === "orders.read" && "— list and view orders"}
                  </span>
                </span>
              </label>
            ))}
            {errors.scopes && <p style={{ color: "#ef4444", fontSize: 12, margin: "4px 0 0" }}>{errors.scopes[0]}</p>}
          </div>

          {errors._ && <p style={{ color: "#ef4444", fontSize: 13, marginBottom: 12 }}>{errors._[0]}</p>}

          <button
            type="submit"
            disabled={isPending}
            style={{ background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, padding: "9px 20px", cursor: "pointer", fontWeight: 600 }}
          >
            {isPending ? "Creating…" : "Create Key"}
          </button>
        </form>
      )}

      {/* Keys table */}
      {keys.length === 0 ? (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#9ca3af" }}>
          No API keys yet. Create one to enable machine-to-machine access.
        </div>
      ) : (
        <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f9fafb", borderBottom: "1px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Name</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Scopes</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Last used</th>
                <th style={{ textAlign: "left", padding: "10px 16px", fontWeight: 600, color: "#374151" }}>Created</th>
                <th style={{ padding: "10px 16px" }} />
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => (
                <tr key={key.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{key.name}</td>
                  <td style={{ padding: "12px 16px" }}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {key.scopes.map((s) => (
                        <span key={s} style={{ background: "#dbeafe", color: "#1d4ed8", borderRadius: 4, padding: "2px 7px", fontSize: 12, fontWeight: 500 }}>
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                    {key.lastUsedAt ? new Date(key.lastUsedAt).toLocaleDateString() : "Never"}
                  </td>
                  <td style={{ padding: "12px 16px", color: "#6b7280" }}>
                    {new Date(key.createdAt).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "12px 16px", textAlign: "right" }}>
                    <button
                      onClick={() => handleRevoke(key.id)}
                      disabled={isPending}
                      style={{ background: "none", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13 }}
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
