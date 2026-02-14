import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const slides = [
  {
    emoji: '✨',
    title: 'Welcome to Elizian',
    subtitle: 'Discover curated dining, events, wellness & more — all with exclusive rewards.',
    gradient: 'linear-gradient(135deg, #004f4a 0%, #059669 100%)',
  },
  {
    emoji: '📱',
    title: 'Tap & Check In',
    subtitle: 'Tap your phone on an NFC puck at any venue for instant check-in and rewards.',
    gradient: 'linear-gradient(135deg, #5E17EB 0%, #24105F 100%)',
  },
  {
    emoji: '💰',
    title: 'Earn EZT Tokens',
    subtitle: 'Every booking earns you EZT. Higher tiers earn more — up to 5% back on every spend.',
    gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
  },
  {
    emoji: '🏆',
    title: '5 Loyalty Tiers',
    subtitle: 'Rise from Ather to Echelon. Unlock secret menus, priority access & exclusive events.',
    items: [
      { name: 'Ather', pct: '1%', color: '#9ca3af' },
      { name: 'Nova', pct: '2%', color: '#60a5fa' },
      { name: 'Luminar', pct: '3%', color: '#a78bfa' },
      { name: 'Valiant', pct: '4%', color: '#f59e0b' },
      { name: 'Echelon', pct: '5%', color: '#10b981' },
    ],
    gradient: 'linear-gradient(135deg, #1e293b 0%, #0f172a 100%)',
  },
  {
    emoji: '🎁',
    title: 'Redeem & Enjoy',
    subtitle: 'Use EZT tokens for bookings. QR vouchers. Referral rewards. Achievement badges. All in one app.',
    gradient: 'linear-gradient(135deg, #059669 0%, #004f4a 100%)',
  },
];

const OnboardingPage = () => {
  const navigate = useNavigate();
  const [current, setCurrent] = useState(0);
  const slide = slides[current];
  const isLast = current === slides.length - 1;

  const handleNext = () => {
    if (isLast) {
      localStorage.setItem('onboarding_done', 'true');
      navigate('/home');
    } else {
      setCurrent(current + 1);
    }
  };

  const handleSkip = () => {
    localStorage.setItem('onboarding_done', 'true');
    navigate('/home');
  };

  return (
    <div style={{ ...s.page, background: slide.gradient }}>
      <div style={s.container}>
        {/* Skip button */}
        <button onClick={handleSkip} style={s.skipBtn}>Skip</button>

        {/* Content */}
        <div style={s.content} key={current}>
          <div style={s.emojiWrap}>
            <span style={s.emoji}>{slide.emoji}</span>
          </div>
          <h1 style={s.title}>{slide.title}</h1>
          <p style={s.subtitle}>{slide.subtitle}</p>

          {/* Tier items if present */}
          {slide.items && (
            <div style={s.tierList}>
              {slide.items.map((t) => (
                <div key={t.name} style={s.tierRow}>
                  <div style={{ ...s.tierDot, background: t.color }} />
                  <span style={s.tierName}>{t.name}</span>
                  <span style={s.tierPct}>{t.pct} back</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={s.footer}>
          {/* Dots */}
          <div style={s.dots}>
            {slides.map((_, i) => (
              <div
                key={i}
                style={{
                  ...s.dot,
                  background: i === current ? '#fff' : 'rgba(255,255,255,0.3)',
                  width: i === current ? '24px' : '8px',
                }}
              />
            ))}
          </div>

          <button onClick={handleNext} style={s.nextBtn}>
            {isLast ? 'Get Started' : 'Next'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateX(40px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
};

const s = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    transition: 'background 0.5s ease',
  },
  container: {
    maxWidth: '420px',
    width: '100%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    minHeight: '80vh',
  },
  skipBtn: {
    position: 'absolute',
    top: 0,
    right: 0,
    background: 'rgba(255,255,255,0.15)',
    color: '#fff',
    border: 'none',
    borderRadius: '20px',
    padding: '6px 16px',
    fontSize: '0.85rem',
    cursor: 'pointer',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    animation: 'fadeSlide 0.5s ease-out',
  },
  emojiWrap: {
    width: '100px',
    height: '100px',
    borderRadius: '50%',
    background: 'rgba(255,255,255,0.12)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1.5rem',
  },
  emoji: { fontSize: '3rem' },
  title: {
    color: '#fff',
    fontSize: '1.75rem',
    fontWeight: 800,
    margin: '0 0 0.75rem',
    lineHeight: 1.2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: '1rem',
    lineHeight: 1.6,
    maxWidth: '320px',
    margin: '0 auto',
  },
  tierList: {
    marginTop: '1.5rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.6rem',
    width: '100%',
    maxWidth: '280px',
  },
  tierRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.5rem 0.75rem',
    background: 'rgba(255,255,255,0.06)',
    borderRadius: '10px',
  },
  tierDot: {
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  tierName: { flex: 1, textAlign: 'left', color: '#f9fafb', fontWeight: 600, fontSize: '0.9rem' },
  tierPct: { color: 'rgba(255,255,255,0.6)', fontSize: '0.8rem' },
  footer: {
    paddingBottom: '1rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1.25rem',
  },
  dots: {
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
  },
  dot: {
    height: '8px',
    borderRadius: '4px',
    transition: 'all 0.3s ease',
  },
  nextBtn: {
    width: '100%',
    padding: '0.9rem',
    background: 'rgba(255,255,255,0.95)',
    color: '#004f4a',
    border: 'none',
    borderRadius: '14px',
    fontWeight: 700,
    fontSize: '1rem',
    cursor: 'pointer',
    transition: 'transform 0.2s',
  },
};

export default OnboardingPage;
