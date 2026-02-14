import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/partnerConsole.css'; // Reuse partner console CSS framework

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/* ─── Layout Components ────────────────────────────────── */
function AdminHeader({ onLogout }) {
  return (
    <header className="pc-header" style={{ background: '#111827' }}>
      <div className="pc-header-content">
        <div className="pc-logo">
          <div className="pc-logo-icon" style={{ background: '#dc2626' }}>A</div>
          <span>Elizian Admin Console</span>
        </div>
        <div className="pc-header-actions">
          <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}

function AdminSidebar({ active, onNavigate }) {
  const nav = [
    ['dashboard', 'Dashboard'],
    ['partners', 'Partners'],
    ['deals', 'Deals & Offers'],
    ['bookings', 'Bookings'],
    ['users', 'Users'],
    ['rewards', 'Rewards'],
    ['redemptions', 'Redemptions'],
    ['tiers', 'Tier Config'],
    ['settings', 'Settings'],
  ];
  return (
    <nav className="pc-sidebar">
      {nav.map(([id, label]) => (
        <div key={id} className={`pc-nav-item ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)}>
          <span>{label}</span>
        </div>
      ))}
    </nav>
  );
}

/* ─── Main Admin Console ───────────────────────────────── */
export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('dashboard');
  const token = localStorage.getItem('adminToken') || localStorage.getItem('token');

  // Data stores
  const [dashboardData, setDashboardData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [partnersError, setPartnersError] = useState(null);
  const [deals, setDeals] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState(null);
  const [rewards, setRewards] = useState(null);
  const [redemptions, setRedemptions] = useState([]);
  const [settings, setSettings] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [tierEdits, setTierEdits] = useState({}); // { tierName: { ...editedFields } }
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Filters
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dealFilter, setDealFilter] = useState('');
  const [bookingFilter, setBookingFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  }), [token]);

  useEffect(() => {
    if (!token) {
      navigate('/admin/login');
      return;
    }
    loadDashboard();
  }, [token, navigate]);

  function showNotif(msg, type = 'success') {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3500);
  }

  // ─── API Loaders ────────────────────────────────────────

  async function loadDashboard() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/dashboard`, { headers: headers() });
      const j = await r.json();
      if (j.success) setDashboardData(j.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadPartners(status = '') {
    setLoading(true);
    setPartnersError(null);
    try {
      const url = status ? `${API_BASE}/api/v1/admin/partners?status=${status}` : `${API_BASE}/api/v1/admin/partners`;
      const r = await fetch(url, { headers: headers() });
      const j = await r.json();
      if (j.success) {
        setPartners(j.data || []);
      } else {
        setPartners([]);
        setPartnersError(j.message || j.error || `Request failed (${r.status})`);
      }
    } catch (e) {
      console.error(e);
      setPartners([]);
      setPartnersError(e.message || 'Network error');
    }
    setLoading(false);
  }

  async function updatePartnerStatus(id, status) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/partners/${id}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ status })
      });
      const j = await r.json();
      if (j.success) { loadPartners(partnerFilter); showNotif('Partner status updated'); }
      else showNotif(j.message || 'Failed', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  async function loadDeals(search = '', status = '') {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      const r = await fetch(`${API_BASE}/api/v1/admin/deals?${params}`, { headers: headers() });
      const j = await r.json();
      if (j.success) setDeals(j.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function updateDealStatus(id, status) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/deals/${id}/status`, {
        method: 'PATCH', headers: headers(), body: JSON.stringify({ status })
      });
      const j = await r.json();
      if (j.success) { loadDeals('', dealFilter); showNotif('Deal status updated'); }
      else showNotif(j.message || 'Failed', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  async function loadBookings(status = '') {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      params.set('limit', '50');
      const r = await fetch(`${API_BASE}/api/v1/admin/bookings?${params}`, { headers: headers() });
      const j = await r.json();
      if (j.success) setBookings(j.data?.bookings || (Array.isArray(j.data) ? j.data : []));
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadUsers(search = '') {
    setLoading(true);
    setUsersError(null);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      params.set('limit', '50');
      const r = await fetch(`${API_BASE}/api/v1/admin/users?${params}`, { headers: headers() });
      const j = await r.json();
      if (j.success) {
        setUsers(j.data?.items ?? j.data?.users ?? (Array.isArray(j.data) ? j.data : []));
      } else {
        setUsers([]);
        setUsersError(j.message || j.error || `Request failed (${r.status})`);
      }
    } catch (e) {
      console.error(e);
      setUsers([]);
      setUsersError(e.message || 'Network error');
    }
    setLoading(false);
  }

  async function loadRewards() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/rewards/overview`, { headers: headers() });
      const j = await r.json();
      if (j.success) setRewards(j.data);
    } catch (e) { console.error(e); }
  }

  async function loadRedemptions() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/redemptions`, { headers: headers() });
      const j = await r.json();
      if (j.success) setRedemptions(j.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function loadTiers() {
    setLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/tiers`, { headers: headers() });
      const j = await r.json();
      if (j.success) {
        const tiersData = j.data || [];
        setTiers(tiersData);
        // Initialize edits from current DB values
        const edits = {};
        tiersData.forEach(t => {
          edits[t.tier_name] = {
            ezt_reward_percentage: t.ezt_reward_percentage,
            min_annual_spend: t.min_annual_spend,
            max_annual_spend: t.max_annual_spend,
            badge_color: t.badge_color || '',
            badge_icon: t.badge_icon || '',
            benefits: typeof t.benefits === 'object' && t.benefits ? { ...t.benefits } : {},
            is_active: t.is_active !== false,
            card_theme_config: typeof t.card_theme_config === 'object' && t.card_theme_config ? { ...t.card_theme_config } : {},
          };
        });
        setTierEdits(edits);
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function saveTier(tierName) {
    const edit = tierEdits[tierName];
    if (!edit) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/tiers/${encodeURIComponent(tierName)}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify(edit)
      });
      const j = await r.json();
      if (j.success) { showNotif(`Tier "${tierName}" updated`); loadTiers(); }
      else showNotif(j.message || 'Failed to update tier', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  function updateTierEdit(tierName, field, value) {
    setTierEdits(prev => ({
      ...prev,
      [tierName]: { ...prev[tierName], [field]: value }
    }));
  }

  function updateTierBenefit(tierName, key, value) {
    setTierEdits(prev => ({
      ...prev,
      [tierName]: {
        ...prev[tierName],
        benefits: { ...(prev[tierName]?.benefits || {}), [key]: value }
      }
    }));
  }

  function removeTierBenefit(tierName, key) {
    setTierEdits(prev => {
      const b = { ...(prev[tierName]?.benefits || {}) };
      delete b[key];
      return { ...prev, [tierName]: { ...prev[tierName], benefits: b } };
    });
  }

  async function loadSettings() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/settings`, { headers: headers() });
      const j = await r.json();
      if (j.success) setSettings(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function updateSetting(key, value) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/settings/${key}`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ value })
      });
      const j = await r.json();
      if (j.success) { loadSettings(); showNotif(`Setting "${key}" updated`); }
      else showNotif(j.message || 'Failed', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  function handleNavigate(section) {
    setActiveSection(section);
    if (section === 'dashboard') loadDashboard();
    if (section === 'partners') loadPartners();
    if (section === 'deals') loadDeals();
    if (section === 'bookings') loadBookings();
    if (section === 'users') loadUsers();
    if (section === 'rewards') loadRewards();
    if (section === 'redemptions') loadRedemptions();
    if (section === 'tiers') loadTiers();
    if (section === 'settings') loadSettings();
  }

  function logout() {
    if (window.confirm('Logout?')) {
      localStorage.removeItem('adminToken');
      navigate('/admin/login');
    }
  }

  function getStatusClass(status) {
    const m = { pending: 'warning', active: 'success', approved: 'success', confirmed: 'secondary', redeemed: 'success', completed: 'success', cancelled: 'error', rejected: 'error', suspended: 'error', inactive: 'error' };
    return m[status] || 'secondary';
  }

  // ─── Section Renderers ──────────────────────────────────

  function DashboardSection() {
    const d = dashboardData;
    return (
      <div>
        <div className="pc-content-header"><h1>Admin Dashboard</h1><button className="btn btn-primary" onClick={loadDashboard}>Refresh</button></div>
        <div className="pc-stats-grid">
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.totalPartners ?? d?.total_partners ?? 0}</div><div className="pc-stat-label">Total Partners</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.totalUsers ?? d?.total_users ?? 0}</div><div className="pc-stat-label">Total Users</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.totalBookings ?? d?.total_bookings ?? 0}</div><div className="pc-stat-label">Total Bookings</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">₹{d?.totalRevenue ?? d?.total_revenue ?? 0}</div><div className="pc-stat-label">Total Revenue</div></div>
        </div>
        <div className="pc-stats-grid" style={{ marginTop: 16 }}>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.activeDeals ?? d?.active_deals ?? 0}</div><div className="pc-stat-label">Active Deals</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.todayBookings ?? d?.today_bookings ?? 0}</div><div className="pc-stat-label">Today's Bookings</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.pendingPartners ?? d?.pending_partners ?? 0}</div><div className="pc-stat-label">Pending Partners</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{d?.totalRedemptions ?? d?.total_redemptions ?? 0}</div><div className="pc-stat-label">Redemptions</div></div>
        </div>
      </div>
    );
  }

  function PartnersSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Partner Management</h1>
          <div>
            <select className="pc-form-input" style={{ width: 'auto', marginRight: 8 }} value={partnerFilter} onChange={e => { setPartnerFilter(e.target.value); loadPartners(e.target.value); }}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
            <button className="btn btn-primary" onClick={() => loadPartners(partnerFilter)}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Name</th><th>Email</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {partnersError ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: 'var(--danger, #dc3545)' }}>
                  Could not load partners: {partnersError}
                </td></tr>
              ) : partners.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>
                  No partners{partnerFilter ? ` with status "${partnerFilter}"` : ''}. {partnerFilter ? 'Try "All" to see every partner.' : 'Add partners via partner signup or admin flow.'}
                </td></tr>
              ) : partners.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{p.partner_category_type || '—'}</td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(p.status)}`}>{p.status}</span></td>
                  <td>
                    <div className="pc-actions">
                      {p.status === 'pending' && <button className="btn btn-sm btn-primary" onClick={() => updatePartnerStatus(p.id, 'active')}>Approve</button>}
                      {(p.status === 'active' || p.status === 'approved') && <button className="btn btn-sm btn-danger" onClick={() => updatePartnerStatus(p.id, 'suspended')}>Suspend</button>}
                      {p.status === 'suspended' && <button className="btn btn-sm btn-primary" onClick={() => updatePartnerStatus(p.id, 'active')}>Reactivate</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function DealsSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Deals & Offers</h1>
          <div>
            <select className="pc-form-input" style={{ width: 'auto', marginRight: 8 }} value={dealFilter} onChange={e => { setDealFilter(e.target.value); loadDeals('', e.target.value); }}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="inactive">Inactive</option>
            </select>
            <button className="btn btn-primary" onClick={() => loadDeals('', dealFilter)}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Title</th><th>Partner</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>
              {deals.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No deals</td></tr> : deals.map(d => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.partner_name || '—'}</td>
                  <td>{d.service_type || d.offer_type || '—'}</td>
                  <td>{d.start_date ? new Date(d.start_date).toLocaleDateString() : '—'}</td>
                  <td>{d.end_date ? new Date(d.end_date).toLocaleDateString() : '—'}</td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(d.status || (new Date(d.end_date) > new Date() ? 'active' : 'inactive'))}`}>{d.status || (new Date(d.end_date) > new Date() ? 'Active' : 'Inactive')}</span></td>
                  <td>
                    <div className="pc-actions">
                      {d.status === 'pending' && <>
                        <button className="btn btn-sm btn-primary" onClick={() => updateDealStatus(d.id, 'active')}>Approve</button>
                        <button className="btn btn-sm btn-danger" onClick={() => updateDealStatus(d.id, 'rejected')}>Reject</button>
                      </>}
                      {d.status === 'active' && <button className="btn btn-sm btn-danger" onClick={() => updateDealStatus(d.id, 'inactive')}>Deactivate</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function BookingsSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Bookings</h1>
          <div>
            <select className="pc-form-input" style={{ width: 'auto', marginRight: 8 }} value={bookingFilter} onChange={e => { setBookingFilter(e.target.value); loadBookings(e.target.value); }}>
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="redeemed">Redeemed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="btn btn-primary" onClick={() => loadBookings(bookingFilter)}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Reference</th><th>User</th><th>Tier</th><th>Deal</th><th>Date</th><th>Amount</th><th>Status</th></tr></thead>
            <tbody>
              {bookings.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No bookings</td></tr> : bookings.map(b => (
                <tr key={b.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{b.booking_reference || b.id?.slice(0, 8)}</td>
                  <td>{b.customer_name || b.user_name || '—'}</td>
                  <td>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 12,
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      background: (b.customer_tier || b.user_tier_at_booking) === 'Echelon' ? 'linear-gradient(135deg, #E0B56F, #F5D18C)' :
                                  (b.customer_tier || b.user_tier_at_booking) === 'Valiant' ? 'linear-gradient(135deg, #f59e0b, #fbbf24)' :
                                  (b.customer_tier || b.user_tier_at_booking) === 'Luminar' ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' :
                                  (b.customer_tier || b.user_tier_at_booking) === 'Nova' ? 'linear-gradient(135deg, #3b82f6, #60a5fa)' :
                                  'linear-gradient(135deg, #6b7280, #9ca3af)',
                      color: (b.customer_tier || b.user_tier_at_booking) === 'Echelon' ? '#1a1a1f' : '#fff'
                    }}>
                      {b.customer_tier || b.user_tier_at_booking || 'Ather'}
                    </span>
                  </td>
                  <td>{b.deal_title || b.event_title || '—'}</td>
                  <td>{b.booking_date ? new Date(b.booking_date).toLocaleDateString() : '—'}</td>
                  <td>₹{parseFloat(b.total_price || b.fiat_amount || 0).toFixed(2)}</td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(b.status)}`}>{b.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function UsersSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Users</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="pc-form-input" style={{ width: 200 }} placeholder="Search by name/email..." value={userSearch} onChange={e => setUserSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && loadUsers(userSearch)} />
            <button className="btn btn-primary" onClick={() => loadUsers(userSearch)}>Search</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Tier</th><th>EZT Balance</th><th>Joined</th></tr></thead>
            <tbody>
              {usersError ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--danger, #dc3545)' }}>Could not load users: {usersError}</td></tr>
              ) : users.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>No users found</td></tr>
              ) : users.map(u => (
                <tr key={u.id}>
                  <td>{[u.first_name, u.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td>{u.email || '—'}</td>
                  <td>{u.phone_number || '—'}</td>
                  <td>{u.tier_name || '—'}</td>
                  <td>{Number(u.available_tokens || u.ezt_balance || 0).toLocaleString()}</td>
                  <td>{u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function RewardsSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Rewards Overview</h1><button className="btn btn-primary" onClick={loadRewards}>Refresh</button></div>
        {rewards ? (
          <div className="pc-stats-grid">
            <div className="pc-stat-card"><div className="pc-stat-value">{rewards.total_ezt_issued ?? rewards.totalEztIssued ?? 0}</div><div className="pc-stat-label">Total EZT Issued</div></div>
            <div className="pc-stat-card"><div className="pc-stat-value">{rewards.total_ezt_redeemed ?? rewards.totalEztRedeemed ?? 0}</div><div className="pc-stat-label">Total EZT Redeemed</div></div>
            <div className="pc-stat-card"><div className="pc-stat-value">{rewards.total_ezt_circulating ?? rewards.totalCirculating ?? 0}</div><div className="pc-stat-label">EZT Circulating</div></div>
            <div className="pc-stat-card"><div className="pc-stat-value">{rewards.active_users ?? rewards.activeUsers ?? 0}</div><div className="pc-stat-label">Active Token Holders</div></div>
          </div>
        ) : (
          <p style={{ color: '#666' }}>Loading rewards data...</p>
        )}
      </div>
    );
  }

  function RedemptionsSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Redemptions</h1><button className="btn btn-primary" onClick={loadRedemptions}>Refresh</button></div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Voucher</th><th>Partner</th><th>Total Bill</th><th>EZT Co-Pay</th><th>Net Amount</th><th>Status</th><th>Redeemed</th></tr></thead>
            <tbody>
              {redemptions.length === 0 ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No redemptions</td></tr> : redemptions.map(r => (
                <tr key={r.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.voucher_code?.slice(0, 8) || '—'}</td>
                  <td>{r.partner_name || '—'}</td>
                  <td>₹{parseFloat(r.total_bill_amount || 0).toFixed(2)}</td>
                  <td>₹{parseFloat(r.ezt_co_pay_amount || 0).toFixed(2)}</td>
                  <td>₹{parseFloat(r.net_amount_from_user || 0).toFixed(2)}</td>
                  <td><span className={`pc-badge pc-badge-${r.settlement_status === 'settled' ? 'success' : r.settlement_status === 'disputed' ? 'error' : 'warning'}`}>{r.settlement_status || 'pending'}</span></td>
                  <td>{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const PREDEFINED_BENEFITS = [
    { key: 'secret_menu', label: 'Secret Menu' },
    { key: 'priority_access', label: 'Priority Access' },
    { key: 'vip_lounge', label: 'VIP Lounge' },
    { key: 'concierge', label: 'Concierge Service' },
    { key: 'early_access', label: 'Early Access' },
    { key: 'exclusive_events', label: 'Exclusive Events' },
    { key: 'free_delivery', label: 'Free Delivery' },
    { key: 'birthday_bonus', label: 'Birthday Bonus' },
  ];

  function TiersSection() {
    const [newBenefitKey, setNewBenefitKey] = useState('');
    const [newBenefitTier, setNewBenefitTier] = useState('');

    return (
      <div>
        <div className="pc-content-header">
          <h1>Tier Configuration</h1>
          <button className="btn btn-primary" onClick={loadTiers}>Refresh</button>
        </div>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 16 }}>
          Configure reward percentages, spend thresholds, and benefits for each loyalty tier.
        </p>

        {tiers.length === 0 ? (
          <p style={{ color: '#666', padding: 24, textAlign: 'center' }}>No tiers found. Check database.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {tiers.map(tier => {
              const edit = tierEdits[tier.tier_name] || {};
              const benefits = edit.benefits || {};
              return (
                <div key={tier.tier_name} style={{
                  background: 'var(--card, #0f1720)', borderRadius: 12, padding: '1.25rem',
                  border: '1px solid var(--border, rgba(255,255,255,0.04))'
                }}>
                  {/* Tier Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '50%',
                      background: edit.badge_color || tier.badge_color || '#6b7280',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.2rem', color: '#fff', fontWeight: 700
                    }}>
                      {edit.badge_icon || tier.badge_icon || tier.tier_name?.charAt(0)}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{tier.tier_name}</h3>
                      <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>Level {tier.tier_level}</span>
                    </div>
                  </div>

                  {/* Core Settings Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={ts.label}>EZT Reward %</label>
                      <input className="pc-form-input" type="number" step="0.1" min="0" max="100"
                        value={edit.ezt_reward_percentage ?? ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'ezt_reward_percentage', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={ts.label}>Min Annual Spend (₹)</label>
                      <input className="pc-form-input" type="number" min="0"
                        value={edit.min_annual_spend ?? ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'min_annual_spend', e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={ts.label}>Max Annual Spend (₹)</label>
                      <input className="pc-form-input" type="number" min="0"
                        value={edit.max_annual_spend ?? ''}
                        placeholder="No limit"
                        onChange={e => updateTierEdit(tier.tier_name, 'max_annual_spend', e.target.value === '' ? null : e.target.value)}
                        style={{ width: '100%' }}
                      />
                    </div>
                    <div>
                      <label style={ts.label}>Badge Color</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={edit.badge_color || '#6b7280'}
                          onChange={e => updateTierEdit(tier.tier_name, 'badge_color', e.target.value)}
                          style={{ width: 36, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
                        />
                        <input className="pc-form-input" value={edit.badge_color || ''}
                          onChange={e => updateTierEdit(tier.tier_name, 'badge_color', e.target.value)}
                          placeholder="#hex"
                          style={{ flex: 1 }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={ts.label}>Badge Icon</label>
                      <input className="pc-form-input" value={edit.badge_icon || ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'badge_icon', e.target.value)}
                        placeholder="emoji or text"
                        style={{ width: '100%' }}
                      />
                    </div>
                  </div>

                  {/* Active Toggle + Card Theme */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                    <div>
                      <label style={ts.label}>Active</label>
                      <button
                        onClick={() => updateTierEdit(tier.tier_name, 'is_active', !edit.is_active)}
                        style={{
                          padding: '6px 16px', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer',
                          border: edit.is_active ? '1px solid #10b981' : '1px solid #ef4444',
                          background: edit.is_active ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.1)',
                          color: edit.is_active ? '#10b981' : '#ef4444',
                          fontWeight: 600, transition: 'all 0.15s'
                        }}
                      >
                        {edit.is_active ? 'Active' : 'Inactive'}
                      </button>
                    </div>
                    <div>
                      <label style={ts.label}>Card Gradient</label>
                      <input className="pc-form-input" value={edit.card_theme_config?.gradient || ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'card_theme_config', { ...edit.card_theme_config, gradient: e.target.value })}
                        placeholder="linear-gradient(160deg, ...)"
                        style={{ width: '100%', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={ts.label}>Card Accent Color</label>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <input type="color" value={edit.card_theme_config?.accent_color || '#9ca3af'}
                          onChange={e => updateTierEdit(tier.tier_name, 'card_theme_config', { ...edit.card_theme_config, accent_color: e.target.value })}
                          style={{ width: 36, height: 32, border: 'none', cursor: 'pointer', background: 'transparent' }}
                        />
                        <input className="pc-form-input" value={edit.card_theme_config?.accent_color || ''}
                          onChange={e => updateTierEdit(tier.tier_name, 'card_theme_config', { ...edit.card_theme_config, accent_color: e.target.value })}
                          placeholder="#hex"
                          style={{ flex: 1, fontSize: '0.8rem' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label style={ts.label}>Card Glow Color</label>
                      <input className="pc-form-input" value={edit.card_theme_config?.glow_color || ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'card_theme_config', { ...edit.card_theme_config, glow_color: e.target.value })}
                        placeholder="rgba(156,163,175,0.3)"
                        style={{ width: '100%', fontSize: '0.8rem' }}
                      />
                    </div>
                    <div>
                      <label style={ts.label}>Card Badge Emoji</label>
                      <input className="pc-form-input" value={edit.card_theme_config?.badge_emoji || ''}
                        onChange={e => updateTierEdit(tier.tier_name, 'card_theme_config', { ...edit.card_theme_config, badge_emoji: e.target.value })}
                        placeholder="emoji"
                        style={{ width: '100%', fontSize: '0.8rem' }}
                      />
                    </div>
                  </div>

                  {/* Benefits Section */}
                  <div style={{ borderTop: '1px solid var(--border, rgba(255,255,255,0.06))', paddingTop: 12 }}>
                    <label style={{ ...ts.label, marginBottom: 8 }}>Benefits</label>

                    {/* Predefined toggles */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
                      {PREDEFINED_BENEFITS.map(pb => {
                        const isOn = benefits[pb.key] === true;
                        return (
                          <button key={pb.key} onClick={() => updateTierBenefit(tier.tier_name, pb.key, !isOn)}
                            style={{
                              padding: '5px 12px', borderRadius: 20, fontSize: '0.8rem', cursor: 'pointer',
                              border: isOn ? '1px solid #10b981' : '1px solid var(--border, rgba(255,255,255,0.1))',
                              background: isOn ? 'rgba(16,185,129,0.15)' : 'transparent',
                              color: isOn ? '#10b981' : '#9ca3af',
                              fontWeight: isOn ? 600 : 400,
                              transition: 'all 0.15s'
                            }}
                          >
                            {isOn ? '✓ ' : ''}{pb.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Custom benefits */}
                    {Object.entries(benefits).filter(([k]) => !PREDEFINED_BENEFITS.some(pb => pb.key === k)).map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ color: '#d1d5db', fontSize: '0.8rem', minWidth: 120 }}>{k}</span>
                        <input className="pc-form-input" value={typeof v === 'string' ? v : JSON.stringify(v)}
                          onChange={e => updateTierBenefit(tier.tier_name, k, e.target.value)}
                          style={{ flex: 1, fontSize: '0.8rem' }}
                        />
                        <button className="btn btn-sm btn-danger" onClick={() => removeTierBenefit(tier.tier_name, k)}
                          style={{ padding: '2px 8px', fontSize: '0.75rem' }}>✕</button>
                      </div>
                    ))}

                    {/* Add custom benefit */}
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <input className="pc-form-input" placeholder="New benefit key..."
                        value={newBenefitTier === tier.tier_name ? newBenefitKey : ''}
                        onChange={e => { setNewBenefitTier(tier.tier_name); setNewBenefitKey(e.target.value); }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && newBenefitKey.trim() && newBenefitTier === tier.tier_name) {
                            updateTierBenefit(tier.tier_name, newBenefitKey.trim(), '');
                            setNewBenefitKey('');
                          }
                        }}
                        style={{ flex: 1, fontSize: '0.8rem' }}
                      />
                      <button className="btn btn-sm btn-secondary"
                        onClick={() => {
                          if (newBenefitKey.trim() && newBenefitTier === tier.tier_name) {
                            updateTierBenefit(tier.tier_name, newBenefitKey.trim(), '');
                            setNewBenefitKey('');
                          }
                        }}
                      >+ Add</button>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div style={{ marginTop: 16, textAlign: 'right' }}>
                    <button className="btn btn-primary" onClick={() => saveTier(tier.tier_name)}>
                      Save {tier.tier_name}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  const ts = {
    label: { display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4, fontWeight: 500 },
  };

  function SettingsSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>System Settings</h1><button className="btn btn-primary" onClick={loadSettings}>Refresh</button></div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Key</th><th>Value</th><th>Actions</th></tr></thead>
            <tbody>
              {(!settings || settings.length === 0) ? (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 24 }}>No settings configured</td></tr>
              ) : (Array.isArray(settings) ? settings : Object.entries(settings).map(([k, v]) => ({ key: k, value: v }))).map(s => (
                <tr key={s.key || s.id}>
                  <td style={{ fontWeight: 600 }}>{s.key || s.setting_key}</td>
                  <td>
                    <input
                      className="pc-form-input"
                      defaultValue={typeof s.value === 'object' ? JSON.stringify(s.value) : String(s.value ?? '')}
                      onBlur={e => {
                        const newVal = e.target.value;
                        if (newVal !== String(s.value ?? '')) {
                          updateSetting(s.key || s.setting_key, newVal);
                        }
                      }}
                      style={{ width: '100%' }}
                    />
                  </td>
                  <td>
                    <button className="btn btn-sm btn-secondary" onClick={() => {
                      const row = document.querySelector(`tr[data-key="${s.key || s.setting_key}"] input`);
                      if (row) updateSetting(s.key || s.setting_key, row.value);
                    }}>Save</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (!token) return null;

  return (
    <div className="pc-root">
      <AdminHeader onLogout={logout} />
      <div className="pc-container">
        <div className="pc-dashboard-grid">
          <AdminSidebar active={activeSection} onNavigate={handleNavigate} />
          <main className="pc-main-content">
            {loading && <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>Loading...</div>}
            {activeSection === 'dashboard' && <DashboardSection />}
            {activeSection === 'partners' && <PartnersSection />}
            {activeSection === 'deals' && <DealsSection />}
            {activeSection === 'bookings' && <BookingsSection />}
            {activeSection === 'users' && <UsersSection />}
            {activeSection === 'rewards' && <RewardsSection />}
            {activeSection === 'redemptions' && <RedemptionsSection />}
            {activeSection === 'tiers' && <TiersSection />}
            {activeSection === 'settings' && <SettingsSection />}
          </main>
        </div>
      </div>
      {notification && (
        <div style={{
          position: 'fixed', top: 20, right: 20, padding: '12px 16px', borderRadius: 8,
          color: '#fff', background: notification.type === 'success' ? '#10b981' : '#ef4444',
          zIndex: 11000, boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
        }}>
          {notification.msg}
        </div>
      )}
    </div>
  );
}
