import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/auth.css";
import "../styles/profile.css";
import EazyPassModal from "../components/EazyPassModal";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [tierInfo, setTierInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showChangePasswordHint, setShowChangePasswordHint] = useState(false);
  const [prelaunchSignups, setPrelaunchSignups] = useState([]);
  const [membershipCards, setMembershipCards] = useState([]);
  const [showEazyPass, setShowEazyPass] = useState(false);

  const token = localStorage.getItem("token");

  useEffect(() => {
    console.log("navigation done");
    if (!token) {
      navigate("/login", { replace: true });
      return;
    }
    loadProfile();
    loadTierInfo();
    loadPrelaunchSignups();
    loadMembershipCards();
  }, [token, navigate]);

  const loadMembershipCards = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/membership-cards`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) setMembershipCards(data.data);
      }
    } catch (_) {}
  };

  const loadProfile = async () => {
    try {
      setError("");
      const res = await fetch(`${API_BASE}/api/v1/user/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (data.success && data.data) {
        setProfile(data.data);
      } else {
        setError(data?.message ?? data?.error ?? "Failed to load profile");
      }
    } catch (err) {
      setError("Could not load profile. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadTierInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/tier`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.data) setTierInfo(data.data);
      }
    } catch (_) {
      // Tier API optional; ignore
    }
  };

  const loadPrelaunchSignups = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/prelaunch/signups`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.data)) setPrelaunchSignups(data.data);
      }
    } catch (_) {}
  };

  const handleLogout = () => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("userToken");
    window.dispatchEvent(new Event('elizian-logout'));
    navigate("/login", { replace: true });
  };

  const formatDate = (d) => {
    if (!d) return "—";
    const date = new Date(d);
    return date.toLocaleDateString("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  };

  if (loading) {
    return (
      <div className="profile-page" style={{ minHeight: "100vh", paddingBottom: 80 }}>
        <header className="profile-header">
          <h1 className="profile-title">Profile</h1>
        </header>
        <div className="profile-loading" style={{ color: "#1f2937", padding: "2rem 1rem" }}>
          Loading profile…
        </div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="profile-page" style={{ minHeight: "100vh", paddingBottom: 80 }}>
        <header className="profile-header">
          <button type="button" className="profile-back" onClick={() => navigate("/home")}>← Back</button>
          <h1 className="profile-title">Profile</h1>
        </header>
        <div className="profile-error" style={{ color: "#b91c1c", padding: "1.5rem", marginBottom: "1rem" }}>
          {error}
        </div>
        <button
          type="button"
          className="profile-btn secondary"
          onClick={() => { setLoading(true); setError(""); loadProfile(); }}
        >
          Retry
        </button>
        <button
          type="button"
          className="profile-btn secondary"
          onClick={() => navigate("/home")}
          style={{ marginLeft: 8 }}
        >
          Back to Home
        </button>
      </div>
    );
  }

  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(" ") || "—"
    : "—";
  const email = profile?.email || "—";
  const phone = profile?.phone_number || "—";
  const available = Number(profile?.ezt_balance ?? 0);
  const earned = Number(profile?.ezt_total_earned ?? 0);
  const spent = Number(profile?.ezt_total_spent ?? 0);
  const tierName = profile?.tier_name || tierInfo?.current?.name || "—";
  const photoUrl = profile?.profile_photo_url;
  const address = profile?.address;
  const dob = profile?.date_of_birth;
  const gender = profile?.gender;
  const progress = tierInfo?.progress;
  const hasProgress =
    progress && (progress.percentage != null || progress.nextTier);

  return (
    <div className="profile-page" style={{ paddingBottom: 80 }}>
      <header className="profile-header">
        <button
          type="button"
          className="profile-back"
          onClick={() => navigate("/home")}
          aria-label="Back to home"
        >
          ← Back
        </button>
        <h1 className="profile-title">Profile</h1>
      </header>

      <main className="profile-main">
        {/* Optional: Profile photo */}
        {photoUrl && (
          <section className="profile-section profile-photo-section">
            <img src={photoUrl} alt="Profile" className="profile-photo" />
          </section>
        )}

        {/* Must: Name, email, phone */}
        <section className="profile-section">
          <h2 className="profile-section-title">Personal information</h2>
          <ul className="profile-list">
            <li>
              <span className="profile-label">Name</span>
              <span className="profile-value">{name}</span>
            </li>
            <li>
              <span className="profile-label">Email</span>
              <span className="profile-value">{email}</span>
            </li>
            <li>
              <span className="profile-label">Phone</span>
              <span className="profile-value">{phone}</span>
            </li>
          </ul>
        </section>

        {/* Optional: Address, DOB, Gender */}
        {(address || dob || gender) && (
          <section className="profile-section">
            <h2 className="profile-section-title">Additional details</h2>
            <ul className="profile-list">
              {address && (
                <li>
                  <span className="profile-label">Address</span>
                  <span className="profile-value">{address}</span>
                </li>
              )}
              {dob && (
                <li>
                  <span className="profile-label">Date of birth</span>
                  <span className="profile-value">{formatDate(dob)}</span>
                </li>
              )}
              {gender && (
                <li>
                  <span className="profile-label">Gender</span>
                  <span className="profile-value">{gender}</span>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Must: EZT token balance */}
        <section className="profile-section">
          <h2 className="profile-section-title">EZT token balance</h2>
          <div className="profile-tokens">
            <div className="profile-token-item">
              <span className="profile-token-label">Available</span>
              <span className="profile-token-value">
                {available.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="profile-token-item">
              <span className="profile-token-label">Earned</span>
              <span className="profile-token-value">
                {earned.toLocaleString("en-IN")}
              </span>
            </div>
            <div className="profile-token-item">
              <span className="profile-token-label">Spent</span>
              <span className="profile-token-value">
                {spent.toLocaleString("en-IN")}
              </span>
            </div>
          </div>
        </section>

        {/* My passes */}
        <section className="profile-section">
          <h2 className="profile-section-title">Subscription passes</h2>
          <button
            type="button"
            className="profile-btn primary"
            onClick={() => navigate("/passes")}
          >
            My passes
          </button>
        </section>

        {/* Venue membership cards (Phase 3 #17) */}
        {membershipCards.length > 0 && (
          <section className="profile-section">
            <h2 className="profile-section-title">Venue membership cards</h2>
            <p className="profile-hint" style={{ marginBottom: 12, color: "#888", fontSize: "0.9rem" }}>
              Digital collectibles earned by visiting venues. Tap to view venue.
            </p>
            <div className="profile-membership-cards" style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
              {membershipCards.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  className="profile-card-tile"
                  style={{
                    padding: "14px 16px",
                    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
                    border: "1px solid #3d3d5c",
                    borderRadius: 12,
                    textAlign: "left",
                    cursor: "pointer",
                    minWidth: 160,
                  }}
                  onClick={() => navigate(`/venue/${card.partner_id}`)}
                >
                  <div style={{ fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
                    {card.partner_name || "Venue"}
                  </div>
                  <div style={{ fontSize: "0.8rem", color: "#94a3b8" }}>
                    Earned {formatDate(card.earned_at)}
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Founding member signups */}
        {prelaunchSignups.length > 0 && (
          <section className="profile-section">
            <h2 className="profile-section-title">Founding member</h2>
            <ul className="profile-list">
              {prelaunchSignups.map((s) => (
                <li key={s.id || s.partner_id}>
                  <span className="profile-label">{s.venue_name || s.partner_name || "Venue"}</span>
                  <span className="profile-value" style={{ fontSize: "0.85rem", color: "#059669" }}>
                    Signed up {formatDate(s.created_at)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Must: Current tier name */}
        <section className="profile-section">
          <h2 className="profile-section-title">Current tier</h2>
          <p className="profile-tier-name">{tierName}</p>
          {/* Optional: Tier progress */}
          {hasProgress && (
            <div className="profile-tier-progress">
              {progress.nextTier && (
                <p className="profile-tier-next">
                  Next: {progress.nextTier}
                  {progress.amountNeeded != null &&
                    progress.amountNeeded > 0 && (
                      <span>
                        {" "}
                        — Spend ₹{progress.amountNeeded.toLocaleString(
                          "en-IN",
                        )}{" "}
                        more
                      </span>
                    )}
                </p>
              )}
              {progress.percentage != null && (
                <div className="profile-progress-bar-wrap">
                  <div
                    className="profile-progress-bar"
                    style={{ width: `${Math.min(100, progress.percentage)}%` }}
                  />
                  <span className="profile-progress-text">
                    {Math.round(progress.percentage)}%
                  </span>
                </div>
              )}
            </div>
          )}
          {/* EAZY PASS Button */}
          <button
            type="button"
            style={{
              marginTop: 12, width: '100%', padding: '12px',
              background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
              border: '1px solid #4a69bd', borderRadius: 10,
              color: '#fff', fontWeight: 700, fontSize: '0.95rem',
              cursor: 'pointer', letterSpacing: '0.05em',
              transition: 'all 0.2s',
            }}
            onClick={() => setShowEazyPass(true)}
          >
            View EAZY PASS
          </button>

          {/* EZ Club (cross-network tier) */}
          {(profile?.ez_club?.member || (profile?.ez_club?.network_check_ins ?? 0) > 0) && (
            <div className="profile-ez-club" style={{ marginTop: "12px", padding: "10px 12px", background: profile?.ez_club?.member ? "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)" : "#2d2d44", borderRadius: "8px", border: profile?.ez_club?.member ? "1px solid #4a69bd" : "1px solid #333" }}>
              {profile?.ez_club?.member ? (
                <>
                  <span className="profile-ez-club-badge" style={{ fontWeight: 600, color: "#7eb8da" }}>★ EZ Club member</span>
                  <p style={{ margin: "6px 0 0", fontSize: "0.9rem", color: "#aaa" }}>
                    Priority reservations, exclusive events, early access across the network.
                    {profile?.ez_club?.qualified_at && (
                      <span> Member since {formatDate(profile.ez_club.qualified_at)}.</span>
                    )}
                  </p>
                </>
              ) : (
                <p style={{ margin: 0, fontSize: "0.9rem", color: "#aaa" }}>
                  Network check-ins: {profile?.ez_club?.network_check_ins ?? 0}. Redeem at 5+ venues to join EZ Club.
                </p>
              )}
            </div>
          )}
        </section>

        {/* Quick Links */}
        <section className="profile-section">
          <h2 className="profile-section-title">Quick links</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px" }}>
            <button type="button" className="profile-btn secondary" onClick={() => navigate("/wallet")} style={{ marginBottom: 0 }}>
              💰 Wallet
            </button>
            <button type="button" className="profile-btn secondary" onClick={() => navigate("/messages")} style={{ marginBottom: 0 }}>
              💬 Messages
            </button>
            <button type="button" className="profile-btn secondary" onClick={() => navigate("/exclusives")} style={{ marginBottom: 0 }}>
              ✨ Exclusives
            </button>
            <button type="button" className="profile-btn secondary" onClick={() => navigate("/notifications")} style={{ marginBottom: 0 }}>
              🔔 Notifications
            </button>
          </div>
        </section>

        {/* Dining Preferences */}
        <ProfilePreferences token={token} apiBase={API_BASE} />

        {/* Governance & Developer API */}
        <section className="profile-section">
          <button
            type="button"
            className="profile-btn secondary"
            style={{ marginRight: 8, marginBottom: 8 }}
            onClick={() => navigate("/governance")}
          >
            Community governance
          </button>
          <button
            type="button"
            className="profile-btn secondary"
            style={{ marginBottom: 8 }}
            onClick={() => navigate("/developer")}
          >
            Developer API keys
          </button>
        </section>

        {/* Must: Link to bookings */}
        <section className="profile-section">
          <button
            type="button"
            className="profile-btn primary"
            onClick={() => navigate("/bookings")}
          >
            View my bookings
          </button>
          <button
            type="button"
            style={{
              padding: "12px 24px",
              width: "100%",
              background: "linear-gradient(135deg, #ef4444, #dc2626)",
              color: "#fff",
              border: "none",
              marginTop: "10px",
              borderRadius: "8px",
              fontWeight: "600",
              fontSize: "15px",
              letterSpacing: "0.3px",
              cursor: "pointer",
              transition: "all 0.25s ease",
              boxShadow: "0 6px 14px rgba(220,38,38,0.25)",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.transform = "scale(1.03)";
              e.currentTarget.style.boxShadow =
                "0 8px 18px rgba(220,38,38,0.35)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow =
                "0 6px 14px rgba(220,38,38,0.25)";
            }}
          >
            Delete Account
          </button>
        </section>

        {/* Optional: Change password */}
        <section className="profile-section">
          <button
            type="button"
            className="profile-link"
            onClick={() => setShowChangePasswordHint(!showChangePasswordHint)}
          >
            Change password
          </button>
          {showChangePasswordHint && (
            <p className="profile-hint">
              Use &quot;Forgot password&quot; on the login page. We’ll send a
              code to your email to set a new password.
            </p>
          )}
        </section>

        {/* Must: Logout */}
        <section className="profile-section profile-actions">
          <button
            type="button"
            className="profile-btn logout"
            onClick={handleLogout}
          >
            Log out
          </button>
        </section>
      </main>

      <EazyPassModal isOpen={showEazyPass} onClose={() => setShowEazyPass(false)} />
    </div>
  );
};

/* ---- Dining Preferences Sub-Component ---- */
const ProfilePreferences = ({ token, apiBase }) => {
  const [prefs, setPrefs] = useState(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    cuisine_preferences: [],
    preferred_occasions: [],
    preferred_time_of_day: '',
    price_range: '',
    dietary_restrictions: [],
  });

  const cuisineOptions = ['Indian', 'Italian', 'Japanese', 'Chinese', 'Mexican', 'Thai', 'Mediterranean', 'American', 'Korean', 'French'];
  const occasionOptions = ['Date Night', 'Business', 'Birthday', 'Anniversary', 'Casual', 'Family', 'Celebration'];
  const timeOptions = ['morning', 'afternoon', 'evening', 'night'];
  const priceOptions = ['budget', 'mid', 'premium', 'luxury'];
  const dietaryOptions = ['Vegetarian', 'Vegan', 'Gluten-free', 'Halal', 'Kosher', 'Nut-free', 'Dairy-free'];

  useEffect(() => {
    loadPrefs();
  }, []);

  const loadPrefs = async () => {
    try {
      const res = await fetch(`${apiBase}/api/v1/recommendations/preferences`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setPrefs(data.data);
        setForm({
          cuisine_preferences: data.data.cuisine_preferences || [],
          preferred_occasions: data.data.preferred_occasions || [],
          preferred_time_of_day: data.data.preferred_time_of_day || '',
          price_range: data.data.price_range || '',
          dietary_restrictions: data.data.dietary_restrictions || [],
        });
      }
    } catch (_) {}
  };

  const toggleArrayItem = (field, item) => {
    setForm(prev => {
      const arr = prev[field] || [];
      return { ...prev, [field]: arr.includes(item) ? arr.filter(i => i !== item) : [...arr, item] };
    });
  };

  const savePrefs = async () => {
    setSaving(true);
    try {
      await fetch(`${apiBase}/api/v1/recommendations/preferences`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      setPrefs(form);
      setEditing(false);
    } catch (_) {} finally {
      setSaving(false);
    }
  };

  const chipStyle = (selected) => ({
    padding: '5px 12px',
    border: selected ? '1px solid #004f4a' : '1px solid #e5e7eb',
    borderRadius: '20px',
    background: selected ? '#004f4a' : '#fff',
    color: selected ? '#fff' : '#374151',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.15s',
  });

  if (!editing) {
    const hasPref = prefs && (
      (prefs.cuisine_preferences && prefs.cuisine_preferences.length > 0) ||
      prefs.price_range || prefs.preferred_time_of_day
    );

    return (
      <section className="profile-section">
        <h2 className="profile-section-title">Dining preferences</h2>
        {hasPref ? (
          <div style={{ marginBottom: '8px' }}>
            {prefs.cuisine_preferences?.length > 0 && (
              <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#374151' }}>
                <strong>Cuisines:</strong> {prefs.cuisine_preferences.join(', ')}
              </p>
            )}
            {prefs.price_range && (
              <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#374151' }}>
                <strong>Price:</strong> {prefs.price_range}
              </p>
            )}
            {prefs.dietary_restrictions?.length > 0 && (
              <p style={{ margin: '0 0 4px', fontSize: '0.85rem', color: '#374151' }}>
                <strong>Dietary:</strong> {prefs.dietary_restrictions.join(', ')}
              </p>
            )}
          </div>
        ) : (
          <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '8px' }}>
            Set your dining preferences for better recommendations.
          </p>
        )}
        <button type="button" className="profile-btn secondary" onClick={() => setEditing(true)}>
          {hasPref ? 'Edit preferences' : 'Set preferences'}
        </button>
      </section>
    );
  }

  return (
    <section className="profile-section">
      <h2 className="profile-section-title">Dining preferences</h2>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Cuisines</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {cuisineOptions.map(c => (
            <button key={c} type="button" style={chipStyle(form.cuisine_preferences.includes(c))} onClick={() => toggleArrayItem('cuisine_preferences', c)}>
              {c}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Occasions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {occasionOptions.map(o => (
            <button key={o} type="button" style={chipStyle(form.preferred_occasions.includes(o))} onClick={() => toggleArrayItem('preferred_occasions', o)}>
              {o}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Preferred time</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {timeOptions.map(t => (
            <button key={t} type="button" style={chipStyle(form.preferred_time_of_day === t)} onClick={() => setForm(prev => ({ ...prev, preferred_time_of_day: prev.preferred_time_of_day === t ? '' : t }))}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Price range</label>
        <div style={{ display: 'flex', gap: '6px' }}>
          {priceOptions.map(p => (
            <button key={p} type="button" style={chipStyle(form.price_range === p)} onClick={() => setForm(prev => ({ ...prev, price_range: prev.price_range === p ? '' : p }))}>
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: '16px' }}>
        <label style={{ display: 'block', fontWeight: 600, fontSize: '0.8rem', color: '#374151', marginBottom: '4px' }}>Dietary restrictions</label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {dietaryOptions.map(d => (
            <button key={d} type="button" style={chipStyle(form.dietary_restrictions.includes(d))} onClick={() => toggleArrayItem('dietary_restrictions', d)}>
              {d}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px' }}>
        <button type="button" className="profile-btn secondary" onClick={() => setEditing(false)} style={{ flex: 1 }}>Cancel</button>
        <button type="button" className="profile-btn primary" onClick={savePrefs} disabled={saving} style={{ flex: 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </section>
  );
};

export default Profile;
