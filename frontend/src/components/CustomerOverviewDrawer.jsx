import React from 'react';
import { useNavigate } from 'react-router-dom';

const C = {
  obsidian: '#0B0B0E',
  cardBg: '#1A1A1F',
  border: '#2A2A30',
  textPrimary: '#F0ECE3',
  textSecondary: '#9B9484',
  gold: '#E0B56F',
  champagne: '#F5D18C',
};

/**
 * Expandable drawer showing customer overview from ecosystem summary API.
 * All values from props (no hardcoded numbers).
 */
export default function CustomerOverviewDrawer({ open, summary, onClose }) {
  const navigate = useNavigate();

  if (!open) return null;

  const tier = summary?.tier ?? '—';
  const lifetimeSpendFiat = summary?.lifetimeSpendFiat ?? 0;
  const totalVisits = summary?.totalVisits ?? 0;
  const totalEztEarned = summary?.totalEztEarned ?? 0;
  const currentEztBalance = summary?.currentEztBalance ?? 0;

  const formatRupee = (n) => (typeof n === 'number' ? `₹${Number(n).toLocaleString('en-IN')}` : '—');

  return (
    <div
      role="dialog"
      aria-label="Customer overview"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '100%',
        zIndex: 10,
        background: C.cardBg,
        borderBottom: `1px solid ${C.border}`,
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
        animation: 'slideDown 0.2s ease-out',
        overflow: 'hidden',
      }}
    >
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ padding: '1rem 1rem 1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
          <h3 style={{ margin: 0, fontSize: '0.9rem', fontWeight: 700, color: C.champagne }}>Customer Overview</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: 'none',
              border: 'none',
              color: C.textSecondary,
              fontSize: '1.25rem',
              cursor: 'pointer',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <Row label="Tier" value={tier} />
          <Row label="Lifetime Spend" value={formatRupee(lifetimeSpendFiat)} />
          <Row label="Total Visits" value={String(totalVisits)} />
          <Row label="Total EZT Earned" value={`${totalEztEarned} EZT`} />
          <Row label="Token Balance" value={`${currentEztBalance} EZT`} />
        </div>

        <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: `1px solid ${C.border}` }}>
          <button
            type="button"
            onClick={() => { onClose(); navigate('/wallet'); }}
            style={{
              width: '100%',
              padding: '0.5rem 0.75rem',
              background: 'transparent',
              border: `1px solid ${C.gold}`,
              borderRadius: '8px',
              color: C.gold,
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Redemption History →
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
      <span style={{ fontSize: '0.8rem', color: C.textSecondary }}>{label}</span>
      <span style={{ fontSize: '0.9rem', fontWeight: 700, color: C.textPrimary }}>{value}</span>
    </div>
  );
}
