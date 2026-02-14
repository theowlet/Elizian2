import React, { useState, useEffect, useRef } from 'react';

/**
 * Confetti burst animation - reusable across the app
 * Usage: <ConfettiBurst active={showConfetti} />
 */
export const ConfettiBurst = ({ active, duration = 3500 }) => {
  const canvasRef = useRef(null);

  useEffect(() => {
    if (!active || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#004f4a', '#10b981', '#f59e0b', '#5E17EB', '#3b82f6', '#ec4899', '#ef4444'];
    const pieces = Array.from({ length: 100 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 5 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      tiltAngle: 0,
      tiltInc: Math.random() * 0.07 + 0.04,
      speed: Math.random() * 3 + 1.5,
      wobble: Math.random() * 10,
    }));

    let frame;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach((p) => {
        ctx.beginPath();
        ctx.lineWidth = p.r / 2;
        ctx.strokeStyle = p.color;
        p.tiltAngle += p.tiltInc;
        const tilt = Math.sin(p.tiltAngle) * 15;
        ctx.moveTo(p.x + tilt + p.r / 3, p.y);
        ctx.lineTo(p.x + tilt, p.y + tilt + p.r / 3);
        ctx.stroke();
        p.y += p.speed;
        if (p.y > canvas.height) { p.y = -10; p.x = Math.random() * canvas.width; }
      });
      frame = requestAnimationFrame(draw);
    };
    draw();
    const timeout = setTimeout(() => cancelAnimationFrame(frame), duration);
    return () => { cancelAnimationFrame(frame); clearTimeout(timeout); };
  }, [active, duration]);

  if (!active) return null;
  return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 99999, pointerEvents: 'none' }} />;
};

/**
 * Tier-Up Celebration Modal
 * Shows when user levels up to a new tier
 */
export const TierUpCelebration = ({ show, tierName, onClose }) => {
  const [confetti, setConfetti] = useState(false);

  useEffect(() => {
    if (show) {
      setConfetti(true);
      if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
      const t = setTimeout(() => setConfetti(false), 4000);
      return () => clearTimeout(t);
    }
  }, [show]);

  if (!show) return null;

  const tierConfig = {
    Nova: { color: '#60a5fa', emoji: '⭐', desc: 'You now earn 2% EZT on every booking!' },
    Luminar: { color: '#a78bfa', emoji: '💎', desc: 'You now earn 3% EZT + priority access!' },
    Valiant: { color: '#f59e0b', emoji: '🏅', desc: 'You now earn 4% EZT + VIP perks!' },
    Echelon: { color: '#10b981', emoji: '👑', desc: 'Maximum 5% EZT + all exclusive access!' },
  };
  const cfg = tierConfig[tierName] || { color: '#004f4a', emoji: '🎉', desc: 'Congratulations!' };

  return (
    <>
      <ConfettiBurst active={confetti} />
      <div style={s.overlay} onClick={onClose}>
        <div style={s.modal} onClick={(e) => e.stopPropagation()}>
          <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>{cfg.emoji}</div>
          <h2 style={{ ...s.tierTitle, color: cfg.color }}>Level Up!</h2>
          <p style={s.tierName}>You've reached <strong>{tierName}</strong></p>
          <p style={s.tierDesc}>{cfg.desc}</p>
          <button onClick={onClose} style={s.closeBtn}>Awesome!</button>
        </div>
      </div>
    </>
  );
};

/**
 * Achievement Unlocked Toast
 */
export const AchievementToast = ({ show, achievement, onClose }) => {
  useEffect(() => {
    if (show) {
      if (navigator.vibrate) navigator.vibrate([50, 30, 50]);
      const t = setTimeout(onClose, 5000);
      return () => clearTimeout(t);
    }
  }, [show, onClose]);

  if (!show || !achievement) return null;

  return (
    <div style={s.toast} onClick={onClose}>
      <div style={s.toastIcon}>🏆</div>
      <div style={s.toastContent}>
        <div style={s.toastTitle}>Achievement Unlocked!</div>
        <div style={s.toastName}>{achievement.name || achievement.title}</div>
        {achievement.description && <div style={s.toastDesc}>{achievement.description}</div>}
      </div>
    </div>
  );
};

/**
 * Check-in success animation component (used in NfcTapPage)
 */
export const CheckInSuccess = ({ venueName }) => (
  <div style={s.checkInWrap}>
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
      <circle cx="24" cy="24" r="24" fill="#10b981" />
      <path d="M14 24L21 31L34 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
        <animate attributeName="stroke-dasharray" from="0 80" to="80 80" dur="0.5s" fill="freeze" />
      </path>
    </svg>
    <h3 style={s.checkInTitle}>Checked In!</h3>
    {venueName && <p style={s.checkInVenue}>{venueName}</p>}
  </div>
);

const s = {
  /* Tier-up modal */
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 99998, padding: '1rem' },
  modal: { background: '#fff', borderRadius: '20px', padding: '2rem 1.5rem', textAlign: 'center', maxWidth: '340px', width: '100%', animation: 'bounceIn 0.6s ease-out' },
  tierTitle: { fontSize: '1.75rem', fontWeight: 800, margin: '0 0 0.5rem' },
  tierName: { fontSize: '1rem', color: '#374151', margin: '0 0 0.25rem' },
  tierDesc: { fontSize: '0.85rem', color: '#6b7280', marginBottom: '1.5rem' },
  closeBtn: { width: '100%', padding: '0.8rem', background: '#004f4a', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' },

  /* Achievement toast */
  toast: {
    position: 'fixed', top: '1rem', left: '50%', transform: 'translateX(-50%)',
    background: '#1f2937', color: '#fff', borderRadius: '14px', padding: '0.75rem 1rem',
    display: 'flex', alignItems: 'center', gap: '0.75rem', zIndex: 99999,
    boxShadow: '0 4px 20px rgba(0,0,0,0.25)', maxWidth: '90%', width: '360px',
    animation: 'slideDown 0.4s ease-out', cursor: 'pointer',
  },
  toastIcon: { fontSize: '1.5rem' },
  toastContent: { flex: 1 },
  toastTitle: { fontSize: '0.7rem', color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' },
  toastName: { fontWeight: 700, fontSize: '0.9rem' },
  toastDesc: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '2px' },

  /* Check-in */
  checkInWrap: { textAlign: 'center', animation: 'bounceIn 0.5s ease-out' },
  checkInTitle: { color: '#10b981', fontWeight: 800, fontSize: '1.5rem', margin: '0.5rem 0 0.25rem' },
  checkInVenue: { color: '#6b7280', fontSize: '0.9rem', margin: 0 },
};

// Add keyframes to document (once)
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bounceIn {
      0% { opacity: 0; transform: scale(0.3); }
      50% { transform: scale(1.05); }
      70% { transform: scale(0.95); }
      100% { opacity: 1; transform: scale(1); }
    }
    @keyframes slideDown {
      from { opacity: 0; transform: translateX(-50%) translateY(-20px); }
      to { opacity: 1; transform: translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);
}
