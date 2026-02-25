import React, { useState, useEffect, useRef } from 'react';
import { useEcosystemSummary } from '../hooks/useEcosystemSummary';
import CustomerOverviewDrawer from './CustomerOverviewDrawer';

const C = {
  obsidian: '#0B0B0E',
  violet: '#1A103F',
  border: '#2A2A30',
  textPrimary: '#F0ECE3',
  textSecondary: '#9B9484',
  gold: '#E0B56F',
  champagne: '#F5D18C',
};

/**
 * Compact customer chat header: Tier • loyaltyCredits Credits.
 * Tappable to open expandable CustomerOverviewDrawer.
 * Data from GET /customer/ecosystem-summary; skeleton when loading; fallback on error.
 */
export default function CustomerChatHeader({ token, onRefetchReady }) {
  const { data, loading, error, refetch } = useEcosystemSummary({ token, enabled: !!token });
  const [drawerOpen, setDrawerOpen] = useState(false);
  const containerRef = useRef(null);

  // Expose refetch so parent or global listeners can trigger refresh after redemption/token events
  useEffect(() => {
    if (typeof onRefetchReady === 'function') {
      onRefetchReady(refetch);
    }
  }, [onRefetchReady, refetch]);

  // Reactive refresh on realtime events
  useEffect(() => {
    if (!token) return;
    const events = ['customer:ecosystem_updated', 'loyalty:updated', 'tokens:updated', 'OFFER_REDEEMED', 'CREDITS_EARNED', 'CREDITS_USED', 'TOKEN_UPDATED', 'elizian-ecosystem-refetch'];
    const handle = () => refetch();
    events.forEach((ev) => {
      window.addEventListener(ev, handle);
    });
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handle));
    };
  }, [token, refetch]);

  const tier = data?.tier ?? '';
  const credits = data?.loyaltyCredits ?? 0;

  return (
    <div ref={containerRef} style={{ position: 'relative', flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => setDrawerOpen((o) => !o)}
        aria-expanded={drawerOpen}
        aria-label="Account summary"
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '0.5rem',
          padding: '0.5rem 0.75rem',
          background: `linear-gradient(135deg, ${C.obsidian}, ${C.violet})`,
          border: `1px solid ${C.border}`,
          borderBottom: 'none',
          color: C.textPrimary,
          fontSize: '0.85rem',
          cursor: 'pointer',
          textAlign: 'center',
        }}
      >
        {loading && (
          <span
            style={{
              display: 'inline-block',
              width: '100%',
              maxWidth: 200,
              height: 20,
              borderRadius: 4,
              background: `linear-gradient(90deg, ${C.border} 25%, ${C.violet} 50%, ${C.border} 75%)`,
              backgroundSize: '200% 100%',
              animation: 'shimmer 1s ease-in-out infinite',
            }}
          />
        )}
        {!loading && error && (
          <span style={{ color: C.textSecondary, fontSize: '0.8rem' }}>Unable to load account summary</span>
        )}
        {!loading && !error && (
          <>
            <span style={{ fontWeight: 700, color: C.champagne }}>{tier}</span>
            <span style={{ color: C.textSecondary }}>•</span>
            <span style={{ fontWeight: 600, color: C.gold }}>{credits} Credits</span>
          </>
        )}
      </button>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>

      <CustomerOverviewDrawer
        open={drawerOpen}
        summary={data}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
