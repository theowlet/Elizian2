import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import EazyPassModal from '../components/EazyPassModal';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const WalletPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState(null);
  const [tier, setTier] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loyaltyTxns, setLoyaltyTxns] = useState([]);
  const [activeTab, setActiveTab] = useState('ezt'); // ezt | loyalty
  const [tierHistory, setTierHistory] = useState([]);
  const [showEazyPass, setShowEazyPass] = useState(false);

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadWalletData();
  }, []);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  const loadWalletData = async () => {
    setLoading(true);
    try {
      const [sumRes, tierRes, eztRes, loyRes, thRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/rewards/summary`, { headers }),
        fetch(`${API_BASE}/api/v1/user/tier`, { headers }),
        fetch(`${API_BASE}/api/v1/rewards/ezt/transactions`, { headers }),
        fetch(`${API_BASE}/api/v1/rewards/loyalty/transactions`, { headers }),
        fetch(`${API_BASE}/api/v1/user/tier/history`, { headers }),
      ]);

      const [sumD, tierD, eztD, loyD, thD] = await Promise.all([
        sumRes.json(), tierRes.json(), eztRes.json(), loyRes.json(), thRes.json()
      ]);

      if (sumD.success) setSummary(sumD.data);
      if (tierD.success) setTier(tierD.data);
      if (eztD.success) setTransactions(Array.isArray(eztD.data) ? eztD.data : []);
      if (loyD.success) setLoyaltyTxns(Array.isArray(loyD.data) ? loyD.data : []);
      if (thD.success) setTierHistory(Array.isArray(thD.data) ? thD.data : []);
    } catch (err) {
      console.error('Wallet load error:', err);
    } finally {
      setLoading(false);
    }
  };

  const eztBalance = summary?.ezt?.available ?? 0;
  const eztTotal = summary?.ezt?.total_earned ?? 0;
  const loyaltyPts = summary?.loyalty?.points ?? 0;
  const currentTier = tier?.current || {};
  const nextTier = tier?.next || null;
  const progressPct = tier?.progress || 0;

  const tierColors = {
    Ather: '#9ca3af', Nova: '#60a5fa', Luminar: '#a78bfa',
    Valiant: '#f59e0b', Echelon: '#10b981',
  };
  const tierColor = tierColors[currentTier.name] || '#004f4a';

  const formatDate = (d) => {
    if (!d) return '';
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
  };

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.loadingWrap}>
          <div style={s.spinner} />
          <p style={{ color: '#9ca3af', marginTop: '1rem' }}>Loading wallet...</p>
        </div>
        <style>{keyframes}</style>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.headerTitle}>Wallet</h1>
          <div style={{ width: '60px' }} />
        </div>

        {/* Balance Card */}
        <div style={{ ...s.balanceCard, background: `linear-gradient(135deg, ${tierColor}22, ${tierColor}08)`, border: `1px solid ${tierColor}44` }}>
          <div style={s.balanceTop}>
            <div>
              <div style={s.balLabel}>EZT Balance</div>
              <div style={s.balValue}>{eztBalance.toFixed(2)}</div>
              <div style={s.balSub}>≈ ₹{(eztBalance * 100).toLocaleString('en-IN')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={s.balLabel}>Total Earned</div>
              <div style={{ ...s.balValue, fontSize: '1.2rem' }}>{eztTotal.toFixed(2)}</div>
            </div>
          </div>

          {/* Tier progress */}
          <div style={s.tierSection}>
            <div style={s.tierRow}>
              <div style={{ ...s.tierBadge, background: tierColor }}>{currentTier.name || 'Ather'}</div>
              <div style={s.tierPct}>{currentTier.rewardPercentage || 1}% earn rate</div>
            </div>
            {nextTier && (
              <>
                <div style={s.progressBar}>
                  <div style={{ ...s.progressFill, width: `${Math.min(progressPct, 100)}%`, background: tierColor }} />
                </div>
                <div style={s.progressLabel}>
                  {progressPct.toFixed(0)}% to {nextTier.name}
                </div>
              </>
            )}
          </div>
        </div>

        {/* EAZY PASS Button */}
        <button
          onClick={() => setShowEazyPass(true)}
          style={{
            width: '100%', padding: '12px', marginBottom: '1rem',
            background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
            border: '1px solid #4a69bd', borderRadius: 12,
            color: '#fff', fontWeight: 700, fontSize: '0.9rem',
            cursor: 'pointer', letterSpacing: '0.05em',
            transition: 'all 0.2s', textAlign: 'center',
          }}
        >
          My EAZY PASS
        </button>

        {/* Quick Stats */}
        <div style={s.statsGrid}>
          <div style={s.statCard}>
            <div style={s.statEmoji}>🏆</div>
            <div style={s.statVal}>{loyaltyPts}</div>
            <div style={s.statLabel}>Loyalty Points</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statEmoji}>📊</div>
            <div style={s.statVal}>{transactions.length}</div>
            <div style={s.statLabel}>Transactions</div>
          </div>
          <div style={s.statCard}>
            <div style={s.statEmoji}>📈</div>
            <div style={s.statVal}>{tierHistory.length}</div>
            <div style={s.statLabel}>Tier Changes</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={s.tabs}>
          {['ezt', 'loyalty'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                ...s.tab,
                ...(activeTab === tab ? { background: '#004f4a', color: '#fff' } : {}),
              }}
            >
              {tab === 'ezt' ? 'EZT Tokens' : 'Loyalty Points'}
            </button>
          ))}
        </div>

        {/* Transaction List */}
        <div style={s.txnList}>
          {activeTab === 'ezt' ? (
            transactions.length === 0 ? (
              <div style={s.emptyState}>
                <span style={{ fontSize: '2rem' }}>💎</span>
                <p>No EZT transactions yet</p>
                <p style={{ fontSize: '0.8rem', color: '#6b7280' }}>Book experiences to earn EZT tokens!</p>
              </div>
            ) : (
              transactions.map((tx, i) => (
                <div key={tx.id || i} style={s.txnRow}>
                  <div style={{ ...s.txnIcon, background: tx.ledger_type === 'earned' ? '#dcfce7' : '#fef3c7' }}>
                    {tx.ledger_type === 'earned' ? '↗' : '↘'}
                  </div>
                  <div style={s.txnInfo}>
                    <div style={s.txnTitle}>{tx.description || tx.ledger_type}</div>
                    <div style={s.txnDate}>{formatDate(tx.created_at)}</div>
                  </div>
                  <div style={{
                    ...s.txnAmount,
                    color: tx.ledger_type === 'earned' ? '#059669' : '#d97706',
                  }}>
                    {tx.ledger_type === 'earned' ? '+' : '-'}{Number(tx.amount).toFixed(2)} EZT
                  </div>
                </div>
              ))
            )
          ) : (
            loyaltyTxns.length === 0 ? (
              <div style={s.emptyState}>
                <span style={{ fontSize: '2rem' }}>⭐</span>
                <p>No loyalty transactions yet</p>
              </div>
            ) : (
              loyaltyTxns.map((tx, i) => (
                <div key={tx.id || i} style={s.txnRow}>
                  <div style={{ ...s.txnIcon, background: tx.transaction_type === 'earned' ? '#dcfce7' : '#fee2e2' }}>
                    {tx.transaction_type === 'earned' ? '↗' : '↘'}
                  </div>
                  <div style={s.txnInfo}>
                    <div style={s.txnTitle}>{tx.description || tx.transaction_type}</div>
                    <div style={s.txnDate}>{formatDate(tx.created_at)}</div>
                  </div>
                  <div style={{
                    ...s.txnAmount,
                    color: tx.transaction_type === 'earned' ? '#059669' : '#ef4444',
                  }}>
                    {tx.transaction_type === 'earned' ? '+' : '-'}{tx.points_earned || tx.points || 0} pts
                  </div>
                </div>
              ))
            )
          )}
        </div>

        {/* Tier History */}
        {tierHistory.length > 0 && (
          <div style={s.section}>
            <h3 style={s.sectionTitle}>Tier History</h3>
            {tierHistory.map((th, i) => (
              <div key={i} style={s.tierHistoryRow}>
                <div style={{ ...s.tierDot, background: tierColors[th.tier_name] || '#9ca3af' }} />
                <div style={s.tierHistoryInfo}>
                  <div style={s.tierHistoryName}>{th.tier_name}</div>
                  <div style={s.tierHistoryDate}>{formatDate(th.promoted_at || th.created_at)}</div>
                </div>
                {th.reason && <div style={s.tierHistoryReason}>{th.reason}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <style>{keyframes}</style>
      <EazyPassModal isOpen={showEazyPass} onClose={() => setShowEazyPass(false)} />
    </div>
  );
};

const keyframes = `
  @keyframes spin { to { transform: rotate(360deg); } }
`;

const s = {
  page: {
    minHeight: '100vh',
    background: '#f9fafb',
    paddingBottom: '5rem',
  },
  container: { maxWidth: '480px', margin: '0 auto', padding: '0 1rem' },
  loadingWrap: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' },
  spinner: { width: '32px', height: '32px', border: '3px solid #e5e7eb', borderTop: '3px solid #004f4a', borderRadius: '50%', animation: 'spin 1s linear infinite' },

  /* Header */
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' },
  backBtn: { background: 'none', border: 'none', color: '#004f4a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' },
  headerTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0 },

  /* Balance card */
  balanceCard: { borderRadius: '16px', padding: '1.25rem', marginBottom: '1rem' },
  balanceTop: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' },
  balLabel: { fontSize: '0.7rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' },
  balValue: { fontSize: '2rem', fontWeight: 800, color: '#1f2937' },
  balSub: { fontSize: '0.8rem', color: '#6b7280' },

  tierSection: { paddingTop: '0.75rem', borderTop: '1px solid rgba(0,0,0,0.06)' },
  tierRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' },
  tierBadge: { padding: '3px 10px', borderRadius: '12px', color: '#fff', fontSize: '0.75rem', fontWeight: 700 },
  tierPct: { fontSize: '0.8rem', color: '#6b7280' },
  progressBar: { height: '6px', background: '#e5e7eb', borderRadius: '3px', overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: '3px', transition: 'width 0.8s ease' },
  progressLabel: { fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' },

  /* Stats */
  statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '1.25rem' },
  statCard: { background: '#fff', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  statEmoji: { fontSize: '1.25rem', marginBottom: '0.25rem' },
  statVal: { fontSize: '1.1rem', fontWeight: 700, color: '#1f2937' },
  statLabel: { fontSize: '0.65rem', color: '#9ca3af', textTransform: 'uppercase' },

  /* Tabs */
  tabs: { display: 'flex', gap: '0.5rem', marginBottom: '1rem' },
  tab: {
    flex: 1, padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '10px',
    background: '#fff', color: '#6b7280', fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer',
    textAlign: 'center', transition: 'all 0.2s',
  },

  /* Transactions */
  txnList: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1.25rem' },
  txnRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6' },
  txnIcon: { width: '36px', height: '36px', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1rem', flexShrink: 0 },
  txnInfo: { flex: 1, minWidth: 0 },
  txnTitle: { fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' },
  txnDate: { fontSize: '0.7rem', color: '#9ca3af' },
  txnAmount: { fontWeight: 700, fontSize: '0.85rem', flexShrink: 0 },

  emptyState: { padding: '2rem', textAlign: 'center', color: '#6b7280' },

  /* Tier history */
  section: { marginBottom: '1.5rem' },
  sectionTitle: { fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem', color: '#1f2937' },
  tierHistoryRow: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6' },
  tierDot: { width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0 },
  tierHistoryInfo: { flex: 1 },
  tierHistoryName: { fontSize: '0.85rem', fontWeight: 600, color: '#1f2937' },
  tierHistoryDate: { fontSize: '0.7rem', color: '#9ca3af' },
  tierHistoryReason: { fontSize: '0.7rem', color: '#6b7280', fontStyle: 'italic' },
};

export default WalletPage;
