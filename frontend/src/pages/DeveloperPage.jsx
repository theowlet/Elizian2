import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function DeveloperPage() {
  const navigate = useNavigate();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState(null);
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    loadKeys();
  }, [token, navigate]);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/developer/keys`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) setKeys(data.data);
    } catch (_) {}
    setLoading(false);
  };

  const createKey = async () => {
    const name = newKeyName.trim();
    if (!name) {
      alert("Enter a name for the key");
      return;
    }
    setCreating(true);
    setCreatedKey(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/developer/keys`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCreatedKey(data.data);
        setNewKeyName("");
        loadKeys();
      } else {
        alert(data.error || data.message || "Failed to create key");
      }
    } catch (e) {
      alert("Failed to create key");
    }
    setCreating(false);
  };

  const revokeKey = async (id) => {
    if (!window.confirm("Revoke this API key? It will stop working immediately.")) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/developer/keys/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setCreatedKey(null);
        loadKeys();
      } else {
        alert(data.error || "Failed to revoke");
      }
    } catch (_) {
      alert("Failed to revoke");
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#e2e8f0", padding: "20px 16px" }}>
      <header style={{ marginBottom: 24 }}>
        <button type="button" onClick={() => navigate("/profile")} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem" }}>
          ← Back to Profile
        </button>
        <h1 style={{ margin: "12px 0 0", fontSize: "1.5rem" }}>Developer API keys</h1>
        <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
          Create keys to call the public API (e.g. voucher validation). Send the key in the <code style={{ background: "#2d2d44", padding: "2px 6px", borderRadius: 4 }}>X-API-Key</code> header.
        </p>
      </header>

      {/* Show new key once */}
      {createdKey && createdKey.key && (
        <div style={{ background: "#1e3a2f", border: "1px solid #22c55e", borderRadius: 12, padding: 16, marginBottom: 24 }}>
          <p style={{ margin: "0 0 8px", fontWeight: 600, color: "#86efac" }}>Key created. Copy it now — it won't be shown again.</p>
          <pre style={{ background: "#0f0f1a", padding: 12, borderRadius: 8, overflow: "auto", fontSize: "0.85rem", wordBreak: "break-all" }}>
            {createdKey.key}
          </pre>
          <button type="button" onClick={() => setCreatedKey(null)} style={{ marginTop: 8, padding: "8px 16px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
            Done
          </button>
        </div>
      )}

      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Create new key</h2>
        <input
          type="text"
          placeholder="Key name (e.g. My app)"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          style={{ padding: "10px 12px", width: "100%", maxWidth: 320, marginRight: 8, marginBottom: 8, background: "#1a1a2e", border: "1px solid #2d2d44", borderRadius: 8, color: "#e2e8f0" }}
        />
        <button type="button" disabled={creating} onClick={createKey} style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: creating ? "not-allowed" : "pointer" }}>
          {creating ? "Creating…" : "Create key"}
        </button>
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Your keys</h2>
        {loading ? (
          <p style={{ color: "#94a3b8" }}>Loading…</p>
        ) : keys.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No API keys yet. Create one above.</p>
        ) : (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {keys.map((k) => (
              <li key={k.id} style={{ background: "#1a1a2e", borderRadius: 12, padding: 16, marginBottom: 12, border: "1px solid #2d2d44", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{k.name}</span>
                  <span style={{ marginLeft: 8, color: "#64748b", fontSize: "0.9rem" }}>{k.key_prefix}…</span>
                  {!k.is_active && <span style={{ marginLeft: 8, color: "#f87171", fontSize: "0.85rem" }}>Revoked</span>}
                  {k.last_used_at && <div style={{ fontSize: "0.8rem", color: "#94a3b8", marginTop: 4 }}>Last used: {new Date(k.last_used_at).toLocaleString()}</div>}
                </div>
                {k.is_active && (
                  <button type="button" onClick={() => revokeKey(k.id)} style={{ padding: "8px 16px", background: "transparent", color: "#f87171", border: "1px solid #f87171", borderRadius: 8, cursor: "pointer" }}>
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: 32, padding: 16, background: "#1a1a2e", borderRadius: 12, border: "1px solid #2d2d44" }}>
        <h2 style={{ fontSize: "1.1rem", marginBottom: 8 }}>API base</h2>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 8 }}>
          Main API: <code style={{ background: "#0f0f1a", padding: "2px 6px", borderRadius: 4 }}>{API_BASE}/api/v1</code>
        </p>
        <p style={{ color: "#94a3b8", fontSize: "0.9rem", marginBottom: 12 }}>
          Public voucher validation: <code style={{ background: "#0f0f1a", padding: "2px 6px", borderRadius: 4 }}>{API_BASE}/api/developer/v1/vouchers/validate?code=YOUR_VOUCHER_CODE</code>
        </p>
        <p style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
          Include header <code>X-API-Key: your_key</code>. Response: <code>{"{ valid, data: { booking_id, partner_id, ... } }"}</code>
        </p>
      </section>
    </div>
  );
}
