import React, { useState, useEffect, useRef, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

/* ═══════════════════════════════════════════════════════════════════════
   EAZY PASS — Luxury Dark Gold Digital Membership Card
   Design: Obsidian black + metallic gold, Amex Black Card inspired
   ═══════════════════════════════════════════════════════════════════════ */

// ─── Luxury Gold Theme Constants ─────────────────────────────────────
const GOLD = {
  metallic:   '#E0B56F',
  champagne:  '#F5D18C',
  dark:       '#A6782E',
  muted:      '#9A7B4F',
  light:      '#F0D9A0',
  glow:       'rgba(224,181,111,0.4)',
  glowStrong: 'rgba(224,181,111,0.6)',
  glowSoft:   'rgba(224,181,111,0.15)',
};

const OBSIDIAN = {
  base:    '#0B0B0E',
  surface: '#111115',
  violet:  '#1A103F',
  card:    '#0E0C15',
  border:  'rgba(224,181,111,0.12)',
};

// Tier-specific accent overrides (subtle tint on the gold base)
const TIER_ACCENTS = {
  Ather:   { emoji: '\u{1FAA8}', label: 'ATHER',   glow: 'rgba(156,163,175,0.25)' },
  Nova:    { emoji: '\u2B50',    label: 'NOVA',     glow: 'rgba(96,165,250,0.2)'   },
  Luminar: { emoji: '\u{1F48E}', label: 'LUMINAR',  glow: 'rgba(167,139,250,0.2)'  },
  Valiant: { emoji: '\u{1F3C5}', label: 'VALIANT',  glow: 'rgba(245,158,11,0.25)'  },
  Echelon: { emoji: '\u{1F451}', label: 'ECHELON',  glow: 'rgba(224,181,111,0.5)', flame: true },
};

const EazyPassModal = ({ isOpen, onClose }) => {
  const [cardData, setCardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [qrRefreshing, setQrRefreshing] = useState(false);
  const modalRef = useRef(null);
  const touchStartY = useRef(null);
  const qrRefreshTimer = useRef(null);

  // ─── Fetch tier card data (QR regenerated on every open) ───────────
  const loadCardData = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/tier-card`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCardData(data.data);
      } else {
        setError(data.message || 'Failed to load EAZY PASS');
      }
    } catch (_) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-refresh QR every 4 minutes (token has 5-min expiry)
  const refreshQr = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setQrRefreshing(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/user/tier-card`, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success && data.data) {
        setCardData(prev => prev ? { ...prev, qrToken: data.data.qrToken } : data.data);
      }
    } catch (_) { /* silent */ }
    finally { setQrRefreshing(false); }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadCardData();
      // Set up 4-minute QR auto-refresh
      qrRefreshTimer.current = setInterval(refreshQr, 4 * 60 * 1000);
      return () => clearInterval(qrRefreshTimer.current);
    } else {
      clearInterval(qrRefreshTimer.current);
    }
  }, [isOpen, loadCardData, refreshQr]);

  // Keyboard: Escape to close
  useEffect(() => {
    if (!isOpen) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, onClose]);

  // Focus trap
  useEffect(() => {
    if (!isOpen || !modalRef.current) return;
    const f = modalRef.current.querySelectorAll('button, [tabindex]:not([tabindex="-1"])');
    if (f.length) f[0].focus();
  }, [isOpen, loading]);

  // Prevent body scroll
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isOpen]);

  // Swipe down to close (mobile)
  const onTouchStart = (e) => { touchStartY.current = e.touches[0].clientY; };
  const onTouchEnd = (e) => {
    if (touchStartY.current !== null) {
      if (e.changedTouches[0].clientY - touchStartY.current > 100) onClose();
      touchStartY.current = null;
    }
  };

  if (!isOpen) return null;

  const tierName = cardData?.tier?.name || 'Ather';
  const tierAccent = TIER_ACCENTS[tierName] || TIER_ACCENTS.Ather;

  return (
    <>
      <style>{KEYFRAME_CSS}</style>

      {/* ─── Backdrop (80% dark + blur + radial vignette) ─── */}
      <div
        style={S.overlay}
        onClick={onClose}
        role="presentation"
        className="ezp-overlay"
      />

      {/* ─── Modal Container ─── */}
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label="EAZY PASS Digital Membership Card"
        style={S.modal}
        className="ezp-modal"
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Close */}
        <button onClick={onClose} style={S.closeBtn} aria-label="Close">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M4.5 4.5L13.5 13.5M13.5 4.5L4.5 13.5" stroke="#E0B56F" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>

        {/* Swipe pill */}
        <div style={S.swipePill} />

        {/* ─── Loading ─── */}
        {loading ? (
          <div style={S.centerWrap}>
            <div className="ezp-spinner" />
            <p style={{ color: GOLD.muted, marginTop: 16, fontSize: '0.85rem', letterSpacing: '0.08em' }}>
              LOADING YOUR PASS...
            </p>
          </div>
        ) : error ? (
          <div style={S.centerWrap}>
            <p style={{ color: '#ef4444', marginBottom: 14, fontSize: '0.9rem' }}>{error}</p>
            <button onClick={loadCardData} style={S.retryBtn}>Retry</button>
          </div>
        ) : cardData ? (
          /* ═══════════════════════════════════════════════════════════════
             THE CARD
             ═══════════════════════════════════════════════════════════════ */
          <div className="ezp-card" style={S.card}>

            {/* Ambient glow orbs */}
            <div className="ezp-glow-top" style={S.glowTop} />
            <div className="ezp-glow-bottom" style={S.glowBottom} />

            {/* Animated edge shimmer (every 6s) */}
            <div className="ezp-shimmer-border" style={S.shimmerBorder} />

            {/* ── Header: Monogram + ELIZIAN + EAZY PASS ── */}
            <div style={S.header}>
              <div style={S.logoRow}>
                <div className="ezp-monogram" style={S.monogram}>E</div>
                <div>
                  <div style={S.brandName}>ELIZIAN</div>
                  <div className="ezp-pass-label" style={S.passLabel}>EAZY PASS</div>
                </div>
              </div>
            </div>

            {/* Thin gold separator */}
            <div style={S.separator} />

            {/* ── Tier Badge ── */}
            <div style={S.tierSection}>
              <div className={`ezp-tier-badge ${tierAccent.flame ? 'ezp-echelon-flame' : ''}`} style={S.tierBadge}>
                <span style={{ fontSize: '1.6rem', lineHeight: 1 }}>{tierAccent.emoji}</span>
                <span style={S.tierLabel}>{tierAccent.label}</span>
              </div>
              <div style={S.tierLevel}>LEVEL {cardData.tier?.level || 1}</div>
            </div>

            {/* ── User Identity ── */}
            <div style={S.identitySection}>
              <div style={S.userName}>{cardData.user?.name || 'Member'}</div>
              <div style={S.passNumber}>{cardData.cardNumber || 'ELZ-0000-00000000'}</div>
            </div>

            {/* ── QR Code (high-contrast, white on dark matte) ── */}
            <div style={S.qrSection}>
              <div style={S.qrOuter}>
                <div style={S.qrFrame}>
                  <div style={S.qrInner}>
                    <QRCodeSVG
                      value={cardData.qrToken || 'invalid'}
                      size={148}
                      bgColor="#FFFFFF"
                      fgColor="#0B0B0E"
                      level="H"
                      includeMargin
                      imageSettings={{
                        src: '',
                        height: 0,
                        width: 0,
                        excavate: false,
                      }}
                    />
                  </div>
                  {/* Scan-line animation */}
                  <div className="ezp-scan-line" style={S.scanLine} />
                </div>
                {qrRefreshing && (
                  <div style={S.qrRefreshIndicator}>Refreshing...</div>
                )}
              </div>
              <div style={S.qrHint}>SCAN TO VERIFY MEMBERSHIP</div>
            </div>

            {/* ── Wallet Stats ── */}
            <div style={S.statsRow}>
              <StatItem label="EZT BALANCE" value={(cardData.wallet?.available || 0).toFixed(2)} />
              <div style={S.statDivider} />
              <StatItem label="REWARD RATE" value={`${cardData.tier?.rewardPercentage || 1}%`} />
              <div style={S.statDivider} />
              <StatItem label="TOTAL EARNED" value={(cardData.wallet?.totalEarned || 0).toFixed(2)} />
            </div>

            {/* ── Next Tier Progress ── */}
            {cardData.nextTier && (
              <div style={S.progressSection}>
                <div style={S.progressLabel}>
                  {cardData.nextTier.progressPercentage?.toFixed(0) || 0}% to {cardData.nextTier.name}
                </div>
                <div style={S.progressTrack}>
                  <div
                    className="ezp-progress-fill"
                    style={{ ...S.progressFill, width: `${Math.min(cardData.nextTier.progressPercentage || 0, 100)}%` }}
                  />
                </div>
              </div>
            )}

            {/* ── Benefits ── */}
            {cardData.benefits && cardData.benefits.length > 0 && (
              <div style={S.benefitsSection}>
                <div style={S.benefitsTitle}>ACTIVE BENEFITS</div>
                <div style={S.benefitsList}>
                  {cardData.benefits.map((b, i) => (
                    <span key={i} style={S.benefitChip}>{b}</span>
                  ))}
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div style={S.footer}>
              <span style={S.footerText}>
                Member since {cardData.user?.memberSince
                  ? new Date(cardData.user.memberSince).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
                  : '---'}
              </span>
              <span style={S.footerDot}>&middot;</span>
              <span style={S.footerText}>elizian.in</span>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
};

/* ─── Stat Item ─────────────────────────────────────────────────────── */
const StatItem = ({ label, value }) => (
  <div style={S.statItem}>
    <div style={S.statLabel}>{label}</div>
    <div style={S.statValue}>{value}</div>
  </div>
);

/* ═══════════════════════════════════════════════════════════════════════
   KEYFRAME ANIMATIONS — GPU-accelerated, CSS transforms only
   ═══════════════════════════════════════════════════════════════════════ */
const KEYFRAME_CSS = `
  @keyframes ezpFadeIn {
    from { opacity: 0; }
    to   { opacity: 1; }
  }
  @keyframes ezpSlideUp {
    from { opacity: 0; transform: translateY(48px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
  @keyframes ezpShimmerEdge {
    0%   { background-position: -300% 0; }
    40%  { background-position: 300% 0; }
    100% { background-position: 300% 0; }
  }
  @keyframes ezpGlowPulse {
    0%, 100% { opacity: 0.3; transform: scale(1) translate3d(0,0,0); }
    50%      { opacity: 0.55; transform: scale(1.12) translate3d(0,0,0); }
  }
  @keyframes ezpScanLine {
    0%   { top: 4px; opacity: 0; }
    10%  { opacity: 0.7; }
    90%  { opacity: 0.7; }
    100% { top: calc(100% - 4px); opacity: 0; }
  }
  @keyframes ezpSpin {
    to { transform: rotate(360deg); }
  }
  @keyframes ezpBadgeGlow {
    0%, 100% { box-shadow: 0 0 8px ${GOLD.glowSoft}; }
    50%      { box-shadow: 0 0 24px ${GOLD.glow}; }
  }
  @keyframes ezpEchelonFlame {
    0%, 100% { box-shadow: 0 0 10px ${GOLD.glow}, 0 0 30px rgba(224,181,111,0.2); }
    25%      { box-shadow: 0 0 16px ${GOLD.glowStrong}, 0 0 40px rgba(212,175,55,0.3); }
    50%      { box-shadow: 0 0 22px ${GOLD.glowStrong}, 0 0 50px rgba(224,181,111,0.35); }
    75%      { box-shadow: 0 0 16px ${GOLD.glow}, 0 0 35px rgba(212,175,55,0.25); }
  }
  @keyframes ezpProgressGlow {
    0%, 100% { box-shadow: 0 0 4px ${GOLD.glowSoft}; }
    50%      { box-shadow: 0 0 10px ${GOLD.glow}; }
  }
  @keyframes ezpMonogramShine {
    0%   { background-position: -200% center; }
    100% { background-position: 200% center; }
  }
  @keyframes ezpPassLabelGlow {
    0%, 100% { text-shadow: 0 0 6px ${GOLD.glowSoft}; }
    50%      { text-shadow: 0 0 14px ${GOLD.glow}; }
  }

  .ezp-overlay {
    animation: ezpFadeIn 0.3s ease-out;
  }
  .ezp-modal {
    animation: ezpSlideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1);
  }
  .ezp-shimmer-border {
    background: linear-gradient(
      90deg,
      transparent 0%,
      transparent 20%,
      ${GOLD.metallic}18 35%,
      ${GOLD.champagne}40 50%,
      ${GOLD.metallic}18 65%,
      transparent 80%,
      transparent 100%
    );
    background-size: 300% 100%;
    animation: ezpShimmerEdge 6s ease-in-out infinite;
  }
  .ezp-glow-top {
    animation: ezpGlowPulse 5s ease-in-out infinite;
  }
  .ezp-glow-bottom {
    animation: ezpGlowPulse 5s ease-in-out infinite 2.5s;
  }
  .ezp-scan-line {
    animation: ezpScanLine 2.5s ease-in-out infinite 1s;
  }
  .ezp-spinner {
    width: 40px; height: 40px;
    border: 2px solid rgba(224,181,111,0.15);
    border-top-color: ${GOLD.metallic};
    border-radius: 50%;
    animation: ezpSpin 1s linear infinite;
  }
  .ezp-tier-badge {
    animation: ezpBadgeGlow 3s ease-in-out infinite;
  }
  .ezp-echelon-flame {
    animation: ezpEchelonFlame 2s ease-in-out infinite !important;
  }
  .ezp-progress-fill {
    animation: ezpProgressGlow 2s ease-in-out infinite;
  }
  .ezp-monogram {
    background: linear-gradient(
      90deg,
      ${GOLD.dark} 0%,
      ${GOLD.champagne} 40%,
      ${GOLD.metallic} 60%,
      ${GOLD.dark} 100%
    );
    background-size: 200% auto;
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: ezpMonogramShine 4s linear infinite;
  }
  .ezp-pass-label {
    animation: ezpPassLabelGlow 3s ease-in-out infinite;
  }

  /* ─── Mobile Full-Screen ─── */
  @media (max-width: 480px) {
    .ezp-modal {
      width: 100vw !important;
      max-width: 100vw !important;
      height: 100dvh !important;
      max-height: 100dvh !important;
      border-radius: 0 !important;
      top: 0 !important;
      left: 0 !important;
      transform: none !important;
    }
    .ezp-card {
      border-radius: 0 !important;
    }
  }
`;

/* ═══════════════════════════════════════════════════════════════════════
   STYLES — Premium dark-gold inline styles
   ═══════════════════════════════════════════════════════════════════════ */
const S = {
  // ── Overlay ──
  overlay: {
    position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
    background: 'radial-gradient(ellipse at center, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.92) 100%)',
    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
    zIndex: 10000,
  },

  // ── Modal ──
  modal: {
    position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
    width: '100%', maxWidth: '400px',
    maxHeight: '96dvh', height: 'auto',
    borderRadius: '28px',
    overflow: 'hidden', overflowY: 'auto',
    zIndex: 10001,
    display: 'flex', flexDirection: 'column',
    background: OBSIDIAN.base,
    border: `1px solid ${OBSIDIAN.border}`,
    boxShadow: `0 0 60px rgba(224,181,111,0.08), 0 0 120px rgba(26,16,63,0.3)`,
    WebkitOverflowScrolling: 'touch',
  },

  // ── Close Button ──
  closeBtn: {
    position: 'absolute', top: 14, right: 14,
    background: 'rgba(224,181,111,0.08)', border: `1px solid ${GOLD.metallic}22`,
    width: 36, height: 36, borderRadius: '50%',
    cursor: 'pointer', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    transition: 'background 0.2s',
  },

  swipePill: {
    width: 36, height: 3, borderRadius: 2,
    background: `${GOLD.metallic}33`,
    margin: '10px auto 0', flexShrink: 0,
  },

  centerWrap: {
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    minHeight: '360px', padding: '2rem',
  },

  retryBtn: {
    padding: '10px 28px', borderRadius: '10px', border: `1px solid ${GOLD.metallic}66`,
    background: 'transparent', color: GOLD.metallic, cursor: 'pointer',
    fontWeight: 600, letterSpacing: '0.05em', fontSize: '0.85rem',
  },

  // ═══ CARD ═══
  card: {
    position: 'relative', flex: 1,
    padding: '28px 24px 20px',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    overflow: 'hidden', minHeight: '620px',
    background: `linear-gradient(165deg, ${OBSIDIAN.base} 0%, ${OBSIDIAN.violet} 35%, ${OBSIDIAN.base} 65%, #0D0A12 100%)`,
    borderRadius: '28px',
  },

  // Glow orbs
  glowTop: {
    position: 'absolute', top: '-25%', right: '-20%',
    width: '280px', height: '280px', borderRadius: '50%',
    background: `radial-gradient(circle, ${GOLD.glow} 0%, transparent 70%)`,
    filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
  },
  glowBottom: {
    position: 'absolute', bottom: '-20%', left: '-15%',
    width: '240px', height: '240px', borderRadius: '50%',
    background: `radial-gradient(circle, rgba(26,16,63,0.4) 0%, transparent 70%)`,
    filter: 'blur(60px)', pointerEvents: 'none', zIndex: 0,
  },

  // Shimmer border
  shimmerBorder: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    pointerEvents: 'none', zIndex: 1, borderRadius: '28px',
    border: `1.5px solid transparent`,
    maskImage: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
    maskComposite: 'xor', WebkitMaskComposite: 'xor',
  },

  // ── Header ──
  header: { position: 'relative', zIndex: 2, width: '100%', marginBottom: '14px' },
  logoRow: { display: 'flex', alignItems: 'center', gap: '12px' },
  monogram: {
    width: 40, height: 40, borderRadius: '10px',
    border: `1.5px solid ${GOLD.metallic}44`,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontWeight: 900, fontSize: '1.3rem',
    backgroundColor: 'rgba(224,181,111,0.04)',
  },
  brandName: {
    fontWeight: 800, fontSize: '0.95rem', letterSpacing: '0.18em',
    background: `linear-gradient(135deg, ${GOLD.champagne}, ${GOLD.metallic}, ${GOLD.dark})`,
    WebkitBackgroundClip: 'text', backgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  },
  passLabel: {
    fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.28em',
    color: GOLD.champagne,
  },

  separator: {
    width: '100%', height: '1px', marginBottom: '18px',
    background: `linear-gradient(90deg, transparent, ${GOLD.metallic}33, transparent)`,
    position: 'relative', zIndex: 2,
  },

  // ── Tier Badge ──
  tierSection: { position: 'relative', zIndex: 2, textAlign: 'center', marginBottom: '18px' },
  tierBadge: {
    display: 'inline-flex', alignItems: 'center', gap: '10px',
    padding: '10px 24px', borderRadius: '28px',
    border: `1px solid ${GOLD.metallic}44`,
    background: 'rgba(224,181,111,0.04)',
    backdropFilter: 'blur(4px)',
  },
  tierLabel: {
    fontWeight: 800, fontSize: '1.15rem', letterSpacing: '0.12em',
    color: GOLD.metallic,
  },
  tierLevel: {
    fontSize: '0.6rem', color: `${GOLD.muted}99`, marginTop: '5px',
    letterSpacing: '0.18em', fontWeight: 600,
  },

  // ── Identity ──
  identitySection: { position: 'relative', zIndex: 2, textAlign: 'center', marginBottom: '22px' },
  userName: {
    fontWeight: 700, fontSize: '1.15rem', letterSpacing: '0.03em',
    color: '#F0EDE6', marginBottom: '3px',
    textShadow: '0 1px 8px rgba(224,181,111,0.12)',
  },
  passNumber: {
    fontSize: '0.78rem', letterSpacing: '0.14em', fontFamily: '"SF Mono", "Fira Code", "Courier New", monospace',
    color: GOLD.muted, fontWeight: 600,
  },

  // ── QR Code ──
  qrSection: { position: 'relative', zIndex: 2, textAlign: 'center', marginBottom: '22px' },
  qrOuter: { position: 'relative', display: 'inline-block' },
  qrFrame: {
    position: 'relative',
    padding: '3px', borderRadius: '16px',
    background: `linear-gradient(135deg, ${GOLD.metallic}44, ${GOLD.dark}33, ${GOLD.metallic}44)`,
    display: 'inline-block',
    overflow: 'hidden',
  },
  qrInner: {
    borderRadius: '13px', overflow: 'hidden',
    background: '#FFFFFF',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  scanLine: {
    position: 'absolute', left: '6px', right: '6px',
    height: '2px', borderRadius: '1px',
    background: `linear-gradient(90deg, transparent, ${GOLD.metallic}88, transparent)`,
    pointerEvents: 'none',
  },
  qrRefreshIndicator: {
    position: 'absolute', bottom: -4, left: '50%', transform: 'translateX(-50%)',
    fontSize: '0.55rem', color: GOLD.muted, letterSpacing: '0.05em',
  },
  qrHint: {
    fontSize: '0.58rem', color: `${GOLD.muted}88`, marginTop: '8px',
    letterSpacing: '0.16em', fontWeight: 600,
  },

  // ── Stats ──
  statsRow: {
    position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
    gap: '0', width: '100%', padding: '14px 0', marginBottom: '16px',
    borderTop: `1px solid ${GOLD.metallic}15`,
    borderBottom: `1px solid ${GOLD.metallic}15`,
  },
  statItem: { textAlign: 'center', flex: 1 },
  statLabel: {
    fontSize: '0.5rem', color: `${GOLD.muted}88`,
    textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: '3px', fontWeight: 600,
  },
  statValue: {
    fontSize: '1.05rem', fontWeight: 800,
    color: GOLD.metallic,
  },
  statDivider: {
    width: '1px', height: '30px', flexShrink: 0,
    background: `${GOLD.metallic}22`,
  },

  // ── Progress ──
  progressSection: {
    position: 'relative', zIndex: 2, width: '100%', marginBottom: '16px', padding: '0 4px',
  },
  progressLabel: {
    fontSize: '0.68rem', color: `${GOLD.muted}AA`, marginBottom: '6px',
    textAlign: 'center', letterSpacing: '0.04em', fontWeight: 600,
  },
  progressTrack: {
    height: '5px', borderRadius: '3px',
    background: 'rgba(224,181,111,0.08)', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: '3px',
    background: `linear-gradient(90deg, ${GOLD.dark}, ${GOLD.metallic}, ${GOLD.champagne})`,
    transition: 'width 1s ease-out',
  },

  // ── Benefits ──
  benefitsSection: {
    position: 'relative', zIndex: 2, width: '100%', marginBottom: '14px', textAlign: 'center',
  },
  benefitsTitle: {
    fontSize: '0.5rem', color: `${GOLD.muted}77`,
    textTransform: 'uppercase', letterSpacing: '0.16em', marginBottom: '8px', fontWeight: 600,
  },
  benefitsList: { display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' },
  benefitChip: {
    padding: '4px 12px', borderRadius: '14px', fontSize: '0.68rem', fontWeight: 600,
    border: `1px solid ${GOLD.metallic}33`,
    color: GOLD.muted,
    background: 'rgba(224,181,111,0.04)',
    letterSpacing: '0.02em',
  },

  // ── Footer ──
  footer: {
    position: 'relative', zIndex: 2, width: '100%', textAlign: 'center',
    marginTop: 'auto', paddingTop: '10px',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
  },
  footerText: { color: `${GOLD.muted}55`, fontSize: '0.55rem', letterSpacing: '0.06em' },
  footerDot: { color: `${GOLD.muted}33`, fontSize: '0.55rem' },
};

export default EazyPassModal;
