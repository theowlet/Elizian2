import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';
import '../styles/profile.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const Profile = () => {
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [tierInfo, setTierInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showChangePasswordHint, setShowChangePasswordHint] = useState(false);

  const token = localStorage.getItem('token');

  useEffect(() => {
    console.log("navigation done")
    if (!token) {
      navigate('/login', { replace: true });
      return;
    }
    loadProfile();
    loadTierInfo();
  }, [token, navigate]);

  const loadProfile = async () => {
    try {
      setError('');
      const res = await fetch(`${API_BASE}/api/v1/user/profile`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        navigate('/login', { replace: true });
        return;
      }
      const data = await res.json();
      if (data.success && data.data) {
        setProfile(data.data);
      } else {
        setError(data.message || 'Failed to load profile');
      }
    } catch (err) {
      setError('Could not load profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const loadTierInfo = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/tier`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
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

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login', { replace: true });
  };

  const formatDate = (d) => {
    if (!d) return '—';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="profile-page">
        <div className="profile-loading">Loading profile…</div>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="profile-page">
        <div className="profile-error">{error}</div>
        <button type="button" className="profile-btn secondary" onClick={() => navigate('/home')}>
          Back to Home
        </button>
      </div>
    );
  }

  const name = profile
    ? [profile.first_name, profile.last_name].filter(Boolean).join(' ') || '—'
    : '—';
  const email = profile?.email || '—';
  const phone = profile?.phone_number || '—';
  const available = Number(profile?.ezt_balance ?? 0);
  const earned = Number(profile?.ezt_total_earned ?? 0);
  const spent = Number(profile?.ezt_total_spent ?? 0);
  const tierName = profile?.tier_name || tierInfo?.current?.name || '—';
  const photoUrl = profile?.profile_photo_url;
  const address = profile?.address;
  const dob = profile?.date_of_birth;
  const gender = profile?.gender;
  const progress = tierInfo?.progress;
  const hasProgress = progress && (progress.percentage != null || progress.nextTier);

  return (
    <div className="profile-page">
      <header className="profile-header">
        <button
          type="button"
          className="profile-back"
          onClick={() => navigate('/home')}
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
            <img
              src={photoUrl}
              alt="Profile"
              className="profile-photo"
            />
          </section>
        )}

        {/* Must: Name, email, phone */}
        <section className="profile-section">
          <h2 className="profile-section-title">Personal information</h2>
          <ul className="profile-list">
            <li><span className="profile-label">Name</span><span className="profile-value">{name}</span></li>
            <li><span className="profile-label">Email</span><span className="profile-value">{email}</span></li>
            <li><span className="profile-label">Phone</span><span className="profile-value">{phone}</span></li>
          </ul>
        </section>

        {/* Optional: Address, DOB, Gender */}
        {(address || dob || gender) && (
          <section className="profile-section">
            <h2 className="profile-section-title">Additional details</h2>
            <ul className="profile-list">
              {address && <li><span className="profile-label">Address</span><span className="profile-value">{address}</span></li>}
              {dob && <li><span className="profile-label">Date of birth</span><span className="profile-value">{formatDate(dob)}</span></li>}
              {gender && <li><span className="profile-label">Gender</span><span className="profile-value">{gender}</span></li>}
            </ul>
          </section>
        )}

        {/* Must: EZT token balance */}
        <section className="profile-section">
          <h2 className="profile-section-title">EZT token balance</h2>
          <div className="profile-tokens">
            <div className="profile-token-item">
              <span className="profile-token-label">Available</span>
              <span className="profile-token-value">{available.toLocaleString('en-IN')}</span>
            </div>
            <div className="profile-token-item">
              <span className="profile-token-label">Earned</span>
              <span className="profile-token-value">{earned.toLocaleString('en-IN')}</span>
            </div>
            <div className="profile-token-item">
              <span className="profile-token-label">Spent</span>
              <span className="profile-token-value">{spent.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </section>

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
                  {progress.amountNeeded != null && progress.amountNeeded > 0 && (
                    <span> — Spend ₹{progress.amountNeeded.toLocaleString('en-IN')} more</span>
                  )}
                </p>
              )}
              {progress.percentage != null && (
                <div className="profile-progress-bar-wrap">
                  <div
                    className="profile-progress-bar"
                    style={{ width: `${Math.min(100, progress.percentage)}%` }}
                  />
                  <span className="profile-progress-text">{Math.round(progress.percentage)}%</span>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Must: Link to bookings */}
        <section className="profile-section">
          <button
            type="button"
            className="profile-btn primary"
            onClick={() => navigate('/bookings')}
          >
            View my bookings
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
              Use &quot;Forgot password&quot; on the login page. We’ll send a code to your email to set a new password.
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
    </div>
  );
};

export default Profile;
