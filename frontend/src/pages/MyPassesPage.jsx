import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const MyPassesPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem("token");
  const [passes, setPasses] = useState([]);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [claimCode, setClaimCode] = useState("");
  const [claimPassId, setClaimPassId] = useState("");
  const [claiming, setClaiming] = useState(false);

  useEffect(() => {
    if (!token) {
      navigate("/login", { state: { from: { pathname: "/passes" } } });
      return;
    }
    load();
  }, [token, navigate]);

  async function load() {
    setLoading(true);
    try {
      const [pRes, prodRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/passes/me`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/v1/passes/products`),
      ]);
      const pData = await pRes.json();
      const prodData = await prodRes.json();
      if (pData.success && Array.isArray(pData.data)) setPasses(pData.data);
      if (prodData.success && Array.isArray(prodData.data)) setProducts(prodData.data);
    } catch (e) {}
    setLoading(false);
  }

  async function handleClaim(e) {
    e.preventDefault();
    if (!claimPassId || !claimCode.trim() || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/passes/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ subscription_pass_id: claimPassId, code: claimCode.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setClaimCode("");
        load();
      } else {
        alert(data?.message ?? data?.error ?? "Claim failed");
      }
    } catch (err) {
      alert("Network error");
    }
    setClaiming(false);
  }

  if (!token) return null;
  return (
    <div className="my-passes-page" style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem" }}>
      <h1>My passes</h1>
      <p style={{ color: "#666" }}>Subscription passes you’ve claimed. Show the code at the venue to redeem.</p>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <>
          {passes.length === 0 ? (
            <p style={{ color: "#888" }}>You have no passes yet. Claim one below if you have a code.</p>
          ) : (
            <ul style={{ listStyle: "none", padding: 0 }}>
              {passes.map((p) => (
                <li key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 16, marginBottom: 12 }}>
                  <strong>{p.pass_name}</strong>
                  {p.partner_name && <span style={{ color: "#666", marginLeft: 8 }}>@ {p.partner_name}</span>}
                  <div style={{ marginTop: 8, fontFamily: "monospace", fontSize: "1.1rem" }}>{p.code}</div>
                  <div style={{ fontSize: "0.85rem", color: p.redeemed_at ? "#b91c1c" : "#059669" }}>
                    {p.redeemed_at ? `Redeemed ${new Date(p.redeemed_at).toLocaleDateString()}` : "Active"}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {products.length > 0 && (
            <form onSubmit={handleClaim} style={{ marginTop: 24, padding: 16, border: "1px solid #eee", borderRadius: 8 }}>
              <h3>Claim a pass</h3>
              <div style={{ marginBottom: 12 }}>
                <label>Pass type</label>
                <select className="pc-form-input" value={claimPassId} onChange={(e) => setClaimPassId(e.target.value)} style={{ width: "100%", padding: 8 }}>
                  <option value="">Select pass</option>
                  {products.map((pr) => (
                    <option key={pr.id} value={pr.id}>{pr.name}{pr.partner_id ? " (venue-specific)" : ""}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: 12 }}>
                <label>Code</label>
                <input type="text" className="pc-form-input" value={claimCode} onChange={(e) => setClaimCode(e.target.value)} placeholder="Enter your pass code" style={{ width: "100%", padding: 8 }} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!claimPassId || !claimCode.trim() || claiming}>{claiming ? "Claiming…" : "Claim"}</button>
            </form>
          )}
        </>
      )}
      <p style={{ marginTop: 24 }}>
        <button type="button" className="btn btn-secondary" onClick={() => navigate(-1)}>Back</button>
      </p>
    </div>
  );
};

export default MyPassesPage;
