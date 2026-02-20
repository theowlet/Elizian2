import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

export default function GovernancePage() {
  const navigate = useNavigate();
  const [proposals, setProposals] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createOptions, setCreateOptions] = useState("");
  const [createEnds, setCreateEnds] = useState("");
  const token = localStorage.getItem("token");

  useEffect(() => {
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    loadProposals();
  }, [token, navigate]);

  const loadProposals = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/governance/proposals`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) setProposals(data.data);
    } catch (_) {}
    setLoading(false);
  };

  const loadProposal = async (id) => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/governance/proposals/${id}`);
      const data = await res.json();
      if (data.success && data.data) setSelected(data.data);
    } catch (_) {}
  };

  const castVote = async (proposalId, optionIndex) => {
    if (!token) return;
    setVoting(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/governance/proposals/${proposalId}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ option_index: optionIndex }),
      });
      const data = await res.json();
      if (data.success) {
        loadProposal(proposalId);
        loadProposals();
      } else {
        alert(data.error || data.message || "Vote failed");
      }
    } catch (e) {
      alert("Vote failed");
    }
    setVoting(false);
  };

  const createProposal = async () => {
    const title = createTitle.trim();
    const options = createOptions.split(",").map((s) => s.trim()).filter(Boolean);
    if (!title || options.length < 2) {
      alert("Title and at least 2 options (comma-separated) required");
      return;
    }
    const ends = createEnds || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
    setCreating(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/governance/proposals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title, description: createDesc.trim() || null, options, voting_ends_at: new Date(ends).toISOString() }),
      });
      const data = await res.json();
      if (data.success) {
        setCreateTitle("");
        setCreateDesc("");
        setCreateOptions("");
        setCreateEnds("");
        loadProposals();
      } else {
        alert(data.error || data.message || "Failed to create");
      }
    } catch (e) {
      alert("Failed to create proposal");
    }
    setCreating(false);
  };

  const options = selected?.options || [];
  const results = selected?.results || [];
  const endsAt = selected?.voting_ends_at ? new Date(selected.voting_ends_at) : null;
  const isOpen = selected?.status === "open" && endsAt && endsAt > new Date();

  return (
    <div style={{ minHeight: "100vh", background: "#0f0f1a", color: "#e2e8f0", padding: "20px 16px" }}>
      <header style={{ marginBottom: 24 }}>
        <button type="button" onClick={() => navigate("/profile")} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer", fontSize: "1rem" }}>
          ← Back to Profile
        </button>
        <h1 style={{ margin: "12px 0 0", fontSize: "1.5rem" }}>Community governance</h1>
        <p style={{ margin: "8px 0 0", color: "#94a3b8", fontSize: "0.9rem" }}>
          Vote on proposals. Your influence is based on your EZT balance.
        </p>
      </header>

      {loading ? (
        <p style={{ color: "#94a3b8" }}>Loading proposals…</p>
      ) : selected ? (
        <div style={{ maxWidth: 560 }}>
          <button type="button" onClick={() => setSelected(null)} style={{ marginBottom: 16, color: "#94a3b8", background: "none", border: "none", cursor: "pointer" }}>
            ← All proposals
          </button>
          <div style={{ background: "#1a1a2e", borderRadius: 12, padding: 20, border: "1px solid #2d2d44" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "1.25rem" }}>{selected.title}</h2>
            {selected.description && <p style={{ color: "#94a3b8", marginBottom: 16, whiteSpace: "pre-wrap" }}>{selected.description}</p>}
            <p style={{ fontSize: "0.85rem", color: "#64748b", marginBottom: 16 }}>
              Voting ends: {endsAt ? endsAt.toLocaleString() : "—"} · Status: {selected.status}
            </p>
            {results.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <strong>Results</strong>
                <ul style={{ margin: "8px 0 0", paddingLeft: 20 }}>
                  {results.map((r, i) => (
                    <li key={i} style={{ marginBottom: 4 }}>
                      {r.label}: {r.vote_count} vote(s), weight {Number(r.weighted_sum).toFixed(1)}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {isOpen && options.length > 0 && (
              <div>
                <strong>Your vote</strong>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                  {options.map((label, idx) => (
                    <button
                      key={idx}
                      type="button"
                      disabled={voting}
                      onClick={() => castVote(selected.id, idx)}
                      style={{
                        padding: "12px 16px",
                        background: "#2563eb",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        cursor: voting ? "not-allowed" : "pointer",
                        textAlign: "left",
                      }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {proposals.length === 0 ? (
            <li style={{ color: "#94a3b8" }}>No proposals yet.</li>
          ) : (
            proposals.map((p) => (
              <li
                key={p.id}
                style={{
                  background: "#1a1a2e",
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 12,
                  border: "1px solid #2d2d44",
                  cursor: "pointer",
                }}
                onClick={() => loadProposal(p.id)}
              >
                <div style={{ fontWeight: 600 }}>{p.title}</div>
                <div style={{ fontSize: "0.85rem", color: "#94a3b8", marginTop: 4 }}>
                  Ends {p.voting_ends_at ? new Date(p.voting_ends_at).toLocaleDateString() : ""} · {p.status}
                </div>
              </li>
            ))
          )}
        </ul>
      )}

      {!selected && (
        <section style={{ marginTop: 32, padding: 20, background: "#1a1a2e", borderRadius: 12, border: "1px solid #2d2d44", maxWidth: 560 }}>
          <h2 style={{ fontSize: "1.1rem", marginBottom: 12 }}>Create proposal</h2>
          <input type="text" placeholder="Title" value={createTitle} onChange={(e) => setCreateTitle(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8, background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 8, color: "#e2e8f0" }} />
          <textarea placeholder="Description (optional)" value={createDesc} onChange={(e) => setCreateDesc(e.target.value)} rows={2} style={{ width: "100%", padding: 10, marginBottom: 8, background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 8, color: "#e2e8f0" }} />
          <input type="text" placeholder="Options (comma-separated, e.g. Yes, No)" value={createOptions} onChange={(e) => setCreateOptions(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 8, background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 8, color: "#e2e8f0" }} />
          <input type="datetime-local" placeholder="Voting ends" value={createEnds} onChange={(e) => setCreateEnds(e.target.value)} style={{ width: "100%", padding: 10, marginBottom: 12, background: "#0f0f1a", border: "1px solid #2d2d44", borderRadius: 8, color: "#e2e8f0" }} />
          <button type="button" disabled={creating} onClick={createProposal} style={{ padding: "10px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 8, cursor: creating ? "not-allowed" : "pointer" }}>
            {creating ? "Creating…" : "Create proposal"}
          </button>
        </section>
      )}
    </div>
  );
}
