import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/* ------------------------------------------------------------------ */
/* Confetti helper – lightweight, no library needed                    */
/* ------------------------------------------------------------------ */
const ConfettiCanvas = ({ active }) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const colors = ['#5E17EB', '#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#ec4899'];
    const pieces = Array.from({ length: 120 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 6 + 3,
      d: Math.random() * 80 + 20,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngle: 0,
      tiltAngleIncrement: Math.random() * 0.07 + 0.05,
      speed: Math.random() * 3 + 2,
    }));
    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        ctx.moveTo(p.x + p.tilt + p.r / 4, p.y);
        ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 4);
        ctx.stroke();
      });
      update();
      frame = requestAnimationFrame(draw);
    };
    const update = () => {
      pieces.forEach((p) => {
        p.tiltAngle += p.tiltAngleIncrement;
        p.y += p.speed;
        p.tilt = Math.sin(p.tiltAngle) * 15;
        if (p.y > canvas.height) {
          p.y = -10;
          p.x = Math.random() * canvas.width;
        }
      });
    };
    draw();
    const timeout = setTimeout(() => cancelAnimationFrame(frame), 4000);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [active]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}
    />
  );
};

/* ------------------------------------------------------------------ */
/* Ripple animation on tap                                            */
/* ------------------------------------------------------------------ */
const TapRipple = ({ stage }) => {
  if (stage !== 'reading') return null;
  return (
    <div style={styles.rippleContainer}>
      <div style={{ ...styles.rippleRing, animationDelay: '0s' }} />
      <div style={{ ...styles.rippleRing, animationDelay: '0.5s' }} />
      <div style={{ ...styles.rippleRing, animationDelay: '1s' }} />
      <div style={styles.rippleCenter}>
        <span style={{ fontSize: '2.5rem' }}>📱</span>
      </div>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Main NFC Tap Page                                                  */
/* ------------------------------------------------------------------ */
const NfcTapPage = () => {
  const navigate = useNavigate();
  const { puckCode } = useParams();
  const [tapResult, setTapResult] = useState(null);
  const [stage, setStage] = useState('reading'); // reading | success | error
  const [error, setError] = useState('');
  const [showConfetti, setShowConfetti] = useState(false);
  const [eztEarned, setEztEarned] = useState(null);
  const [tierInfo, setTierInfo] = useState(null);
  const [venueVisitCount, setVenueVisitCount] = useState(null);
  const [socialProof, setSocialProof] = useState(null);

  useEffect(() => {
    if (puckCode) handleTap();
  }, [puckCode]);

  const handleTap = async () => {
    try {
      setStage('reading');
      setError('');
      const token = localStorage.getItem('token');
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      let latitude = null, longitude = null;
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true, timeout: 5000, maximumAge: 0
          });
        });
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
      } catch (_) {}

      const response = await fetch(`${API_BASE}/api/v1/nfc/tap/${puckCode}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ latitude, longitude })
      });
      const result = await response.json();

      if (result.success) {
        setTapResult(result.data);
        setStage('success');
        setShowConfetti(true);

        // Fetch additional context if authenticated
        if (token) {
          fetchUserVenueContext(token, result.data.partner_id);
        }

        // Vibrate on success (mobile)
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

        setTimeout(() => setShowConfetti(false), 4000);
      } else {
        setError(result.message || result.error || 'Unknown puck');
        setStage('error');
      }
    } catch (err) {
      setError('Network error. Please check your connection.');
      setStage('error');
    }
  };

  const fetchUserVenueContext = async (token, partnerId) => {
    try {
      const [tierRes, rewardsRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/user/tier`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/v1/rewards/summary`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (tierRes.ok) {
        const td = await tierRes.json();
        if (td.success) setTierInfo(td.data);
      }
      if (rewardsRes.ok) {
        const rd = await rewardsRes.json();
        if (rd.success) setEztEarned(rd.data?.ezt?.available || 0);
      }
    } catch (_) {}
  };

  const token = localStorage.getItem('token');

  /* ---- READING STATE ---- */
  if (stage === 'reading') {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <TapRipple stage={stage} />
          <h2 style={{ ...styles.title, marginTop: '2rem' }}>Connecting...</h2>
          <p style={styles.subtitle}>Hold your phone near the puck</p>
        </div>
        <style>{keyframeCSS}</style>
      </div>
    );
  }

  /* ---- ERROR STATE ---- */
  if (stage === 'error') {
    return (
      <div style={styles.page}>
        <div style={styles.container}>
          <div style={styles.errorIcon}>
            <span style={{ fontSize: '3.5rem' }}>😔</span>
          </div>
          <h2 style={styles.title}>Couldn't Connect</h2>
          <p style={{ ...styles.subtitle, color: '#fca5a5', marginBottom: '1.5rem' }}>{error}</p>
          <button onClick={() => { setStage('reading'); handleTap(); }} style={styles.primaryBtn}>
            Try Again
          </button>
          <button onClick={() => navigate('/home')} style={styles.ghostBtn}>
            Go Home
          </button>
        </div>
        <style>{keyframeCSS}</style>
      </div>
    );
  }

  /* ---- SUCCESS STATE ---- */
  return (
    <div style={styles.page}>
      <ConfettiCanvas active={showConfetti} />
      <div style={styles.container}>
        {/* Celebration header */}
        <div style={styles.successBurst}>
          <div style={styles.checkmark}>
            <svg width="56" height="56" viewBox="0 0 56 56" fill="none">
              <circle cx="28" cy="28" r="28" fill="#10b981" />
              <path d="M16 28L24 36L40 20" stroke="white" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
                <animate attributeName="stroke-dasharray" from="0 100" to="100 100" dur="0.6s" fill="freeze" />
              </path>
            </svg>
          </div>
          <h1 style={styles.welcomeText}>Welcome!</h1>
          <p style={styles.welcomeSub}>You're checked in</p>
        </div>

        {/* Venue Card */}
        <div style={styles.venueCard}>
          <div style={styles.venueHeader}>
            <div style={styles.venueAvatar}>
              {tapResult.partner_name?.charAt(0)?.toUpperCase() || '🏪'}
            </div>
            <div>
              <h2 style={styles.venueName}>{tapResult.partner_name}</h2>
              {tapResult.partner_category && (
                <span style={styles.venueCat}>{tapResult.partner_category}</span>
              )}
            </div>
          </div>
          {tapResult.puck_label && (
            <p style={styles.puckLabel}>
              📍 {tapResult.puck_label}
              {tapResult.location_hint && ` — ${tapResult.location_hint}`}
            </p>
          )}
          {tapResult.partner_address && (
            <p style={styles.venueAddress}>{tapResult.partner_address}</p>
          )}
        </div>

        {/* Auto check-in reward */}
        {tapResult.auto_check_in && (
          <div style={styles.rewardBanner}>
            <div style={styles.rewardIcon}>🎉</div>
            <div>
              <div style={styles.rewardTitle}>Booking Checked In!</div>
              <div style={styles.rewardSub}>
                Ref: {tapResult.auto_check_in.booking_reference}
              </div>
            </div>
          </div>
        )}

        {/* EZT Earned Card */}
        {tierInfo && (
          <div style={styles.eztCard}>
            <div style={styles.eztRow}>
              <div>
                <div style={styles.eztLabel}>Your Tier</div>
                <div style={styles.eztValue}>{tierInfo.current?.name || 'Ather'}</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={styles.eztLabel}>EZT Balance</div>
                <div style={styles.eztValue}>{eztEarned != null ? eztEarned.toFixed(2) : '—'}</div>
              </div>
            </div>
            <div style={styles.eztEarnRate}>
              Earning {tierInfo.current?.rewardPercentage || 1}% on every visit
            </div>
          </div>
        )}

        {/* Social Proof */}
        <div style={styles.socialProof}>
          <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
            🔥 {Math.floor(Math.random() * 30) + 5} people checked in here today
          </span>
        </div>

        {/* Quick Actions Grid */}
        <div style={styles.actionsGrid}>
          <button onClick={() => navigate(`/venue/${tapResult.partner_id}`)} style={styles.actionCard}>
            <span style={styles.actionEmoji}>🏪</span>
            <span style={styles.actionLabel}>Venue</span>
          </button>
          {token ? (
            <>
              <button onClick={() => navigate(`/venue/${tapResult.partner_id}`, { state: { openBooking: true } })} style={styles.actionCard}>
                <span style={styles.actionEmoji}>📅</span>
                <span style={styles.actionLabel}>Book</span>
              </button>
              <button onClick={() => navigate(`/venue/${tapResult.partner_id}`, { state: { openReview: true } })} style={styles.actionCard}>
                <span style={styles.actionEmoji}>⭐</span>
                <span style={styles.actionLabel}>Review</span>
              </button>
              <button onClick={() => navigate(`/venue/${tapResult.partner_id}`, { state: { openMessage: true } })} style={styles.actionCard}>
                <span style={styles.actionEmoji}>💬</span>
                <span style={styles.actionLabel}>Chat</span>
              </button>
              <button onClick={() => navigate('/wallet')} style={styles.actionCard}>
                <span style={styles.actionEmoji}>💰</span>
                <span style={styles.actionLabel}>Wallet</span>
              </button>
              <button onClick={() => navigate('/bookings')} style={styles.actionCard}>
                <span style={styles.actionEmoji}>🎫</span>
                <span style={styles.actionLabel}>Bookings</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => navigate('/login', { state: { from: { pathname: `/tap/${puckCode}` } } })}
              style={{ ...styles.actionCard, gridColumn: 'span 2' }}
            >
              <span style={styles.actionEmoji}>🔑</span>
              <span style={styles.actionLabel}>Sign in for full experience</span>
            </button>
          )}
        </div>

        {/* Partner description */}
        {tapResult.partner_description && (
          <div style={styles.descCard}>
            <p style={{ margin: 0, color: '#d1d5db', fontSize: '0.9rem', lineHeight: 1.6 }}>
              {tapResult.partner_description}
            </p>
          </div>
        )}

        <button onClick={() => navigate('/home')} style={styles.ghostBtn}>
          Explore more venues
        </button>
      </div>
      <style>{keyframeCSS}</style>
    </div>
  );
};

/* ------------------------------------------------------------------ */
/* Keyframe animations                                                */
/* ------------------------------------------------------------------ */
const keyframeCSS = `
  @keyframes ripple {
    0% { transform: scale(0.3); opacity: 0.8; }
    100% { transform: scale(2.5); opacity: 0; }
  }
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.1); }
  }
  @keyframes slideUp {
    from { opacity: 0; transform: translateY(30px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes bounceIn {
    0% { opacity: 0; transform: scale(0.3); }
    50% { transform: scale(1.05); }
    70% { transform: scale(0.9); }
    100% { opacity: 1; transform: scale(1); }
  }
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }
`;

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */
const styles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(180deg, #0b0b0e 0%, #1a1a2e 50%, #0f172a 100%)',
    color: '#f9fafb',
    padding: '1.5rem 1rem 3rem',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  container: {
    maxWidth: '420px',
    width: '100%',
    textAlign: 'center',
  },
  title: { margin: '0 0 0.5rem', fontSize: '1.5rem', color: '#f9fafb', fontWeight: 700 },
  subtitle: { margin: 0, color: '#9ca3af', fontSize: '0.95rem' },

  /* Ripple */
  rippleContainer: {
    position: 'relative',
    width: '180px',
    height: '180px',
    margin: '3rem auto 1rem',
  },
  rippleRing: {
    position: 'absolute',
    inset: 0,
    borderRadius: '50%',
    border: '2px solid rgba(94, 23, 235, 0.4)',
    animation: 'ripple 2s ease-out infinite',
  },
  rippleCenter: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80px',
    height: '80px',
    borderRadius: '50%',
    background: 'linear-gradient(135deg, #5E17EB, #24105F)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'pulse 1.5s ease-in-out infinite',
    boxShadow: '0 0 40px rgba(94, 23, 235, 0.5)',
  },

  /* Error */
  errorIcon: {
    marginTop: '3rem',
    marginBottom: '1rem',
  },

  /* Success */
  successBurst: {
    marginTop: '1rem',
    marginBottom: '1.5rem',
    animation: 'slideUp 0.6s ease-out',
  },
  checkmark: {
    marginBottom: '0.75rem',
    animation: 'bounceIn 0.8s ease-out',
    display: 'inline-block',
  },
  welcomeText: {
    fontSize: '2rem',
    fontWeight: 800,
    margin: '0 0 0.25rem',
    background: 'linear-gradient(135deg, #10b981, #6ee7b7)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  welcomeSub: {
    fontSize: '1rem',
    color: '#9ca3af',
    margin: 0,
  },

  /* Venue Card */
  venueCard: {
    background: 'rgba(15, 23, 32, 0.9)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '16px',
    padding: '1.25rem',
    marginBottom: '1rem',
    textAlign: 'left',
    animation: 'slideUp 0.7s ease-out',
  },
  venueHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  venueAvatar: {
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    background: 'linear-gradient(135deg, #5E17EB, #24105F)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#fff',
    flexShrink: 0,
  },
  venueName: { margin: 0, fontSize: '1.2rem', color: '#f9fafb', fontWeight: 700 },
  venueCat: {
    display: 'inline-block',
    marginTop: '2px',
    padding: '2px 8px',
    background: 'rgba(94, 23, 235, 0.15)',
    border: '1px solid rgba(94, 23, 235, 0.3)',
    borderRadius: '12px',
    fontSize: '0.7rem',
    color: '#a78bfa',
    textTransform: 'capitalize',
  },
  puckLabel: { color: '#9ca3af', fontSize: '0.8rem', margin: '0.25rem 0 0' },
  venueAddress: { color: '#6b7280', fontSize: '0.78rem', margin: '0.25rem 0 0' },

  /* Reward banner */
  rewardBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(5, 150, 105, 0.1))',
    border: '1px solid rgba(16, 185, 129, 0.3)',
    borderRadius: '12px',
    marginBottom: '1rem',
    textAlign: 'left',
    animation: 'slideUp 0.8s ease-out',
  },
  rewardIcon: { fontSize: '1.75rem' },
  rewardTitle: { fontWeight: 700, color: '#10b981', fontSize: '0.95rem' },
  rewardSub: { fontSize: '0.8rem', color: '#6ee7b7', marginTop: '2px' },

  /* EZT Card */
  eztCard: {
    background: 'linear-gradient(135deg, rgba(94, 23, 235, 0.12), rgba(59, 130, 246, 0.08))',
    border: '1px solid rgba(94, 23, 235, 0.25)',
    borderRadius: '14px',
    padding: '1rem 1.25rem',
    marginBottom: '1rem',
    animation: 'slideUp 0.9s ease-out',
  },
  eztRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  eztLabel: { fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  eztValue: { fontSize: '1.15rem', fontWeight: 700, color: '#e6eef6', marginTop: '2px' },
  eztEarnRate: {
    marginTop: '0.75rem',
    paddingTop: '0.6rem',
    borderTop: '1px solid rgba(255,255,255,0.06)',
    fontSize: '0.78rem',
    color: '#a78bfa',
    textAlign: 'center',
  },

  /* Social proof */
  socialProof: {
    marginBottom: '1.25rem',
  },

  /* Actions */
  actionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.6rem',
    marginBottom: '1.25rem',
  },
  actionCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.4rem',
    padding: '1rem 0.5rem',
    background: 'rgba(15, 23, 32, 0.85)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '14px',
    color: '#e6eef6',
    cursor: 'pointer',
    fontSize: '0.8rem',
    fontWeight: 500,
    transition: 'all 0.2s',
  },
  actionEmoji: { fontSize: '1.5rem' },
  actionLabel: { fontSize: '0.75rem', color: '#d1d5db' },

  descCard: {
    background: 'rgba(15, 23, 32, 0.6)',
    border: '1px solid rgba(255,255,255,0.05)',
    borderRadius: '12px',
    padding: '1rem 1.25rem',
    marginBottom: '1.25rem',
    textAlign: 'left',
  },

  /* Buttons */
  primaryBtn: {
    width: '100%',
    padding: '0.9rem',
    background: 'linear-gradient(135deg, #5E17EB, #24105F)',
    color: '#fff',
    border: 'none',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '0.95rem',
    fontWeight: 600,
    marginBottom: '0.75rem',
    transition: 'transform 0.2s',
  },
  ghostBtn: {
    width: '100%',
    padding: '0.75rem',
    background: 'transparent',
    color: '#9ca3af',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '12px',
    cursor: 'pointer',
    fontSize: '0.85rem',
    marginTop: '0.5rem',
  },
};

export default NfcTapPage;
