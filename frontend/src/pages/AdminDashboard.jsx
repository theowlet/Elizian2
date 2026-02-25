import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/partnerConsole.css'; // Reuse partner console CSS framework
import EnterpriseAnalyticsDashboard from '../components/analytics/EnterpriseAnalyticsDashboard';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
    ['analytics', 'Analytics'],
    ['partners', 'Partners'],
    ['deals', 'Deals'],
    ['campaigns', 'Campaign Manager'],
    ['bookings', 'Bookings'],
    ['users', 'Users'],
    ['rewards', 'Rewards'],
    ['redemptions', 'Redemptions'],
    ['tiers', 'Tier Config'],
    ['partner-tiers', 'Partner Tiers'],
    ['platform-earnings', 'Platform Earnings'],
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
  const [redemptionsTotal, setRedemptionsTotal] = useState(0);
  const [redemptionsLoading, setRedemptionsLoading] = useState(false);
  const [redemptionFilters, setRedemptionFilters] = useState({ settlement_status: '', partner_id: '', start_date: '', end_date: '', redemption_status: '', is_frozen: '' });
  const [redemptionSortBy, setRedemptionSortBy] = useState('redeemed_at');
  const [redemptionSortOrder, setRedemptionSortOrder] = useState('desc');
  const [redemptionsPage, setRedemptionsPage] = useState(0);
  const [redemptionsLimit] = useState(25);
  const [expandedRedemptionId, setExpandedRedemptionId] = useState(null);
  const [settings, setSettings] = useState([]);
  const [tiers, setTiers] = useState([]);
  const [tierEdits, setTierEdits] = useState({}); // { tierName: { ...editedFields } }
  const [partnerTiers, setPartnerTiers] = useState([]);
  const [partnerTiersLoading, setPartnerTiersLoading] = useState(false);
  const [platformEarnings, setPlatformEarnings] = useState(null);
  const [platformEarningsLoading, setPlatformEarningsLoading] = useState(false);
  const [earningsStartDate, setEarningsStartDate] = useState('');
  const [earningsEndDate, setEarningsEndDate] = useState('');
  const [earningsCountryId, setEarningsCountryId] = useState('');
  const [earningsStateId, setEarningsStateId] = useState('');
  const [earningsCityId, setEarningsCityId] = useState('');
  const [locationsCountries, setLocationsCountries] = useState([]);
  const [locationsStates, setLocationsStates] = useState([]);
  const [locationsCities, setLocationsCities] = useState([]);
  const [earningsPartnerId, setEarningsPartnerId] = useState('');
  const [earningsTier, setEarningsTier] = useState('');
  const [platformEarningsReport, setPlatformEarningsReport] = useState(null);
  const [platformEarningsReportLoading, setPlatformEarningsReportLoading] = useState(false);
  const [reportPage, setReportPage] = useState(1);
  const [reportPageSize] = useState(20);
  const [reportSortBy, setReportSortBy] = useState('created_at');
  const [reportSortOrder, setReportSortOrder] = useState('desc');
  const [expandedReportRowId, setExpandedReportRowId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notification, setNotification] = useState(null);

  // Enterprise Campaign Orchestrator state
  const [campaigns, setCampaigns] = useState([]);
  const [campaignTotal, setCampaignTotal] = useState(0);
  const [campaignLoading, setCampaignLoading] = useState(false);
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('');
  const [campaignTypeFilter, setCampaignTypeFilter] = useState('');
  const [campaignPage, setCampaignPage] = useState(0);
  const [campaignLimit] = useState(10);
  const [campaignWizardOpen, setCampaignWizardOpen] = useState(false);
  const [campaignAnalyticsId, setCampaignAnalyticsId] = useState(null);
  const [campaignAnalyticsData, setCampaignAnalyticsData] = useState(null);
  const [editingCampaignId, setEditingCampaignId] = useState(null);
  const [campaignWizardStep, setCampaignWizardStep] = useState(1);
  const [campaignSchema, setCampaignSchema] = useState(null);
  const [campaignForm, setCampaignForm] = useState({
    name: '', description: '', campaign_type: 'Growth Boost', start_at: '', end_at: '', status: 'draft',
    target_tiers: [], target_categories: [], geo_filter: {}, user_segment: {},
    rule_json: { trigger: { event: '', conditions: [] }, action: { type: '', params: {} } },
    budget_limit: null, priority_weight: 0, auto_expiry: false, activateAfterSave: false,
  });
  const [campaignSaving, setCampaignSaving] = useState(false);

  // Filters
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dealFilter, setDealFilter] = useState('');
  const [dealPromoFilter, setDealPromoFilter] = useState('');
  const [bookingFilter, setBookingFilter] = useState('');
  const [userSearch, setUserSearch] = useState('');

  const headers = useCallback(() => ({
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : ''
  }), [token]);

  // Location filter: most specific selected (city > state > country) for report/export
  const earningsLocationFilter = useMemo(() => {
    if (earningsCityId && locationsCities.length) {
      const c = locationsCities.find(x => x.id === earningsCityId);
      if (c) return c.name;
    }
    if (earningsStateId && locationsStates.length) {
      const s = locationsStates.find(x => x.id === earningsStateId);
      if (s) return s.name;
    }
    if (earningsCountryId && locationsCountries.length) {
      const c = locationsCountries.find(x => x.id === earningsCountryId);
      if (c) return c.name;
    }
    return '';
  }, [earningsCountryId, earningsStateId, earningsCityId, locationsCountries, locationsStates, locationsCities]);

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

  async function updatePartnerFeaturedEligibility(partnerId, approved_for_featured) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/partners/${partnerId}/featured-eligibility`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ approved_for_featured })
      });
      const j = await r.json();
      if (j.success) { loadPartners(partnerFilter); showNotif(approved_for_featured ? 'Partner approved for featured/trending' : 'Featured eligibility revoked'); }
      else showNotif(j.message || j.error || 'Failed', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  async function updatePartnerTier(partnerId, partner_tier) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/partners/${partnerId}/partner-tier`, {
        method: 'PUT', headers: headers(), body: JSON.stringify({ partner_tier })
      });
      const j = await r.json();
      if (j.success) { loadPartners(partnerFilter); showNotif(`Partner tier set to ${partner_tier}`); }
      else showNotif(j.error || j.message || 'Failed', 'error');
    } catch (e) { showNotif('Network error', 'error'); }
  }

  async function loadDeals(search = '', status = '', promo = '') {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      if (promo) params.set('promo', promo);
      const r = await fetch(`${API_BASE}/api/v1/admin/deals?${params}`, { headers: headers() });
      const j = await r.json();
      if (j.success) setDeals(j.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }

  async function updateDealTrending(offerId, isTrending, force = false) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/offers/${offerId}/feature`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ is_trending: isTrending, ...(force && { force: true }) })
      });
      const j = await r.json();
      if (j.success) {
        loadDeals('', dealFilter, dealPromoFilter);
        showNotif(isTrending ? (force ? 'Marked as Trending (override)' : 'Marked as Trending') : 'Removed from Trending');
      } else {
        const msg = j.error || j.message || 'Failed';
        const canOverride = typeof msg === 'string' && (msg.includes('Bronze partners cannot request') || msg.includes('not approved for featured'));
        if (isTrending && !force && canOverride && window.confirm(
          'Partner tier does not allow Trending. Override and mark as Trending anyway?'
        )) {
          updateDealTrending(offerId, true, true);
        } else {
          showNotif(msg, 'error');
        }
      }
    } catch (e) { showNotif('Network error', 'error'); }
  }

  async function approveDealTrendingRequest(offerId, dealTitle) {
    const reason = window.prompt(`Approve Trending request for "${dealTitle || 'this deal'}"?\n\nOptional: Enter a short reason/note for approval:`, '');
    if (reason === null) return; // cancelled
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/offers/${offerId}/feature-approve`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ reason: reason.trim() || null })
      });
      const j = await r.json();
      if (j.success) {
        loadDeals('', dealFilter, dealPromoFilter);
        showNotif('Trending request approved');
      } else {
        showNotif(j.error || 'Approval failed', 'error');
      }
    } catch (e) { showNotif('Network error', 'error'); }
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

  async function loadCampaigns() {
    setCampaignLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', campaignLimit);
      params.set('offset', campaignPage * campaignLimit);
      if (campaignSearch) params.set('search', campaignSearch);
      if (campaignStatusFilter) params.set('status', campaignStatusFilter);
      if (campaignTypeFilter) params.set('type', campaignTypeFilter);
      const r = await fetch(`${API_BASE}/api/v1/admin/campaigns?${params}`, { headers: headers() });
      const j = await r.json();
      if (j.success) {
        setCampaigns(j.data?.campaigns || []);
        setCampaignTotal(j.data?.total ?? 0);
      } else {
        setCampaigns([]);
        setCampaignTotal(0);
      }
    } catch (e) {
      setCampaigns([]);
      setCampaignTotal(0);
    }
    setCampaignLoading(false);
  }

  async function loadCampaignAnalytics(id) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${id}/analytics`, { headers: headers() });
      const j = await r.json();
      if (j.success) setCampaignAnalyticsData(j.data);
    } catch (e) { setCampaignAnalyticsData(null); }
  }

  useEffect(() => {
    if (activeSection === 'campaigns') loadCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, campaignPage, campaignSearch, campaignStatusFilter, campaignTypeFilter]);

  useEffect(() => {
    if (activeSection === 'platform-earnings') {
      loadPlatformEarnings();
      loadLocationsCountries();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, earningsStartDate, earningsEndDate, earningsLocationFilter, earningsPartnerId, earningsTier]);

  useEffect(() => {
    if (!earningsCountryId) {
      setLocationsStates([]);
      setLocationsCities([]);
      setEarningsStateId('');
      setEarningsCityId('');
    } else {
      loadLocationsStates(earningsCountryId);
      setEarningsStateId('');
      setEarningsCityId('');
      setLocationsCities([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earningsCountryId]);

  useEffect(() => {
    if (!earningsStateId) {
      setLocationsCities([]);
      setEarningsCityId('');
    } else {
      loadLocationsCities(earningsStateId);
      setEarningsCityId('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earningsStateId]);

  useEffect(() => {
    if (activeSection === 'platform-earnings') loadPlatformEarningsReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, reportPage, reportSortBy, reportSortOrder, earningsStartDate, earningsEndDate, earningsLocationFilter, earningsPartnerId, earningsTier]);

  // When wizard opens: load schema, load campaign for Edit or reset form for New
  useEffect(() => {
    if (!campaignWizardOpen) return;
    setCampaignWizardStep(1);
    fetch(`${API_BASE}/api/v1/admin/campaigns/schema`, { headers: headers() })
      .then((r) => r.json())
      .then((j) => { if (j.success && j.data) setCampaignSchema(j.data); })
      .catch(() => setCampaignSchema(null));
    if (editingCampaignId) {
      fetch(`${API_BASE}/api/v1/admin/campaigns/${editingCampaignId}`, { headers: headers() })
        .then((r) => r.json())
        .then((j) => {
          if (j.success && j.data) {
            const c = j.data;
            const rule = c.rules?.[0]?.rule_json || c.growth_rule || {};
            const trigger = rule.trigger || {};
            const action = rule.action || {};
            setCampaignForm({
              name: c.name || '',
              description: c.description || '',
              campaign_type: c.campaign_type || 'Growth Boost',
              start_at: c.start_at ? c.start_at.slice(0, 10) : '',
              end_at: c.end_at ? c.end_at.slice(0, 10) : '',
              status: c.status || 'draft',
              target_tiers: Array.isArray(c.target_tiers) ? c.target_tiers : [],
              target_categories: Array.isArray(c.target_categories) ? c.target_categories : [],
              geo_filter: c.geo_filter && typeof c.geo_filter === 'object' ? c.geo_filter : {},
              user_segment: c.user_segment && typeof c.user_segment === 'object' ? c.user_segment : {},
              rule_json: {
                trigger: { event: trigger.event || '', conditions: Array.isArray(trigger.conditions) ? trigger.conditions : [] },
                action: { type: action.type || '', params: action.params || {} },
              },
              budget_limit: c.budget_limit != null ? Number(c.budget_limit) : null,
              priority_weight: c.priority_weight ?? 0,
              auto_expiry: !!c.auto_expiry,
            });
          }
        })
        .catch(() => showNotif('Failed to load campaign', 'error'));
    } else {
      setCampaignForm({
        name: '', description: '', campaign_type: 'Growth Boost', start_at: '', end_at: '', status: 'draft',
        target_tiers: [], target_categories: [], geo_filter: {}, user_segment: {},
        rule_json: { trigger: { event: '', conditions: [] }, action: { type: '', params: {} } },
        budget_limit: null, priority_weight: 0, auto_expiry: false, activateAfterSave: false,
      });
    }
  }, [campaignWizardOpen, editingCampaignId]);

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

  async function loadRedemptions(opts = {}) {
    const filters = opts.filters ?? redemptionFilters;
    const sortBy = opts.sort_by ?? redemptionSortBy;
    const sortOrder = opts.sort_order ?? redemptionSortOrder;
    const page = opts.page ?? redemptionsPage;
    const limit = redemptionsLimit;
    setRedemptionsLoading(true);
    try {
      const q = new URLSearchParams();
      if (filters.settlement_status) q.set('settlement_status', filters.settlement_status);
      if (filters.partner_id) q.set('partner_id', filters.partner_id);
      if (filters.start_date) q.set('start_date', filters.start_date);
      if (filters.end_date) q.set('end_date', filters.end_date);
      if (filters.redemption_status) q.set('redemption_status', filters.redemption_status);
      if (filters.is_frozen !== '' && filters.is_frozen !== undefined) q.set('is_frozen', String(filters.is_frozen));
      q.set('sort_by', sortBy);
      q.set('sort_order', sortOrder);
      q.set('limit', String(limit));
      q.set('offset', String(page * limit));
      const r = await fetch(`${API_BASE}/api/v1/admin/redemptions?${q.toString()}`, { headers: headers() });
      const j = await r.json();
      if (j.success && j.data) {
        setRedemptions(Array.isArray(j.data.redemptions) ? j.data.redemptions : []);
        setRedemptionsTotal(Number(j.data.total) || 0);
        if (opts.page !== undefined) setRedemptionsPage(opts.page);
      }
    } catch (e) { console.error(e); }
    setRedemptionsLoading(false);
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
    if (section === 'redemptions') {
      loadRedemptions();
      loadPartners(); // populate Partner filter dropdown
    }
    if (section === 'tiers') loadTiers();
    if (section === 'partner-tiers') loadPartnerTiers();
    if (section === 'platform-earnings') {
      loadPlatformEarnings();
      loadPartners();
      loadPartnerTiers();
      loadPlatformEarningsReport();
    }
    if (section === 'settings') loadSettings();
  }

  async function loadPartnerTiers() {
    setPartnerTiersLoading(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/partner-tiers`, { headers: headers() });
      const j = await r.json();
      if (j.success && Array.isArray(j.data)) setPartnerTiers(j.data);
      else setPartnerTiers([]);
    } catch (e) { setPartnerTiers([]); }
    setPartnerTiersLoading(false);
  }

  async function loadLocationsCountries() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/locations/countries`, { headers: headers() });
      const j = await r.json();
      if (j.success && Array.isArray(j.data)) setLocationsCountries(j.data);
      else setLocationsCountries([]);
    } catch (e) { setLocationsCountries([]); }
  }

  async function loadLocationsStates(countryId) {
    if (!countryId) { setLocationsStates([]); return; }
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/locations/states?country_id=${encodeURIComponent(countryId)}`, { headers: headers() });
      const j = await r.json();
      if (j.success && Array.isArray(j.data)) setLocationsStates(j.data);
      else setLocationsStates([]);
    } catch (e) { setLocationsStates([]); }
  }

  async function loadLocationsCities(stateId) {
    if (!stateId) { setLocationsCities([]); return; }
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/locations/cities?state_id=${encodeURIComponent(stateId)}`, { headers: headers() });
      const j = await r.json();
      if (j.success && Array.isArray(j.data)) setLocationsCities(j.data);
      else setLocationsCities([]);
    } catch (e) { setLocationsCities([]); }
  }

  async function loadPlatformEarnings() {
    setPlatformEarningsLoading(true);
    try {
      const q = new URLSearchParams();
      if (earningsStartDate) q.set('start_date', earningsStartDate);
      if (earningsEndDate) q.set('end_date', earningsEndDate);
      if (earningsLocationFilter) q.set('city', earningsLocationFilter);
      if (earningsPartnerId) q.set('partner_id', earningsPartnerId);
      if (earningsTier) {
        const tierObj = (partnerTiers || []).find(t => (t.name || '').toLowerCase() === (earningsTier || '').toLowerCase());
        if (tierObj?.id) q.set('tier_id', tierObj.id);
      }
      const r = await fetch(`${API_BASE}/api/v1/admin/platform-earnings?${q}`, { headers: headers() });
      const j = await r.json();
      if (j.success && j.data) setPlatformEarnings(j.data);
      else setPlatformEarnings(null);
    } catch (e) { setPlatformEarnings(null); }
    setPlatformEarningsLoading(false);
  }

  async function loadPlatformEarningsReport() {
    setPlatformEarningsReportLoading(true);
    try {
      const q = new URLSearchParams();
      if (earningsStartDate) q.set('startDate', earningsStartDate);
      if (earningsEndDate) q.set('endDate', earningsEndDate);
      if (earningsLocationFilter) q.set('city', earningsLocationFilter);
      if (earningsPartnerId) q.set('partnerId', earningsPartnerId);
      if (earningsTier) q.set('tier', earningsTier);
      q.set('page', String(reportPage));
      q.set('pageSize', String(reportPageSize));
      q.set('sortBy', reportSortBy);
      q.set('sortOrder', reportSortOrder);
      const r = await fetch(`${API_BASE}/api/v1/admin/platform-earnings/report?${q}`, { headers: headers() });
      const j = await r.json();
      if (j.success && j.data) setPlatformEarningsReport(j.data);
      else setPlatformEarningsReport(null);
    } catch (e) { setPlatformEarningsReport(null); }
    setPlatformEarningsReportLoading(false);
  }

  async function handleExportPlatformEarnings() {
    const q = new URLSearchParams();
    if (earningsStartDate) q.set('startDate', earningsStartDate);
    if (earningsEndDate) q.set('endDate', earningsEndDate);
    if (earningsLocationFilter) q.set('city', earningsLocationFilter);
    if (earningsPartnerId) q.set('partnerId', earningsPartnerId);
    if (earningsTier) q.set('tier', earningsTier);
    try {
      const r = await fetch(`${API_BASE}/api/v1/admin/platform-earnings/export?${q}`, { headers: headers() });
      if (!r.ok) throw new Error(r.statusText);
      const blob = await r.blob();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'platform-earnings.csv';
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      showNotif(e.message || 'Export failed', 'error');
    }
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
            <thead><tr><th>Name</th><th>Email</th><th>Category</th><th>Status</th><th>Tier</th><th>Actions</th></tr></thead>
            <tbody>
              {partnersError ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24, color: 'var(--danger, #dc3545)' }}>
                  Could not load partners: {partnersError}
                </td></tr>
              ) : partners.length === 0 ? (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 24 }}>
                  No partners{partnerFilter ? ` with status "${partnerFilter}"` : ''}. {partnerFilter ? 'Try "All" to see every partner.' : 'Add partners via partner signup or admin flow.'}
                </td></tr>
              ) : partners.map(p => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>{p.email}</td>
                  <td>{p.partner_category_type || '—'}</td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(p.status)}`}>{p.status}</span></td>
                  <td>
                    <select
                      className="pc-form-input"
                      style={{ width: 'auto', minWidth: 90, padding: '4px 8px' }}
                      value={p.partner_tier || 'bronze'}
                      onChange={e => updatePartnerTier(p.id, e.target.value)}
                      title="Gold: all deals Trending | Silver: can request Trending | Bronze: admin override only"
                    >
                      <option value="bronze">Bronze</option>
                      <option value="silver">Silver</option>
                      <option value="gold">Gold</option>
                    </select>
                  </td>
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
          <h1>Deals</h1>
          <div>
            <select className="pc-form-input" style={{ width: 'auto', marginRight: 8 }} value={dealFilter} onChange={e => { setDealFilter(e.target.value); loadDeals('', e.target.value, dealPromoFilter); }}>
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="pending">Pending</option>
              <option value="pending_approval">Pending approval</option>
              <option value="inactive">Inactive</option>
            </select>
            <select className="pc-form-input" style={{ width: 'auto', marginRight: 8 }} value={dealPromoFilter} onChange={e => { setDealPromoFilter(e.target.value); loadDeals('', dealFilter, e.target.value); }}>
              <option value="">All</option>
              <option value="promoted">Trending</option>
              <option value="pending_trending">Pending trending</option>
            </select>
            <button className="btn btn-primary" onClick={() => loadDeals('', dealFilter, dealPromoFilter)}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead><tr><th>Title</th><th>Partner</th><th>Type</th><th>Start</th><th>End</th><th>Status</th><th>Trending</th><th>Actions</th></tr></thead>
            <tbody>
              {deals.length === 0 ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>No deals</td></tr> : deals.map(d => (
                <tr key={d.id}>
                  <td>{d.title}</td>
                  <td>{d.partner_name || '—'}</td>
                  <td>{d.service_type || d.offer_type || '—'}</td>
                  <td>{d.start_date ? new Date(d.start_date).toLocaleDateString() : '—'}</td>
                  <td>{d.end_date ? new Date(d.end_date).toLocaleDateString() : '—'}</td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(d.status || (new Date(d.end_date) > new Date() ? 'active' : 'inactive'))}`}>{d.status || (new Date(d.end_date) > new Date() ? 'Active' : 'Inactive')}</span></td>
                  <td>
                    {d.is_trending ? <span className="pc-badge" style={{ background: '#dc2626', color: '#fff' }}>🔥 Yes</span> : d.featured_request_pending ? <span className="pc-badge" style={{ background: '#f59e0b', color: '#fff' }}>Pending</span> : '—'}
                  </td>
                  <td>
                    <div className="pc-actions">
                      {d.is_trending ? (
                        <button className="btn btn-sm btn-secondary" style={{ marginRight: 4 }} onClick={() => updateDealTrending(d.id, false)}>Remove from Trending</button>
                      ) : d.featured_request_pending ? (
                        <>
                          <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }} onClick={() => approveDealTrendingRequest(d.id, d.title)}>Approve request</button>
                          <button className="btn btn-sm btn-secondary" style={{ marginRight: 4 }} onClick={async () => {
                            try {
                              const r = await fetch(`${API_BASE}/api/v1/admin/offers/${d.id}/feature-reject`, { method: 'POST', headers: headers() });
                              const j = await r.json();
                              if (j.success) { loadDeals('', dealFilter, dealPromoFilter); showNotif('Trending request rejected'); }
                              else showNotif(j.error || 'Reject failed', 'error');
                            } catch (e) { showNotif('Network error', 'error'); }
                          }}>Reject request</button>
                        </>
                      ) : (
                        <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }} onClick={() => updateDealTrending(d.id, true)}>Mark as Trending</button>
                      )}
                      {(d.status === 'pending' || d.status === 'pending_approval') && (
                        <>
                          <button className="btn btn-sm btn-primary" style={{ marginRight: 4 }} onClick={() => updateDealStatus(d.id, 'active')}>Approve</button>
                          <button className="btn btn-sm btn-danger" onClick={() => updateDealStatus(d.id, 'rejected')}>Reject</button>
                        </>
                      )}
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

  function CampaignsSection() {
    const handleDelete = async (id, name) => {
      if (!window.confirm(`Delete campaign "${name}"?`)) return;
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${id}`, { method: 'DELETE', headers: headers() });
        const j = await r.json();
        if (j.success) { loadCampaigns(); showNotif('Campaign deleted'); }
        else showNotif(j.message || 'Delete failed', 'error');
      } catch (e) { showNotif('Network error', 'error'); }
    };
    const handleClone = async (id) => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${id}/clone`, { method: 'POST', headers: headers() });
        const j = await r.json();
        if (j.success) { loadCampaigns(); showNotif('Campaign cloned'); }
        else showNotif(j.message || 'Clone failed', 'error');
      } catch (e) { showNotif('Network error', 'error'); }
    };
    const handlePause = async (id) => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${id}/pause`, { method: 'PUT', headers: headers() });
        const j = await r.json();
        if (j.success) { loadCampaigns(); showNotif('Campaign paused'); }
        else showNotif(j.message || 'Pause failed', 'error');
      } catch (e) { showNotif('Network error', 'error'); }
    };
    const isPartnerRequestCampaign = (campaign) => {
      const requestContext = campaign?.user_segment?.__partner_context;
      return requestContext?.request_to_admin === true
        || requestContext?.request_status === 'pending_admin_review'
        || String(campaign?.name || '').startsWith('[REQUEST]');
    };
    const handleApproveRequest = async (campaign) => {
      if (!campaign?.id) return;
      if (!window.confirm(`Approve campaign request "${campaign.name || 'Untitled'}" and activate it?`)) return;
      try {
        const existingContext = campaign?.user_segment?.__partner_context || {};
        const nextUserSegment = {
          ...(campaign?.user_segment || {}),
          __partner_context: {
            ...existingContext,
            request_to_admin: false,
            request_status: 'approved_by_admin',
            approved_at: new Date().toISOString(),
          },
        };
        const cleanedName = String(campaign?.name || '').replace(/^\[REQUEST\]\s*/i, '').trim();
        const payload = {
          status: 'active',
          name: cleanedName || campaign?.name || 'Untitled Campaign',
          user_segment: nextUserSegment,
        };
        const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${campaign.id}`, {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (j.success) {
          loadCampaigns();
          showNotif('Campaign request approved and activated');
        } else {
          showNotif(j.message || 'Approval failed', 'error');
        }
      } catch (e) {
        showNotif('Network error', 'error');
      }
    };
    const handleRequestChanges = async (campaign) => {
      if (!campaign?.id) return;
      const reason = window.prompt('Ask partner to revise this request.\nOptional note for internal tracking:', '');
      if (reason === null) return;
      try {
        const existingContext = campaign?.user_segment?.__partner_context || {};
        const nextUserSegment = {
          ...(campaign?.user_segment || {}),
          __partner_context: {
            ...existingContext,
            request_to_admin: true,
            request_status: 'changes_requested',
            admin_note: reason.trim() || null,
            reviewed_at: new Date().toISOString(),
          },
        };
        const payload = {
          status: 'draft',
          user_segment: nextUserSegment,
        };
        const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${campaign.id}`, {
          method: 'PUT',
          headers: headers(),
          body: JSON.stringify(payload),
        });
        const j = await r.json();
        if (j.success) {
          loadCampaigns();
          showNotif('Marked as changes requested');
        } else {
          showNotif(j.message || 'Update failed', 'error');
        }
      } catch (e) {
        showNotif('Network error', 'error');
      }
    };
    const openAnalytics = (id) => {
      setCampaignAnalyticsId(id);
      setCampaignAnalyticsData(null);
      loadCampaignAnalytics(id);
    };

    return (
      <div>
        <div className="pc-content-header">
          <h1>Campaign Manager</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="pc-form-input"
              style={{ width: 200 }}
              placeholder="Search campaigns..."
              value={campaignSearch}
              onChange={(e) => setCampaignSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadCampaigns()}
            />
            <select
              className="pc-form-input"
              style={{ width: 120 }}
              value={campaignStatusFilter}
              onChange={(e) => { setCampaignStatusFilter(e.target.value); setCampaignPage(0); }}
            >
              <option value="">All status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
            <select
              className="pc-form-input"
              style={{ width: 140 }}
              value={campaignTypeFilter}
              onChange={(e) => { setCampaignTypeFilter(e.target.value); setCampaignPage(0); }}
            >
              <option value="">All types</option>
              <option value="Seasonal">Seasonal</option>
              <option value="Tier Exclusive">Tier Exclusive</option>
              <option value="Geographic">Geographic</option>
              <option value="Growth Boost">Growth Boost</option>
              <option value="Experimental">Experimental</option>
            </select>
            <button className="btn btn-secondary" onClick={() => loadCampaigns()}>Refresh</button>
            <button className="btn btn-primary" onClick={() => { setEditingCampaignId(null); setCampaignWizardOpen(true); }}>New campaign</button>
          </div>
        </div>
        <div className="pc-table-container">
          {campaignLoading ? (
            <div style={{ padding: 48, textAlign: 'center', color: '#666' }}>Loading campaigns...</div>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table className="pc-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Start</th>
                      <th>End</th>
                      <th>Target Tiers</th>
                      <th>Target Categories</th>
                      <th>Priority</th>
                      <th>Budget</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {campaigns.length === 0 ? (
                      <tr><td colSpan={10} style={{ textAlign: 'center', padding: 32 }}>No campaigns. Create one with New campaign.</td></tr>
                    ) : campaigns.map((c) => {
                      const status = c.status || (c.is_active ? 'active' : 'draft');
                      const requestContext = c.user_segment?.__partner_context || null;
                      const isPartnerRequest = isPartnerRequestCampaign(c);
                      const requestStatus = requestContext?.request_status;
                      return (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 600 }}>{c.name || '—'}</td>
                        <td>{c.campaign_type || '—'}</td>
                        <td>
                          <span className={`pc-badge pc-badge-${status === 'active' ? 'success' : status === 'paused' ? 'warning' : 'default'}`}>
                            {status}
                          </span>
                          {isPartnerRequest && requestStatus && (
                            <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#f59e0b' }}>
                              {String(requestStatus).replace(/_/g, ' ')}
                            </div>
                          )}
                        </td>
                        <td style={{ fontSize: '0.85rem' }}>{(c.start_at || c.start_date) ? new Date(c.start_at || c.start_date).toLocaleDateString() : '—'}</td>
                        <td style={{ fontSize: '0.85rem' }}>{(c.end_at || c.end_date) ? new Date(c.end_at || c.end_date).toLocaleDateString() : '—'}</td>
                        <td style={{ fontSize: '0.8rem' }}>{(c.target_tiers || []).length ? (c.target_tiers || []).join(', ') : 'All'}</td>
                        <td style={{ fontSize: '0.8rem' }}>{(c.target_categories || []).length ? (c.target_categories || []).join(', ') : '—'}</td>
                        <td>{c.priority_weight ?? 0}</td>
                        <td>{c.budget_limit != null ? `₹${Number(c.budget_limit).toLocaleString()}` : '—'}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => { setEditingCampaignId(c.id); setCampaignWizardOpen(true); }}>Edit</button>
                            {isPartnerRequest && status === 'draft' && (
                              <>
                                <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleApproveRequest(c)}>Approve</button>
                                <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleRequestChanges(c)}>Request changes</button>
                              </>
                            )}
                            <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handleClone(c.id)}>Clone</button>
                            {status === 'active' && (
                              <button type="button" className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => handlePause(c.id)}>Pause</button>
                            )}
                            <button type="button" className="btn btn-primary" style={{ padding: '4px 8px', fontSize: '0.8rem' }} onClick={() => openAnalytics(c.id)}>Analytics</button>
                            <button type="button" className="btn" style={{ padding: '4px 8px', fontSize: '0.8rem', color: '#ef4444', border: '1px solid #ef4444' }} onClick={() => handleDelete(c.id, c.name)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    )})}
                  </tbody>
                </table>
              </div>
              {campaignTotal > campaignLimit && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, padding: '8px 0' }}>
                  <span style={{ color: '#666', fontSize: '0.9rem' }}>
                    {campaignPage * campaignLimit + 1}–{Math.min((campaignPage + 1) * campaignLimit, campaignTotal)} of {campaignTotal}
                  </span>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-secondary" disabled={campaignPage === 0} onClick={() => setCampaignPage((p) => Math.max(0, p - 1))}>Previous</button>
                    <button className="btn btn-secondary" disabled={(campaignPage + 1) * campaignLimit >= campaignTotal} onClick={() => setCampaignPage((p) => p + 1)}>Next</button>
                  </div>
                </div>
              )}
            </>
          )}
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

  const REDEMPTION_SORT_FIELDS = [
    { key: 'redeemed_at', label: 'Redeemed at' },
    { key: 'booking_reference', label: 'Booking ref' },
    { key: 'partner_name', label: 'Partner' },
    { key: 'total_bill_amount', label: 'Total bill' },
    { key: 'ezt_co_pay_amount', label: 'EZT co-pay' },
    { key: 'net_amount_from_user', label: 'Net amount' },
    { key: 'settlement_status', label: 'Settlement' },
    { key: 'redemption_status', label: 'Redemption status' },
  ];

  function RedemptionsSection() {
    const applyFilters = () => loadRedemptions({ page: 0 });
    const setSort = (by) => {
      const order = redemptionSortBy === by && redemptionSortOrder === 'desc' ? 'asc' : 'desc';
      setRedemptionSortBy(by);
      setRedemptionSortOrder(order);
      loadRedemptions({ sort_by: by, sort_order: order });
    };
    const totalPages = Math.ceil(redemptionsTotal / redemptionsLimit) || 0;

    return (
      <div>
        <div className="pc-content-header">
          <h1>Redemptions</h1>
          <button className="btn btn-primary" onClick={() => loadRedemptions()} disabled={redemptionsLoading}>
            {redemptionsLoading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>Settlement</label>
            <select
              className="pc-form-input"
              value={redemptionFilters.settlement_status}
              onChange={(e) => setRedemptionFilters((f) => ({ ...f, settlement_status: e.target.value }))}
              style={{ minWidth: 120 }}
            >
              <option value="">All</option>
              <option value="pending">Pending</option>
              <option value="settled">Settled</option>
              <option value="disputed">Disputed</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>Redemption status</label>
            <select
              className="pc-form-input"
              value={redemptionFilters.redemption_status}
              onChange={(e) => setRedemptionFilters((f) => ({ ...f, redemption_status: e.target.value }))}
              style={{ minWidth: 140 }}
            >
              <option value="">All</option>
              <option value="pending_confirmation">Pending confirmation</option>
              <option value="redeemed">Redeemed</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>Partner</label>
            <select
              className="pc-form-input"
              value={redemptionFilters.partner_id}
              onChange={(e) => setRedemptionFilters((f) => ({ ...f, partner_id: e.target.value }))}
              style={{ minWidth: 160 }}
            >
              <option value="">All partners</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name || p.id}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>From date</label>
            <input
              type="date"
              className="pc-form-input"
              value={redemptionFilters.start_date}
              onChange={(e) => setRedemptionFilters((f) => ({ ...f, start_date: e.target.value }))}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', color: '#9ca3af', marginBottom: 4 }}>To date</label>
            <input
              type="date"
              className="pc-form-input"
              value={redemptionFilters.end_date}
              onChange={(e) => setRedemptionFilters((f) => ({ ...f, end_date: e.target.value }))}
            />
          </div>
          <button className="btn btn-primary" onClick={applyFilters}>Apply filters</button>
        </div>

        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                {REDEMPTION_SORT_FIELDS.map(({ key, label }) => (
                  <th
                    key={key}
                    style={{ cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSort(key)}
                    title={`Sort by ${label}`}
                  >
                    {label} {redemptionSortBy === key ? (redemptionSortOrder === 'asc' ? '↑' : '↓') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {redemptionsLoading && redemptions.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>Loading redemptions…</td></tr>
              ) : redemptions.length === 0 ? (
                <tr><td colSpan={9} style={{ textAlign: 'center', padding: 24 }}>No redemptions match the filters.</td></tr>
              ) : (
                redemptions.map((r) => (
                  <React.Fragment key={r.id}>
                    <tr
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExpandedRedemptionId((id) => (id === r.id ? null : r.id))}
                    >
                      <td>{expandedRedemptionId === r.id ? '▼' : '▶'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString() : '—'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>{r.booking_reference || '—'}</td>
                      <td>{r.partner_name || '—'}</td>
                      <td>₹{parseFloat(r.total_bill_amount || 0).toFixed(2)}</td>
                      <td>₹{parseFloat(r.ezt_co_pay_amount || 0).toFixed(2)}</td>
                      <td>₹{parseFloat(r.net_amount_from_user || 0).toFixed(2)}</td>
                      <td><span className={`pc-badge pc-badge-${r.settlement_status === 'settled' ? 'success' : r.settlement_status === 'disputed' ? 'error' : 'warning'}`}>{r.settlement_status || 'pending'}</span></td>
                      <td><span className={`pc-badge pc-badge-${r.redemption_status === 'redeemed' ? 'success' : 'warning'}`}>{r.redemption_status || '—'}</span></td>
                    </tr>
                    {expandedRedemptionId === r.id && (
                      <tr>
                        <td colSpan={9} className="redemption-detail-panel">
                          <div className="redemption-detail-content">
                            <div className="redemption-detail-grid">
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Booking reference</span>
                                <span className="redemption-detail-value">{r.booking_reference || '—'}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Customer</span>
                                <span className="redemption-detail-value">{r.user_name || '—'}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Deal</span>
                                <span className="redemption-detail-value">{r.deal_title || '—'}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Redeemed at</span>
                                <span className="redemption-detail-value">{r.redeemed_at ? new Date(r.redeemed_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Total bill</span>
                                <span className="redemption-detail-value">₹{parseFloat(r.total_bill_amount ?? r.metadata?.calculated?.discount_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">EZT co-pay</span>
                                <span className="redemption-detail-value">₹{parseFloat(r.ezt_co_pay_amount ?? r.metadata?.calculated?.ezt_co_pay_amount ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Net from customer</span>
                                <span className="redemption-detail-value">₹{parseFloat(r.net_amount_from_user ?? r.metadata?.calculated?.net_amount_from_user ?? 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Settlement</span>
                                <span className="redemption-detail-value">{r.settlement_status || 'pending'}</span>
                              </div>
                              <div className="redemption-detail-item">
                                <span className="redemption-detail-label">Frozen</span>
                                <span className="redemption-detail-value">{r.is_frozen ? 'Yes' : 'No'}</span>
                              </div>
                            </div>
                            {r.metadata && typeof r.metadata === 'object' && (() => {
                              const m = r.metadata;
                              const calc = m.calculated || m;
                              const coPayPct = calc?.co_pay_percentage;
                              const wallet = m.customer_wallet_ezt_at_redemption ?? m.customer_wallet_at_redemption;
                              const parts = [];
                              if (typeof coPayPct === 'number') parts.push(`Co-pay ${coPayPct}%`);
                              if (wallet != null) parts.push(`Customer wallet at redemption: ${Number(wallet).toFixed(1)} EZT`);
                              if (m.validation_warnings?.length) parts.push(`${m.validation_warnings.length} validation warning(s)`);
                              if (parts.length === 0) return null;
                              return (
                                <div className="redemption-detail-summary">
                                  <span className="redemption-detail-label">Summary</span>
                                  <span className="redemption-detail-value">{parts.join(' · ')}</span>
                                </div>
                              );
                            })()}
                            {r.redemption_notes && (
                              <div className="redemption-detail-item" style={{ gridColumn: '1 / -1' }}>
                                <span className="redemption-detail-label">Notes</span>
                                <span className="redemption-detail-value">{r.redemption_notes}</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" disabled={redemptionsPage === 0} onClick={() => loadRedemptions({ page: redemptionsPage - 1 })}>Previous</button>
            <span style={{ color: '#9ca3af' }}>Page {redemptionsPage + 1} of {totalPages} ({redemptionsTotal} total)</span>
            <button className="btn btn-secondary" disabled={redemptionsPage >= totalPages - 1} onClick={() => loadRedemptions({ page: redemptionsPage + 1 })}>Next</button>
          </div>
        )}
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

  function PartnerTiersSection() {
    const [createOpen, setCreateOpen] = useState(false);
    const [form, setForm] = useState({ name: '', description: '', platform_fee_percent: 15, fiat_fee_percent: 10, ezt_fee_percent: 5, is_active: true });
    const [saving, setSaving] = useState(false);
    const [editingTier, setEditingTier] = useState(null);
    const [editForm, setEditForm] = useState({ name: '', description: '', platform_fee_percent: 0, fiat_fee_percent: 0, ezt_fee_percent: 0, is_active: true });
    const [superAdminConfirm, setSuperAdminConfirm] = useState({ open: false, action: null, payload: null });

    const createTier = async () => {
      if (!form.name.trim() || Number(form.platform_fee_percent) !== Number(form.fiat_fee_percent) + Number(form.ezt_fee_percent)) {
        showNotif('Name required and fiat + ezt must equal platform_fee_percent', 'error');
        return;
      }
      setSaving(true);
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/partner-tiers`, {
          method: 'POST', headers: { ...headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify(form),
        });
        const j = await r.json();
        if (j.success) { setCreateOpen(false); setForm({ name: '', description: '', platform_fee_percent: 15, fiat_fee_percent: 10, ezt_fee_percent: 5, is_active: true }); loadPartnerTiers(); showNotif('Tier created', 'success'); }
        else showNotif(j.message || j.error || 'Failed', 'error');
      } catch (e) { showNotif('Request failed', 'error'); }
      setSaving(false);
    };

    const updateTier = async (id, body) => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/partner-tiers/${id}`, {
          method: 'PUT', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        const j = await r.json();
        if (j.success) { setEditingTier(null); loadPartnerTiers(); showNotif('Tier updated', 'success'); }
        else showNotif(j.message || j.error || 'Failed', 'error');
      } catch (e) { showNotif('Request failed', 'error'); }
    };

    const setActive = async (id, active) => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/partner-tiers/${id}/active`, {
          method: 'PATCH', headers: { ...headers(), 'Content-Type': 'application/json' }, body: JSON.stringify({ active }),
        });
        const j = await r.json();
        if (j.success) { loadPartnerTiers(); showNotif(active ? 'Tier activated' : 'Tier deactivated', 'success'); }
        else showNotif(j.message || j.error || 'Failed', 'error');
      } catch (e) { showNotif('Request failed', 'error'); }
    };

    const deleteTier = async (id) => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/admin/partner-tiers/${id}`, { method: 'DELETE', headers: headers() });
        const j = await r.json();
        if (j.success) { loadPartnerTiers(); showNotif('Tier deleted', 'success'); }
        else showNotif(j.message || j.error || 'Failed', 'error');
      } catch (e) { showNotif('Request failed', 'error'); }
    };

    const openEditModal = (t) => {
      setEditingTier(t);
      setEditForm({
        name: t.name || '',
        description: t.description || '',
        platform_fee_percent: Number(t.platform_fee_percent) || 0,
        fiat_fee_percent: Number(t.fiat_fee_percent) || 0,
        ezt_fee_percent: Number(t.ezt_fee_percent) || 0,
        is_active: t.is_active !== false,
      });
    };

    const requestEditSave = () => {
      const p = Number(editForm.platform_fee_percent);
      const f = Number(editForm.fiat_fee_percent);
      const e = Number(editForm.ezt_fee_percent);
      if (!editForm.name.trim()) { showNotif('Name is required', 'error'); return; }
      if (Math.abs((f + e) - p) > 0.01) { showNotif('Fiat % + EZT % must equal Platform %', 'error'); return; }
      setSuperAdminConfirm({ open: true, action: 'edit', payload: { id: editingTier.id, body: editForm } });
    };

    const requestDelete = (id) => {
      if (!window.confirm('Delete this tier? This will fail if any partner is assigned to it.')) return;
      setSuperAdminConfirm({ open: true, action: 'delete', payload: { id } });
    };

    const onSuperAdminConfirm = async () => {
      if (superAdminConfirm.action === 'edit' && superAdminConfirm.payload?.body) {
        await updateTier(superAdminConfirm.payload.id, superAdminConfirm.payload.body);
      } else if (superAdminConfirm.action === 'delete' && superAdminConfirm.payload?.id) {
        await deleteTier(superAdminConfirm.payload.id);
      }
      setSuperAdminConfirm({ open: false, action: null, payload: null });
    };

    return (
      <div>
        <div className="pc-content-header">
          <h1>Partner Tiers</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={loadPartnerTiers}>Refresh</button>
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>Create Tier</button>
          </div>
        </div>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 16 }}>
          Dynamic subscription tiers; platform fee split (fiat + EZT). Gold/Silver/Bronze are default seeded. Editing and deleting require Super Admin confirmation.
        </p>
        {partnerTiersLoading ? <p style={{ padding: 24, textAlign: 'center' }}>Loading...</p> : (
          <div className="pc-table-container">
            <table className="pc-table">
              <thead><tr><th>Name</th><th>Description</th><th>Platform %</th><th>Fiat %</th><th>EZT %</th><th>Active</th><th>Actions</th></tr></thead>
              <tbody>
                {partnerTiers.map(t => (
                  <tr key={t.id}>
                    <td><strong>{t.name}</strong></td>
                    <td style={{ maxWidth: 200 }}>{t.description || '—'}</td>
                    <td>{t.platform_fee_percent}</td>
                    <td>{t.fiat_fee_percent}</td>
                    <td>{t.ezt_fee_percent}</td>
                    <td>{t.is_active ? 'Yes' : 'No'}</td>
                    <td>
                      <button className="btn btn-sm btn-secondary" onClick={() => openEditModal(t)}>Edit</button>
                      <button className="btn btn-sm btn-secondary" style={{ marginLeft: 4 }} onClick={() => setActive(t.id, !t.is_active)}>{t.is_active ? 'Deactivate' : 'Activate'}</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft: 4 }} onClick={() => requestDelete(t.id)}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {partnerTiers.length === 0 && <p style={{ padding: 24, textAlign: 'center', color: '#666' }}>No partner tiers. Create one or run migration to seed Gold/Silver/Bronze.</p>}
          </div>
        )}
        {createOpen && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setCreateOpen(false)}>
            <div style={{ background: '#1f2937', borderRadius: 12, maxWidth: 420, width: '100%', padding: 24 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px' }}>Create Partner Tier</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={ts.label}>Name</label><input className="pc-form-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Platinum" style={{ width: '100%' }} /></div>
                <div><label style={ts.label}>Description</label><input className="pc-form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" style={{ width: '100%' }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><label style={ts.label}>Platform %</label><input type="number" step="0.01" className="pc-form-input" value={form.platform_fee_percent} onChange={e => setForm(f => ({ ...f, platform_fee_percent: Number(e.target.value) }))} /></div>
                  <div><label style={ts.label}>Fiat %</label><input type="number" step="0.01" className="pc-form-input" value={form.fiat_fee_percent} onChange={e => setForm(f => ({ ...f, fiat_fee_percent: Number(e.target.value) }))} /></div>
                  <div><label style={ts.label}>EZT %</label><input type="number" step="0.01" className="pc-form-input" value={form.ezt_fee_percent} onChange={e => setForm(f => ({ ...f, ezt_fee_percent: Number(e.target.value) }))} /></div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={createTier} disabled={saving}>{saving ? 'Creating...' : 'Create'}</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {editingTier && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setEditingTier(null)}>
            <div style={{ background: '#1f2937', borderRadius: 12, maxWidth: 420, width: '100%', padding: 24 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px' }}>Edit Partner Tier</h3>
              <div style={{ display: 'grid', gap: 12 }}>
                <div><label style={ts.label}>Name</label><input className="pc-form-input" value={editForm.name} onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} placeholder="Tier name" style={{ width: '100%' }} /></div>
                <div><label style={ts.label}>Description</label><input className="pc-form-input" value={editForm.description} onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional" style={{ width: '100%' }} /></div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div><label style={ts.label}>Platform %</label><input type="number" step="0.01" className="pc-form-input" value={editForm.platform_fee_percent} onChange={e => setEditForm(f => ({ ...f, platform_fee_percent: Number(e.target.value) }))} /></div>
                  <div><label style={ts.label}>Fiat %</label><input type="number" step="0.01" className="pc-form-input" value={editForm.fiat_fee_percent} onChange={e => setEditForm(f => ({ ...f, fiat_fee_percent: Number(e.target.value) }))} /></div>
                  <div><label style={ts.label}>EZT %</label><input type="number" step="0.01" className="pc-form-input" value={editForm.ezt_fee_percent} onChange={e => setEditForm(f => ({ ...f, ezt_fee_percent: Number(e.target.value) }))} /></div>
                </div>
                <div><label style={ts.label}>Active</label><input type="checkbox" checked={editForm.is_active} onChange={e => setEditForm(f => ({ ...f, is_active: e.target.checked }))} /></div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
                  <button className="btn btn-secondary" onClick={() => setEditingTier(null)}>Cancel</button>
                  <button className="btn btn-primary" onClick={requestEditSave}>Save (requires Super Admin)</button>
                </div>
              </div>
            </div>
          </div>
        )}
        {superAdminConfirm.open && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10001, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setSuperAdminConfirm({ open: false, action: null, payload: null })}>
            <div style={{ background: '#1f2937', borderRadius: 12, maxWidth: 400, width: '100%', padding: 24 }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 12px', color: '#fbbf24' }}>Super Admin confirmation</h3>
              <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: 20 }}>
                {superAdminConfirm.action === 'edit'
                  ? 'Editing partner tiers requires Super Admin privileges. Confirm your authorization to apply this change.'
                  : 'Deleting a partner tier requires Super Admin privileges. Confirm your authorization to proceed.'}
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-secondary" onClick={() => setSuperAdminConfirm({ open: false, action: null, payload: null })}>Cancel</button>
                <button className="btn btn-primary" onClick={onSuperAdminConfirm} style={{ background: '#b45309' }}>Confirm</button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function PlatformEarningsSection() {
    const report = platformEarningsReport || {};
    const reportRows = report.rows || [];
    const reportTotal = report.total ?? 0;
    const totalPages = Math.ceil(reportTotal / reportPageSize) || 1;
    const sortToggle = (col) => {
      if (reportSortBy === col) setReportSortOrder(o => o === 'desc' ? 'asc' : 'desc');
      else { setReportSortBy(col); setReportSortOrder('desc'); }
    };
    return (
      <div>
        <div className="pc-content-header">
          <h1>Platform Earnings</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={() => { loadPlatformEarnings(); loadPlatformEarningsReport(); }}>Refresh</button>
            <button className="btn btn-secondary" onClick={handleExportPlatformEarnings}>Export CSV</button>
          </div>
        </div>
        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 16 }}>
          <strong>Total</strong> = platform fee (from ledger). <strong>Fiat</strong> and <strong>EZT</strong> = reporting split of that fee (Fiat % and EZT % of fiat received; when equal %, amounts are equal). Older rows may show Fiat ≠ EZT until normalized. Drill down by clicking a tier or partner.
        </p>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div><label style={ts.label}>Start date</label><input type="date" className="pc-form-input" value={earningsStartDate} onChange={e => setEarningsStartDate(e.target.value)} /></div>
          <div><label style={ts.label}>End date</label><input type="date" className="pc-form-input" value={earningsEndDate} onChange={e => setEarningsEndDate(e.target.value)} /></div>
          <div><label style={ts.label}>Country</label><select className="pc-form-input" value={earningsCountryId} onChange={e => setEarningsCountryId(e.target.value)} style={{ minWidth: 140 }}><option value="">All</option>{locationsCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label style={ts.label}>State</label><select className="pc-form-input" value={earningsStateId} onChange={e => setEarningsStateId(e.target.value)} style={{ minWidth: 160 }} disabled={!earningsCountryId}><option value="">All</option>{locationsStates.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
          <div><label style={ts.label}>City</label><select className="pc-form-input" value={earningsCityId} onChange={e => setEarningsCityId(e.target.value)} style={{ minWidth: 140 }} disabled={!earningsStateId}><option value="">All</option>{locationsCities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
          <div><label style={ts.label}>Partner</label><select className="pc-form-input" value={earningsPartnerId} onChange={e => {
            const id = e.target.value;
            setEarningsPartnerId(id);
            if (id) {
              const p = (partners || []).find(x => x.id === id);
              const tierName = p?.partner_tier ? (partnerTiers || []).find(t => t.name && String(t.name).toLowerCase() === String(p.partner_tier).toLowerCase())?.name || String(p.partner_tier).replace(/^\w/, c => c.toUpperCase()) : '';
              setEarningsTier(tierName);
            } else setEarningsTier('');
          }} style={{ minWidth: 160 }}><option value="">All</option>{(partners || []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></div>
          <div><label style={ts.label}>Tier</label><select className="pc-form-input" value={earningsTier} onChange={e => setEarningsTier(e.target.value)} disabled={!!earningsPartnerId} style={{ minWidth: 120 }} title={earningsPartnerId ? 'Tier is set from selected partner' : ''}><option value="">All</option>{(partnerTiers || []).map(t => <option key={t.id} value={t.name}>{t.name}</option>)}</select></div>
        </div>
        {platformEarningsLoading ? <p style={{ padding: 24, textAlign: 'center' }}>Loading...</p> : platformEarnings && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
              <div style={{ background: 'var(--card)', padding: 16, borderRadius: 12 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Total earnings</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{Number(platformEarnings.total_earnings || 0).toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--card)', padding: 16, borderRadius: 12 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Fiat component</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{Number(platformEarnings.total_fiat || 0).toFixed(2)}</div>
              </div>
              <div style={{ background: 'var(--card)', padding: 16, borderRadius: 12 }}>
                <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>EZT component</div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>₹{Number(platformEarnings.total_ezt || 0).toFixed(2)}</div>
              </div>
            </div>
            {(platformEarnings.breakdown_by_tier?.length > 0) && (
              <div>
                <h3 style={{ marginBottom: 8 }}>By tier (click to drill down)</h3>
                <div className="pc-table-container">
                  <table className="pc-table">
                    <thead><tr><th>Tier</th><th>Total</th><th>Fiat</th><th>EZT</th></tr></thead>
                    <tbody>
                      {platformEarnings.breakdown_by_tier.map(r => (
                        <tr key={r.tier_id} style={{ cursor: 'pointer' }} onClick={() => { setEarningsTier(r.tier_name); setReportPage(1); }}>
                          <td>{r.tier_name}</td><td>₹{Number(r.total_earnings).toFixed(2)}</td><td>₹{Number(r.total_fiat).toFixed(2)}</td><td>₹{Number(r.total_ezt).toFixed(2)}</td>
                        </tr>
                      ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {(platformEarnings.breakdown_by_partner?.length > 0) && (
              <div>
                <h3 style={{ marginBottom: 8 }}>By partner (click to drill down)</h3>
                <div className="pc-table-container">
                  <table className="pc-table">
                    <thead><tr><th>Partner</th><th>Total</th><th>Fiat</th><th>EZT</th></tr></thead>
                    <tbody>
                      {platformEarnings.breakdown_by_partner.map(r => (
                        <tr key={r.partner_id} style={{ cursor: 'pointer' }} onClick={() => { setEarningsPartnerId(r.partner_id); setReportPage(1); }}>
                          <td>{r.partner_name}</td><td>₹{Number(r.total_earnings).toFixed(2)}</td><td>₹{Number(r.total_fiat).toFixed(2)}</td><td>₹{Number(r.total_ezt).toFixed(2)}</td>
                        </tr>
                      ))}</tbody>
                  </table>
                </div>
              </div>
            )}
            {!platformEarnings.total_earnings && !platformEarnings.breakdown_by_tier?.length && !platformEarnings.breakdown_by_partner?.length && (
              <p style={{ padding: 24, textAlign: 'center', color: '#666' }}>No earnings in range. Run redemptions after migration to see data.</p>
            )}

            <div>
              <h3 style={{ marginBottom: 8 }}>Report (ledger rows)</h3>
              {platformEarningsReportLoading ? <p style={{ padding: 24, textAlign: 'center' }}>Loading report...</p> : (
                <>
                  <div className="pc-table-container">
                    <table className="pc-table">
                      <thead>
                        <tr>
                          <th></th>
                          <th style={{ cursor: 'pointer' }} onClick={() => sortToggle('created_at')}>Date {reportSortBy === 'created_at' && (reportSortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => sortToggle('tier_name')}>Tier {reportSortBy === 'tier_name' && (reportSortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => sortToggle('partner_name')}>Partner {reportSortBy === 'partner_name' && (reportSortOrder === 'asc' ? '↑' : '↓')}</th>
                          <th>Deal</th>
                          <th style={{ cursor: 'pointer' }} onClick={() => sortToggle('platform_fee_total')}>Platform fee {reportSortBy === 'platform_fee_total' && (reportSortOrder === 'asc' ? '↑' : '↓')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportRows.map(row => (
                          <React.Fragment key={row.id}>
                            <tr style={{ cursor: 'pointer' }} onClick={() => setExpandedReportRowId(expandedReportRowId === row.id ? null : row.id)}>
                              <td>{expandedReportRowId === row.id ? '▼' : '▶'}</td>
                              <td>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</td>
                              <td>{row.tier_name ?? '—'}</td>
                              <td>{row.partner_name ?? '—'}</td>
                              <td>{(row.deal_title || '').slice(0, 30)}{(row.deal_title || '').length > 30 ? '…' : ''}</td>
                              <td>₹{Number(row.platform_fee_total ?? 0).toFixed(2)}</td>
                            </tr>
                            {expandedReportRowId === row.id && (
                              <tr><td colSpan={6} style={{ background: 'var(--bg)', padding: 12, fontSize: '0.9rem' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8, maxWidth: 560 }}>
                                  <span>Booking ID</span><span>{row.booking_id ?? '—'}</span>
                                  <span>Deal</span><span>{row.deal_title ?? '—'}</span>
                                  <span>Timestamp</span><span>{row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</span>
                                  <span>Fiat component</span><span>₹{Number(row.fiat_component ?? 0).toFixed(2)}</span>
                                  <span>EZT component</span><span>₹{Number(row.ezt_component ?? 0).toFixed(2)}</span>
                                  <span>Platform fee</span><span>₹{Number(row.platform_fee_total ?? 0).toFixed(2)}</span>
                                </div>
                              </td></tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {reportTotal === 0 && <p style={{ padding: 16, textAlign: 'center', color: '#9ca3af' }}>No ledger rows match the filters.</p>}
                  {totalPages > 1 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                      <button className="btn btn-sm btn-secondary" disabled={reportPage <= 1} onClick={() => setReportPage(p => Math.max(1, p - 1))}>Previous</button>
                      <span style={{ color: '#9ca3af' }}>Page {reportPage} of {totalPages} ({reportTotal} rows)</span>
                      <button className="btn btn-sm btn-secondary" disabled={reportPage >= totalPages} onClick={() => setReportPage(p => p + 1)}>Next</button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

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
            {activeSection === 'analytics' && (
              <EnterpriseAnalyticsDashboard
                authHeaders={headers}
                role="admin"
                partnerOptions={partners}
                tierOptions={partnerTiers}
                dealOptions={deals}
                categoryOptions={[]}
              />
            )}
            {activeSection === 'partners' && <PartnersSection />}
            {activeSection === 'deals' && <DealsSection />}
            {activeSection === 'campaigns' && <CampaignsSection />}
            {activeSection === 'bookings' && <BookingsSection />}
            {activeSection === 'users' && <UsersSection />}
            {activeSection === 'rewards' && <RewardsSection />}
            {activeSection === 'redemptions' && <RedemptionsSection />}
            {activeSection === 'tiers' && <TiersSection />}
            {activeSection === 'partner-tiers' && <PartnerTiersSection />}
            {activeSection === 'platform-earnings' && <PlatformEarningsSection />}
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

      {/* Campaign modals at root so inputs keep focus (not inside CampaignsSection) */}
      {campaignAnalyticsId && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => setCampaignAnalyticsId(null)}>
          <div style={{ background: '#1f2937', borderRadius: 12, maxWidth: 520, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 16px' }}>Campaign Analytics</h3>
            {campaignAnalyticsData ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Bookings influenced</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 700 }}>{campaignAnalyticsData.bookings_influenced ?? 0}</div>
                </div>
                <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Revenue generated</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981' }}>₹{(campaignAnalyticsData.revenue_generated ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                </div>
                <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Reward issued (EZT)</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{(campaignAnalyticsData.reward_issued ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
                </div>
                {(campaignAnalyticsData.budget_used != null || campaignAnalyticsData.budget_limit != null) && (
                  <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Budget used / limit</div>
                    <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>{(campaignAnalyticsData.budget_used ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })} {campaignAnalyticsData.budget_limit != null ? ` / ${Number(campaignAnalyticsData.budget_limit).toLocaleString('en-IN')}` : ''}</div>
                  </div>
                )}
                {campaignAnalyticsData.roi != null && (
                  <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>ROI (revenue / reward)</div>
                    <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#10b981' }}>{campaignAnalyticsData.roi.toFixed(2)}x</div>
                  </div>
                )}
                <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Total events</div>
                  <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{campaignAnalyticsData.total_events ?? 0}</div>
                </div>
                {campaignAnalyticsData.by_event_type && Object.keys(campaignAnalyticsData.by_event_type).length > 0 && (
                  <div style={{ padding: 12, background: '#111827', borderRadius: 8 }}>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 8 }}>By event type</div>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {Object.entries(campaignAnalyticsData.by_event_type).map(([ev, v]) => (
                        <li key={ev}>{ev}: {v.count} {v.revenue > 0 ? `(₹${v.revenue.toFixed(2)})` : ''}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Loading analytics...</div>
            )}
            <button className="btn btn-secondary" style={{ marginTop: 16 }} onClick={() => setCampaignAnalyticsId(null)}>Close</button>
          </div>
        </div>
      )}

      {campaignWizardOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }} onClick={() => !campaignSaving && setCampaignWizardOpen(false)}>
          <div style={{ background: '#1f2937', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: '0 0 8px' }}>{editingCampaignId ? 'Edit campaign' : 'New campaign'}</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 16 }}>Step {campaignWizardStep} of 5</p>

            {campaignWizardStep === 1 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Name</label>
                  <input className="pc-form-input" value={campaignForm.name} onChange={(e) => setCampaignForm((f) => ({ ...f, name: e.target.value }))} placeholder="Campaign name" />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Description</label>
                  <textarea className="pc-form-input" rows={2} value={campaignForm.description} onChange={(e) => setCampaignForm((f) => ({ ...f, description: e.target.value }))} placeholder="Optional" />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Type</label>
                  <select className="pc-form-input" value={campaignForm.campaign_type} onChange={(e) => setCampaignForm((f) => ({ ...f, campaign_type: e.target.value }))}>
                    <option value="Seasonal">Seasonal</option>
                    <option value="Tier Exclusive">Tier Exclusive</option>
                    <option value="Geographic">Geographic</option>
                    <option value="Growth Boost">Growth Boost</option>
                    <option value="Experimental">Experimental</option>
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="pc-form-group">
                    <label className="pc-form-label">Start date</label>
                    <input type="date" className="pc-form-input" value={campaignForm.start_at || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, start_at: e.target.value || '' }))} />
                  </div>
                  <div className="pc-form-group">
                    <label className="pc-form-label">End date</label>
                    <input type="date" className="pc-form-input" value={campaignForm.end_at || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, end_at: e.target.value || '' }))} />
                  </div>
                </div>
              </>
            )}

            {campaignWizardStep === 2 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Target tiers (valid: Ather, Nova, Luminar, Valiant, Echelon)</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(campaignSchema?.target_tiers || ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon']).map((t) => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={(campaignForm.target_tiers || []).includes(t)} onChange={(e) => setCampaignForm((f) => ({ ...f, target_tiers: e.target.checked ? [...(f.target_tiers || []), t] : (f.target_tiers || []).filter((x) => x !== t) }))} />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Target categories</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(campaignSchema?.target_categories || ['Dining', 'Spa', 'Events', 'Travel', 'Healthcare', 'Others']).map((cat) => (
                      <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input type="checkbox" checked={(campaignForm.target_categories || []).includes(cat)} onChange={(e) => setCampaignForm((f) => ({ ...f, target_categories: e.target.checked ? [...(f.target_categories || []), cat] : (f.target_categories || []).filter((x) => x !== cat) }))} />
                        <span>{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="pc-form-group">
                    <label className="pc-form-label">Geo: City</label>
                    <input className="pc-form-input" value={campaignForm.geo_filter?.city || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, geo_filter: { ...(f.geo_filter || {}), city: e.target.value || undefined } }))} placeholder="Optional" />
                  </div>
                  <div className="pc-form-group">
                    <label className="pc-form-label">Sector</label>
                    <input className="pc-form-input" value={campaignForm.geo_filter?.sector || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, geo_filter: { ...(f.geo_filter || {}), sector: e.target.value || undefined } }))} placeholder="Optional" />
                  </div>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">User segment</label>
                  <select className="pc-form-input" value={campaignForm.user_segment?.segment || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, user_segment: { segment: e.target.value || undefined } }))}>
                    <option value="">Any</option>
                    {(campaignSchema?.user_segments || ['new', 'dormant', 'high_value', 'low_engagement']).map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {campaignWizardStep === 3 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">IF event</label>
                  <select className="pc-form-input" value={campaignForm.rule_json?.trigger?.event || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, rule_json: { ...(f.rule_json || {}), trigger: { ...(f.rule_json?.trigger || {}), event: e.target.value } }, action: f.rule_json?.action || {} }))}>
                    <option value="">— Select —</option>
                    {(campaignSchema?.event_types || []).map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">THEN action</label>
                  <select className="pc-form-input" value={campaignForm.rule_json?.action?.type || ''} onChange={(e) => setCampaignForm((f) => ({ ...f, rule_json: { ...(f.rule_json || {}), action: { type: e.target.value, params: f.rule_json?.action?.params || {} } } }))}>
                    <option value="">— Select —</option>
                    {(campaignSchema?.action_types || []).map((ac) => (
                      <option key={ac} value={ac}>{ac.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Conditions (AND) can be added via API. Rule is saved as JSON.</p>
              </>
            )}

            {campaignWizardStep === 4 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Budget cap (₹)</label>
                  <input type="number" min={0} step={100} className="pc-form-input" value={campaignForm.budget_limit ?? ''} onChange={(e) => setCampaignForm((f) => ({ ...f, budget_limit: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))} placeholder="Leave empty for no limit" />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Priority weight (higher = preferred)</label>
                  <input type="number" min={0} className="pc-form-input" value={campaignForm.priority_weight ?? 0} onChange={(e) => setCampaignForm((f) => ({ ...f, priority_weight: Math.max(0, Number(e.target.value) || 0) }))} />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!campaignForm.auto_expiry} onChange={(e) => setCampaignForm((f) => ({ ...f, auto_expiry: e.target.checked }))} />
                    <span>Auto-expiry (respect end date)</span>
                  </label>
                </div>
              </>
            )}

            {campaignWizardStep === 5 && (
              <>
                <div style={{ padding: 12, background: '#111827', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}><strong>{campaignForm.name || 'Unnamed'}</strong> — {campaignForm.campaign_type}</div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                    Tiers: {(campaignForm.target_tiers || []).length ? campaignForm.target_tiers.join(', ') : 'All'} · Categories: {(campaignForm.target_categories || []).length ? campaignForm.target_categories.join(', ') : 'Any'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 4 }}>
                    Rule: IF {campaignForm.rule_json?.trigger?.event || '—'} THEN {campaignForm.rule_json?.action?.type || '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 4 }}>
                    Budget: {campaignForm.budget_limit != null ? `₹${Number(campaignForm.budget_limit).toLocaleString()}` : 'No limit'} · Priority: {campaignForm.priority_weight ?? 0}
                  </div>
                </div>
                {!editingCampaignId && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                    <input type="checkbox" checked={campaignForm.activateAfterSave} onChange={(e) => setCampaignForm((f) => ({ ...f, activateAfterSave: e.target.checked }))} />
                    <span>Activate campaign after save</span>
                  </label>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <div>
                {campaignWizardStep > 1 && <button className="btn btn-secondary" disabled={campaignSaving} onClick={() => setCampaignWizardStep((s) => s - 1)}>Back</button>}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {campaignWizardStep < 5 ? (
                  <button className="btn btn-primary" disabled={campaignWizardStep === 1 && !campaignForm.name.trim()} onClick={() => setCampaignWizardStep((s) => s + 1)}>Next</button>
                ) : (
                  <>
                    <button className="btn btn-secondary" disabled={campaignSaving} onClick={() => setCampaignWizardOpen(false)}>Cancel</button>
                    <button
                      className="btn btn-primary"
                      disabled={campaignSaving || !campaignForm.name.trim()}
                      onClick={async () => {
                        setCampaignSaving(true);
                        try {
                          const startAt = campaignForm.start_at ? new Date(campaignForm.start_at + 'T00:00:00Z').toISOString() : new Date().toISOString();
                          const endAt = campaignForm.end_at ? new Date(campaignForm.end_at + 'T23:59:59Z').toISOString() : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
                          const rule = campaignForm.rule_json;
                          const rulePayload = (rule?.trigger?.event || rule?.action?.type) ? { trigger: { event: rule.trigger?.event || null, conditions: rule.trigger?.conditions || [] }, action: { type: rule.action?.type || null, params: rule.action?.params || {} } } : undefined;
                          const payload = {
                            name: campaignForm.name.trim(),
                            description: campaignForm.description?.trim() || null,
                            campaign_type: campaignForm.campaign_type || null,
                            start_at: startAt,
                            end_at: endAt,
                            status: (!editingCampaignId && campaignForm.activateAfterSave) ? 'active' : (campaignForm.status || 'draft'),
                            target_tiers: campaignForm.target_tiers || [],
                            target_categories: campaignForm.target_categories || [],
                            geo_filter: campaignForm.geo_filter && (campaignForm.geo_filter.city || campaignForm.geo_filter.sector) ? campaignForm.geo_filter : {},
                            user_segment: campaignForm.user_segment && campaignForm.user_segment.segment ? campaignForm.user_segment : {},
                            rule_json: rulePayload,
                            budget_limit: campaignForm.budget_limit != null ? campaignForm.budget_limit : null,
                            priority_weight: campaignForm.priority_weight ?? 0,
                            auto_expiry: campaignForm.auto_expiry,
                          };
                          if (editingCampaignId) {
                            const r = await fetch(`${API_BASE}/api/v1/admin/campaigns/${editingCampaignId}`, { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
                            const j = await r.json();
                            if (j.success) { loadCampaigns(); setCampaignWizardOpen(false); setEditingCampaignId(null); setCampaignWizardStep(1); showNotif('Campaign updated'); }
                            else showNotif(j.message || 'Update failed', 'error');
                          } else {
                            const r = await fetch(`${API_BASE}/api/v1/admin/campaigns`, { method: 'POST', headers: headers(), body: JSON.stringify(payload) });
                            const j = await r.json();
                            if (j.success) { loadCampaigns(); setCampaignWizardOpen(false); setCampaignWizardStep(1); showNotif('Campaign created'); }
                            else showNotif(j.message || 'Create failed', 'error');
                          }
                        } catch (e) { showNotif('Network error', 'error'); }
                        setCampaignSaving(false);
                      }}
                    >
                      {campaignSaving ? 'Saving...' : editingCampaignId ? 'Update' : 'Save draft'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
