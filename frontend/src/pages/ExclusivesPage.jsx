import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const TIER_ORDER = ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon'];
const TIER_COLORS = {
  Ather: '#9ca3af', Nova: '#60a5fa', Luminar: '#a78bfa',
  Valiant: '#f59e0b', Echelon: '#10b981',
};
const TIER_EMOJI = {
  Ather: '🪨', Nova: '⭐', Luminar: '💎', Valiant: '🏅', Echelon: '👑',
};

const ExclusivesPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [offers, setOffers] = useState([]);
  const [userTier, setUserTier] = useState('Ather');
  const [userTierIdx, setUserTierIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all | unlocked | locked

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [offersRes, tierRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/offers?is_active=true&limit=50`, { headers }),
        fetch(`${API_BASE}/api/v1/user/tier`, { headers }),
      ]);

      const [offersData, tierData] = await Promise.all([
        offersRes.json(), tierRes.json(),
      ]);

      const tierName = tierData.data?.current?.name || 'Ather';
      setUserTier(tierName);
      setUserTierIdx(TIER_ORDER.indexOf(tierName));

      if (offersData.success && Array.isArray(offersData.data)) {
        // Mark each offer with access status based on min_tier_name
        const enriched = offersData.data.map((o) => {
          const minTier = o.min_tier_name || null;
          const isExclusive = o.is_exclusive || !!minTier;
          const minIdx = minTier ? TIER_ORDER.indexOf(minTier) : -1;
          const isUnlocked = !minTier || TIER_ORDER.indexOf(tierName) >= minIdx;
          return { ...o, isExclusive, isUnlocked, minTier, minIdx };
        });

        // Sort: exclusive first, then by tier requirement
        enriched.sort((a, b) => {
          if (a.isExclusive && !b.isExclusive) return -1;
          if (!a.isExclusive && b.isExclusive) return 1;
          return (b.minIdx || 0) - (a.minIdx || 0);
        });

        setOffers(enriched);
      }
    } catch (_) {} finally {
      setLoading(false);
    }
  };

  const filtered = offers.filter((o) => {
    if (filter === 'all') return o.isExclusive || o.perk_type === 'secret_menu' || o.perk_type === 'priority_access';
    if (filter === 'unlocked') return o.isUnlocked;
    if (filter === 'locked') return !o.isUnlocked;
    return true;
  });

  const exclusiveCount = offers.filter(o => o.isExclusive).length;
  const unlockedCount = offers.filter(o => o.isUnlocked && o.isExclusive).length;

  if (loading) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={{ textAlign: 'center', paddingTop: '4rem', color: '#6b7280' }}>Loading exclusive experiences...</div>
        </div>
      </div>
    );
  }

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.headerTitle}>Exclusives</h1>
          <div style={{ width: '60px' }} />
        </div>

        {/* Tier badge */}
        <div style={{ ...s.tierCard, borderColor: TIER_COLORS[userTier] + '44' }}>
          <div style={s.tierRow}>
            <span style={{ fontSize: '1.5rem' }}>{TIER_EMOJI[userTier]}</span>
            <div>
              <div style={{ ...s.tierName, color: TIER_COLORS[userTier] }}>{userTier} Tier</div>
              <div style={s.tierSub}>
                {unlockedCount}/{exclusiveCount} exclusive experiences unlocked
              </div>
            </div>
          </div>
          {userTierIdx < 4 && (
            <div style={s.nextUnlock}>
              Next unlock at <strong>{TIER_ORDER[userTierIdx + 1]}</strong> tier
            </div>
          )}
        </div>

        {/* Filter tabs */}
        <div style={s.filters}>
          {[
            { key: 'all', label: 'All Exclusives' },
            { key: 'unlocked', label: 'Unlocked' },
            { key: 'locked', label: 'Locked' },
          ].map((f) => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{ ...s.filterBtn, ...(filter === f.key ? { background: '#004f4a', color: '#fff', borderColor: '#004f4a' } : {}) }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Offers list */}
        {filtered.length === 0 ? (
          <div style={s.emptyState}>
            <span style={{ fontSize: '2rem' }}>🔒</span>
            <p>No exclusive experiences in this category yet</p>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af' }}>Keep earning to unlock more!</p>
          </div>
        ) : (
          <div style={s.grid}>
            {filtered.map((offer) => (
              <div
                key={offer.id}
                style={{ ...s.card, opacity: offer.isUnlocked ? 1 : 0.65 }}
                onClick={() => {
                  if (offer.isUnlocked) {
                    navigate(`/venue/${offer.partner_id}`);
                  }
                }}
              >
                {/* Lock overlay */}
                {!offer.isUnlocked && (
                  <div style={s.lockOverlay}>
                    <span style={{ fontSize: '1.25rem' }}>🔒</span>
                    <span style={s.lockText}>
                      Unlock at {offer.minTier}
                    </span>
                  </div>
                )}

                {/* Image */}
                {offer.image_url && (
                  <div style={s.cardImage}>
                    <img src={offer.image_url} alt="" style={s.cardImg} />
                  </div>
                )}

                <div style={s.cardBody}>
                  {/* Perk badge */}
                  {offer.perk_type && (
                    <span style={{
                      ...s.perkBadge,
                      background: offer.perk_type === 'secret_menu' ? '#fef3c7' : offer.perk_type === 'priority_access' ? '#dbeafe' : '#dcfce7',
                      color: offer.perk_type === 'secret_menu' ? '#92400e' : offer.perk_type === 'priority_access' ? '#1e40af' : '#065f46',
                    }}>
                      {offer.perk_type === 'secret_menu' ? '🤫 Secret Menu' :
                       offer.perk_type === 'priority_access' ? '⚡ Priority Access' :
                       offer.perk_type === 'free_item' ? '🎁 Free Item' : offer.perk_type}
                    </span>
                  )}

                  {/* Min tier tag */}
                  {offer.minTier && (
                    <span style={{ ...s.tierTag, background: TIER_COLORS[offer.minTier] + '22', color: TIER_COLORS[offer.minTier] }}>
                      {TIER_EMOJI[offer.minTier]} {offer.minTier}+ only
                    </span>
                  )}

                  <h3 style={s.cardTitle}>{offer.title}</h3>
                  {offer.partner_name && <p style={s.cardPartner}>{offer.partner_name}</p>}
                  {offer.perk_description && <p style={s.cardDesc}>{offer.perk_description}</p>}

                  {offer.isUnlocked && (
                    <button style={s.cardBtn}>View & Book</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', paddingBottom: '5rem' },
  container: { maxWidth: '480px', margin: '0 auto', padding: '0 1rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' },
  backBtn: { background: 'none', border: 'none', color: '#004f4a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' },
  headerTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0 },

  tierCard: { background: '#fff', borderRadius: '14px', padding: '1rem', marginBottom: '1rem', border: '1px solid', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  tierRow: { display: 'flex', alignItems: 'center', gap: '0.75rem' },
  tierName: { fontWeight: 700, fontSize: '1.1rem' },
  tierSub: { fontSize: '0.8rem', color: '#6b7280' },
  nextUnlock: { fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' },

  filters: { display: 'flex', gap: '0.4rem', marginBottom: '1rem' },
  filterBtn: { flex: 1, padding: '0.5rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', color: '#6b7280', fontWeight: 600, fontSize: '0.75rem', cursor: 'pointer', textAlign: 'center' },

  emptyState: { textAlign: 'center', paddingTop: '3rem', color: '#6b7280' },

  grid: { display: 'flex', flexDirection: 'column', gap: '0.75rem' },
  card: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', position: 'relative', cursor: 'pointer', transition: 'transform 0.2s' },
  lockOverlay: { position: 'absolute', top: '0.5rem', right: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.35rem', background: 'rgba(0,0,0,0.7)', color: '#fff', padding: '4px 10px', borderRadius: '8px', fontSize: '0.7rem', zIndex: 2 },
  lockText: { fontWeight: 600 },
  cardImage: { height: '140px', background: '#f3f4f6' },
  cardImg: { width: '100%', height: '100%', objectFit: 'cover' },
  cardBody: { padding: '0.85rem 1rem' },
  perkBadge: { display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem', marginRight: '0.35rem' },
  tierTag: { display: 'inline-block', padding: '3px 8px', borderRadius: '6px', fontSize: '0.7rem', fontWeight: 600, marginBottom: '0.4rem' },
  cardTitle: { fontSize: '1rem', fontWeight: 700, color: '#1f2937', margin: '0.25rem 0' },
  cardPartner: { fontSize: '0.8rem', color: '#6b7280', margin: '0 0 0.25rem' },
  cardDesc: { fontSize: '0.8rem', color: '#9ca3af', fontStyle: 'italic', margin: '0 0 0.5rem' },
  cardBtn: { padding: '0.5rem 1rem', background: '#004f4a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
};

export default ExclusivesPage;
