// PartnerConsole.jsx
// Drop this file in: /src/pages/PartnerConsole.jsx
// Create a CSS file alongside: /src/styles/partnerConsole.css (content included later in this doc)

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import OperatingHoursManager from '../components/OperatingHoursManager';
import EnterpriseAnalyticsDashboard from '../components/analytics/EnterpriseAnalyticsDashboard';
import MenuBuilderModal from '../components/MenuBuilderModal';
import '../styles/partnerConsole.css';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const ENTERPRISE_CAMPAIGN_LIMIT = 10;

/** Extract lat/lng from Google Maps URL. Handles @lat,lng and ?q=lat,lng. Short links (goo.gl) need to be opened to get the full URL. */
function extractCoordsFromMapsUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const atMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (atMatch) return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
  const qMatch = url.match(/[?&]q=(-?\d+\.\d+),(-?\d+\.\d+)/);
  if (qMatch) return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
  return null;
}

function normalizePartnerTier(tierValue) {
  return String(tierValue || 'bronze').trim().toLowerCase();
}

function createDefaultEnterpriseCampaignForm() {
  return {
    name: '',
    description: '',
    campaign_type: 'Growth Boost',
    start_at: '',
    end_at: '',
    status: 'draft',
    target_tiers: [],
    target_categories: [],
    geo_filter: {},
    user_segment: {},
    rule_json: {
      trigger: { event: '', conditions: [] },
      action: { type: '', params: {} },
    },
    budget_limit: null,
    priority_weight: 0,
    auto_expiry: false,
    activateAfterSave: false,
  };
}

/* ------------------ Small presentational components ------------------ */
function Header({ partnerName, onLogout }) {
  return (
    <header className="pc-header">
      <div className="pc-header-content">
        <div className="pc-logo">
          <div className="pc-logo-icon">Z</div>
          <span>EZNet Event Partner Console</span>
        </div>
        <div className="pc-header-actions">
          <span id="partnerName">{partnerName || 'Event Venue Name'}</span>
          <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ active, onNavigate }) {
  const nav = [
    ['dashboard', 'Dashboard'],
    ['profile', 'Profile'],
    ['hours', 'Operating Hours'],
    ['menu', 'Menu Items'],
    ['orders', 'Bookings'],
    ['analytics', 'Analytics'],
    ['offers', 'Deals'],
    ['campaigns', 'Campaigns'],
    ['guests', 'Guests'],
    ['tiers', 'Partner Tier'],
    ['messages', 'Messages'],
    ['staff', 'Staff Rewards'],
    ['nfc', 'NFC Pucks'],
    ['scanner', 'QR Scanner']
  ];

  return (
    <nav className="pc-sidebar">
      {nav.map(([id, label]) => (
        <div
          key={id}
          className={`pc-nav-item ${active === id ? 'active' : ''}`}
          onClick={() => onNavigate(id)}
        >
          <span>{label}</span>
        </div>
      ))}
    </nav>
  );
}

function Modal({ id, title, children, show, onClose, width = 700 }) {
  return (
    <div id={id} className={`pc-modal ${show ? 'show' : ''}`}>
      <div className="pc-modal-content" style={{ maxWidth: width }}>
        <div className="pc-modal-header">
          <h2 className="pc-modal-title">{title}</h2>
          <button className="pc-modal-close" onClick={onClose}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------ Main page ------------------ */
export default function PartnerConsole() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [partner, setPartner] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('partnerToken'));

  // Data stores
  const [dashboardData, setDashboardData] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [bookings, setBookings] = useState([]); // New: Bookings with QR codes
  const [offers, setOffers] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [guests, setGuests] = useState([]);
  const [guestProfile, setGuestProfile] = useState(null);
  const [showGuestModal, setShowGuestModal] = useState(false);
  const [guestNoteText, setGuestNoteText] = useState('');
  const [addingNote, setAddingNote] = useState(false);
  const [conversations, setConversations] = useState([]);
  const [selectedConvId, setSelectedConvId] = useState(null);
  const [convMessages, setConvMessages] = useState([]);
  const [convMessageInput, setConvMessageInput] = useState('');
  const [sendingConvMessage, setSendingConvMessage] = useState(false);
  const [deletingMsgId, setDeletingMsgId] = useState(null);
  const messageInputRef = useRef(null);
  const [passRedeemCode, setPassRedeemCode] = useState('');
  const [passRedeemResult, setPassRedeemResult] = useState(null);
  const [redeemingPass, setRedeemingPass] = useState(false);
  const [analytics, setAnalytics] = useState(null);
  const [scannerResult, setScannerResult] = useState(null);
  const [staffList, setStaffList] = useState([]);
  const [staffCheckIns, setStaffCheckIns] = useState([]);
  const [tierCardToken, setTierCardToken] = useState('');
  const [tierCardResult, setTierCardResult] = useState(null);
  const [verifyingTierCard, setVerifyingTierCard] = useState(false);
  const [staffAddEmail, setStaffAddEmail] = useState('');
  const [staffCheckInUserId, setStaffCheckInUserId] = useState('');
  const [staffCheckInEzt, setStaffCheckInEzt] = useState('10');
  const [addingStaff, setAddingStaff] = useState(false);
  const [recordingCheckIn, setRecordingCheckIn] = useState(false);

  // NFC Pucks
  const [nfcPucks, setNfcPucks] = useState([]);
  const [showNfcModal, setShowNfcModal] = useState(false);
  const [nfcForm, setNfcForm] = useState({ label: '', location_hint: '' });
  const [nfcEditId, setNfcEditId] = useState(null);
  const [nfcAnalytics, setNfcAnalytics] = useState([]);
  const [verifyingLocation, setVerifyingLocation] = useState(false);

  // Modals
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [redemptionForm, setRedemptionForm] = useState({
    total_bill_amount: '',
    ezt_co_pay_amount: '',
    net_amount_from_user: '',
    redemption_notes: ''
  });
  const [calculationPreview, setCalculationPreview] = useState(null);
  const [calculationLoading, setCalculationLoading] = useState(false);
  const [overrideCalculation, setOverrideCalculation] = useState(false);
  const [walletInfo, setWalletInfo] = useState({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
  const [offerEditId, setOfferEditId] = useState(null);
  const [menuEditId, setMenuEditId] = useState(null);
  const [showCampaignModal, setShowCampaignModal] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ title: '', body: '', segment_filter: null });
  const [campaignEditId, setCampaignEditId] = useState(null);
  const [sendingCampaignId, setSendingCampaignId] = useState(null);
  const [campaignWorkflowType, setCampaignWorkflowType] = useState('legacy');
  const [campaignAccessLoading, setCampaignAccessLoading] = useState(false);
  const [campaignTier, setCampaignTier] = useState('bronze');
  const [enterpriseCampaignSchema, setEnterpriseCampaignSchema] = useState(null);
  const [enterpriseCampaigns, setEnterpriseCampaigns] = useState([]);
  const [enterpriseCampaignTotal, setEnterpriseCampaignTotal] = useState(0);
  const [enterpriseCampaignLoading, setEnterpriseCampaignLoading] = useState(false);
  const [enterpriseCampaignSearch, setEnterpriseCampaignSearch] = useState('');
  const [enterpriseCampaignStatusFilter, setEnterpriseCampaignStatusFilter] = useState('');
  const [enterpriseCampaignPage, setEnterpriseCampaignPage] = useState(0);
  const [enterpriseCampaignWizardOpen, setEnterpriseCampaignWizardOpen] = useState(false);
  const [enterpriseCampaignWizardStep, setEnterpriseCampaignWizardStep] = useState(1);
  const [enterpriseCampaignEditingId, setEnterpriseCampaignEditingId] = useState(null);
  const [enterpriseCampaignForm, setEnterpriseCampaignForm] = useState(createDefaultEnterpriseCampaignForm());
  const [enterpriseCampaignSaving, setEnterpriseCampaignSaving] = useState(false);
  const [enterpriseCampaignActionId, setEnterpriseCampaignActionId] = useState('');

  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceCategories, setServiceCategories] = useState([]);
  const [coordsFromPastedLink, setCoordsFromPastedLink] = useState(null);
  const [mapsLinkInput, setMapsLinkInput] = useState('');

  // Menu photo gallery state
  const [menuPhotos, setMenuPhotos] = useState([]);
  const [menuPhotosLoading, setMenuPhotosLoading] = useState(false);
  const [menuPhotosUploading, setMenuPhotosUploading] = useState(false);
  const [menuPhotoLightbox, setMenuPhotoLightbox] = useState(null); // index or null

  // Basic auth header helper
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' });

  // Check if a JWT token is expired
  function isTokenExpired(t) {
    if (!t) return true;
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload.exp * 1000 < Date.now();
    } catch { return true; }
  }

  // Handle expired session — clear storage and redirect
  function handleSessionExpired() {
    localStorage.removeItem('partnerToken');
    localStorage.removeItem('partnerInfo');
    navigate('/partner/login');
  }

  // Fetch wrapper that auto-redirects on 401/403 (expired token)
  async function authFetch(url, options = {}) {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
      handleSessionExpired();
      // Return a mock response so callers using .json() don't crash
      return { ok: false, status: res.status, json: async () => ({ success: false, message: 'Session expired' }) };
    }
    return res;
  }

  // Focus message input when conversation is selected (only on selection change, not every keystroke)
  useEffect(() => {
    if (activeSection === 'messages' && selectedConvId && messageInputRef.current) {
      const id = setTimeout(() => messageInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [activeSection, selectedConvId]);

  useEffect(() => {
    // Check auth
    const storedToken = localStorage.getItem('partnerToken');
    const partnerInfo = localStorage.getItem('partnerInfo');

    if (!storedToken || isTokenExpired(storedToken)) {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerInfo');
      navigate('/partner/login');
      return;
    }

    setToken(storedToken);

    if (partnerInfo) {
      try {
        setPartner(JSON.parse(partnerInfo));
      } catch (e) {
        console.error('Error parsing partnerInfo:', e);
      }
    }
    // Always fetch full partner from server (includes address, latitude, longitude, geo_verified for map)
    loadPartnerData();

    // initial loads
    loadServiceTypes();
    loadServiceCategories();
  }, [navigate]);

  useEffect(() => {
    if (partner && partner.id) {
      setCampaignTier(normalizePartnerTier(partner.partner_tier));
      loadDashboard();
      loadMenuItems();
      loadOffers();
      loadOrders();
      loadBookings();
      loadAnalytics();
    }
  }, [partner]);

  async function loadPartnerData() {
    try {
      // If token present, API should return partner associated
      const res = await authFetch(`${API_BASE}/api/v1/partners/me`, { headers: headers() });
      const json = await res.json();
      if (json.success) {
        setPartner(json.data);
        localStorage.setItem('partnerInfo', JSON.stringify(json.data));
      } else {
        console.warn('Could not load partner me', json);
      }
    } catch (err) {
      console.error('Error loading partner me', err);
    }
  }

  async function verifyLocation() {
    if (!partner?.id) return;
    setVerifyingLocation(true);
    try {
      const res = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/verify-location`, { method: 'POST', headers: headers() });
      const json = await res.json();
      if (json.success) {
        setPartner(json.data);
        localStorage.setItem('partnerInfo', JSON.stringify(json.data));
        showNotification('Location verified. Map updated.');
      } else {
        const msg = json.message || json.error || 'Verify failed';
        const isApiKeyMsg = /GOOGLE_GEOCODING_API_KEY|server|API key/.test(msg);
        showNotification(isApiKeyMsg
          ? 'Exact pin unavailable: add GOOGLE_GEOCODING_API_KEY to backend/.env. Use "Open in Google Maps" below for directions by address.'
          : msg);
      }
    } catch (err) {
      console.error('Verify location error', err);
      showNotification('Could not verify location');
    } finally {
      setVerifyingLocation(false);
    }
  }

  async function loadServiceTypes() {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/service-types`);
      const j = await r.json();
      if (j.success) setServiceTypes(j.service_types || []);
    } catch (e) { console.warn('service types error', e); }
  }

  async function loadServiceCategories() {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/service-categories`);
      const j = await r.json();
      if (j.success) setServiceCategories(j.data || []);
    } catch (e) { console.warn('service categories error', e); }
  }

  async function loadDashboard() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/dashboard`, { headers: headers() });
      const j = await r.json();
      if (j.success) setDashboardData(j.data);
    } catch (e) { console.error(e); }
  }

  async function loadMenuItems() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/menu`, { headers: headers() });
      const j = await r.json();
      if (j.success) setMenuItems(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadMenuPhotos() {
    if (!partner) return;
    setMenuPhotosLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/menu-images`, { headers: headers() });
      const j = await r.json();
      if (j.success) setMenuPhotos(j.data?.menu_images || []);
    } catch (e) { console.error(e); }
    finally { setMenuPhotosLoading(false); }
  }

  async function uploadMenuPhotos(files) {
    if (!partner || !files.length) return;
    setMenuPhotosUploading(true);
    const formData = new FormData();
    Array.from(files).forEach(f => formData.append('menuImages', f));
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/menu-images`, {
        method: 'POST',
        headers: { Authorization: token ? `Bearer ${token}` : '' },
        body: formData,
      });
      const j = await r.json();
      if (j.success) { setMenuPhotos(j.data?.images || []); }
      else alert('Upload failed: ' + (j.message || 'unknown error'));
    } catch (e) { console.error(e); alert('Upload failed'); }
    finally { setMenuPhotosUploading(false); }
  }

  async function deleteMenuPhoto(index) {
    if (!partner) return;
    if (!window.confirm('Remove this photo?')) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/menu-images/${index}`, {
        method: 'DELETE', headers: headers()
      });
      const j = await r.json();
      if (j.success) setMenuPhotos(j.data?.images || []);
    } catch (e) { console.error(e); }
  }

  async function loadOrders() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/orders`, { headers: headers() });
      const j = await r.json();
      if (j.success) setOrders(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadBookings() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/bookings`, { headers: headers() });
      const j = await r.json();
      if (j.success) setBookings(j.data?.bookings || []);
    } catch (e) { console.error(e); }
  }

  async function loadOffers() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/offers`, { headers: headers() });
      const j = await r.json();
      if (j.success) setOffers(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadCampaigns() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/campaigns`, { headers: headers() });
      const j = await r.json();
      if (j.success) setCampaigns(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadEnterpriseCampaigns({
    page = enterpriseCampaignPage,
    search = enterpriseCampaignSearch,
    status = enterpriseCampaignStatusFilter,
  } = {}) {
    if (!partner) return;
    setEnterpriseCampaignLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('limit', String(ENTERPRISE_CAMPAIGN_LIMIT));
      params.set('offset', String(Math.max(0, page) * ENTERPRISE_CAMPAIGN_LIMIT));
      if ((search || '').trim()) params.set('search', search.trim());
      if (status) params.set('status', status);

      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns?${params.toString()}`, { headers: headers() });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setEnterpriseCampaigns(j.data?.campaigns || []);
        setEnterpriseCampaignTotal(j.data?.total || 0);
        if (j.data?.tier) setCampaignTier(normalizePartnerTier(j.data.tier));
      } else {
        setEnterpriseCampaigns([]);
        setEnterpriseCampaignTotal(0);
        if (r.status !== 403) {
          showNotification(j.message || j.error || 'Failed to load campaigns', 'error');
        }
      }
    } catch (e) {
      console.error(e);
      setEnterpriseCampaigns([]);
      setEnterpriseCampaignTotal(0);
      showNotification('Failed to load campaigns', 'error');
    } finally {
      setEnterpriseCampaignLoading(false);
    }
  }

  async function loadCampaignHub() {
    if (!partner) return;
    setCampaignAccessLoading(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns/schema`, { headers: headers() });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success && j.data) {
        setCampaignWorkflowType('enterprise');
        setCampaignTier(normalizePartnerTier(j.data.tier || partner?.partner_tier));
        setEnterpriseCampaignSchema(j.data);
        setEnterpriseCampaignPage(0);
        await loadEnterpriseCampaigns({ page: 0, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
      } else {
        setCampaignWorkflowType('legacy');
        setEnterpriseCampaignSchema(null);
        setEnterpriseCampaigns([]);
        setEnterpriseCampaignTotal(0);
        await loadCampaigns();
      }
    } catch (e) {
      console.error(e);
      setCampaignWorkflowType('legacy');
      setEnterpriseCampaignSchema(null);
      setEnterpriseCampaigns([]);
      setEnterpriseCampaignTotal(0);
      await loadCampaigns();
    } finally {
      setCampaignAccessLoading(false);
    }
  }

  async function refreshCampaignSection() {
    if (campaignWorkflowType === 'enterprise') {
      await loadEnterpriseCampaigns();
      return;
    }
    await loadCampaigns();
  }

  async function loadGuests() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/guests`, { headers: headers() });
      const j = await r.json();
      if (j.success) setGuests(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function verifyTierCard() {
    if (!tierCardToken.trim()) return;
    setVerifyingTierCard(true);
    setTierCardResult(null);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partner/verify-tier-card`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ token: tierCardToken.trim() })
      });
      const j = await r.json();
      if (j.success) {
        setTierCardResult({ success: true, data: j.data });
      } else {
        setTierCardResult({ success: false, message: j.message || 'Verification failed' });
      }
    } catch (e) {
      setTierCardResult({ success: false, message: 'Network error' });
    } finally {
      setVerifyingTierCard(false);
    }
  }

  async function openGuestProfile(userId) {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/guests/${userId}`, { headers: headers() });
      const j = await r.json();
      if (j.success) { setGuestProfile(j.data); setGuestNoteText(''); setShowGuestModal(true); }
      else showNotification(j.message || 'Failed to load guest', 'error');
    } catch (e) { showNotification('Network error', 'error'); }
  }

  async function addGuestNoteSubmit(e) {
    e.preventDefault();
    if (!partner || !guestProfile || !guestNoteText.trim()) return;
    setAddingNote(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/guests/${guestProfile.user_id}/notes`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ note: guestNoteText.trim() }),
      });
      const j = await r.json();
      if (j.success) {
        setGuestNoteText('');
        openGuestProfile(guestProfile.user_id);
      } else showNotification(j.message || 'Failed to add note', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
    finally { setAddingNote(false); }
  }

  async function loadStaff() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/staff`, { headers: headers() });
      const j = await r.json();
      if (j.success) setStaffList(j.data || []);
    } catch (e) { console.error(e); }
  }
  async function loadStaffCheckIns() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/staff/check-ins?limit=30`, { headers: headers() });
      const j = await r.json();
      if (j.success) setStaffCheckIns(j.data || []);
    } catch (e) { console.error(e); }
  }
  async function addStaff(e) {
    e.preventDefault();
    if (!partner || !staffAddEmail.trim()) return;
    setAddingStaff(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/staff`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ email: staffAddEmail.trim() }),
      });
      const j = await r.json();
      if (j.success) { setStaffAddEmail(''); loadStaff(); showNotification('Staff added'); }
      else showNotification(j.message ?? j.error ?? 'Failed to add staff', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
    finally { setAddingStaff(false); }
  }
  async function removeStaff(userId) {
    if (!partner || !window.confirm('Remove this staff member?')) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/staff/${userId}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) { loadStaff(); showNotification('Staff removed'); }
      else showNotification(j.message ?? j.error ?? 'Failed', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
  }
  async function recordStaffCheckIn(e) {
    e.preventDefault();
    if (!partner || !staffCheckInUserId) return;
    setRecordingCheckIn(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/staff/check-in`, {
        method: 'POST', headers: headers(),
        body: JSON.stringify({ user_id: staffCheckInUserId, ezt_earned: parseFloat(staffCheckInEzt) || 10 }),
      });
      const j = await r.json();
      if (j.success) { setStaffCheckInUserId(''); loadStaffCheckIns(); showNotification(`Check-in recorded. ${j.data?.ezt_earned ?? 10} EZT credited.`); }
      else showNotification(j.message ?? j.error ?? 'Failed to record check-in', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
    finally { setRecordingCheckIn(false); }
  }

  // NFC Puck functions
  async function loadNfcPucks() {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/nfc/pucks`, { headers: headers() });
      const j = await r.json();
      if (j.success) setNfcPucks(j.data || []);
    } catch (e) { console.error(e); }
  }
  async function loadNfcAnalytics() {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/nfc/pucks/analytics?days=30`, { headers: headers() });
      const j = await r.json();
      if (j.success) setNfcAnalytics(j.data || []);
    } catch (e) { console.error(e); }
  }
  function openAddNfcPuck() {
    setNfcEditId(null);
    setNfcForm({ label: '', location_hint: '' });
    setShowNfcModal(true);
  }
  function openEditNfcPuck(p) {
    setNfcEditId(p.id);
    setNfcForm({ label: p.label || '', location_hint: p.location_hint || '' });
    setShowNfcModal(true);
  }
  async function saveNfcPuck(e) {
    e.preventDefault();
    try {
      const url = nfcEditId ? `${API_BASE}/api/v1/nfc/pucks/${nfcEditId}` : `${API_BASE}/api/v1/nfc/pucks`;
      const r = await authFetch(url, {
        method: nfcEditId ? 'PUT' : 'POST', headers: headers(),
        body: JSON.stringify(nfcForm),
      });
      const j = await r.json();
      if (j.success) { setShowNfcModal(false); loadNfcPucks(); showNotification(nfcEditId ? 'Puck updated' : 'Puck registered'); }
      else showNotification(j.message || 'Failed', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
  }
  async function deleteNfcPuck(id) {
    if (!window.confirm('Delete this NFC puck?')) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/nfc/pucks/${id}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) { loadNfcPucks(); showNotification('Puck deleted'); }
      else showNotification(j.message || 'Delete failed', 'error');
    } catch (err) { showNotification('Network error', 'error'); }
  }
  async function toggleNfcPuck(puck) {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/nfc/pucks/${puck.id}`, {
        method: 'PUT', headers: headers(),
        body: JSON.stringify({ is_active: !puck.is_active }),
      });
      const j = await r.json();
      if (j.success) { loadNfcPucks(); showNotification(puck.is_active ? 'Puck deactivated' : 'Puck activated'); }
    } catch (err) { showNotification('Network error', 'error'); }
  }

  async function loadConversations() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations`, { headers: headers() });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) setConversations(j.data || []);
      else {
        setConversations([]);
        const msg = j?.message || j?.error || (r.status === 429 ? 'Too many requests; please wait.' : `Failed to load conversations (${r.status})`);
        if (!r.ok) showNotification(msg, 'error');
      }
    } catch (e) {
      console.error(e);
      setConversations([]);
      showNotification(e?.message || 'Failed to load conversations', 'error');
    }
  }

  async function selectConversation(conv) {
    setSelectedConvId(conv.id);
    setConvMessages([]);
    convMsgSignatureRef.current = '';  // Reset so first poll always renders
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations/${conv.id}/messages`, { headers: headers() });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success && j.data) {
        const list = Array.isArray(j.data?.messages) ? j.data.messages : [];
        setConvMessages(list);
      } else {
        setConvMessages([]);
        const msg = j?.message || j?.error || (r.status === 429 ? 'Too many requests; please wait.' : 'Failed to load messages');
        if (!r.ok) showNotification(msg, 'error');
      }
      // Mark messages as read
      await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations/${conv.id}/read`, {
        method: 'POST', headers: headers(),
      }).catch(() => {});
      // Refresh conversation list to update unread counts
      loadConversations();
    } catch (e) {
      setConvMessages([]);
      showNotification(e?.message || 'Failed to load messages', 'error');
    }
  }

  // Poll for new messages when a conversation is selected
  // Uses refs to compare with previous poll — only updates state when messages changed (prevents focus loss)
  const convMsgSignatureRef = useRef('');
  useEffect(() => {
    if (!selectedConvId || !partner || activeSection !== 'messages') return;
    const interval = setInterval(async () => {
      try {
        const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations/${selectedConvId}/messages`, { headers: headers() });
        const j = await r.json().catch(() => ({}));
        if (r.ok && j.success && j.data) {
          const list = Array.isArray(j.data?.messages) ? j.data.messages : [];
          // Build a lightweight signature: count + last id + statuses of last 5 msgs
          const sig = list.length + ':' +
            (list.length > 0 ? list[list.length - 1].id : '') + ':' +
            list.slice(-5).map(m => m.status || '').join(',');
          if (sig !== convMsgSignatureRef.current) {
            convMsgSignatureRef.current = sig;
            setConvMessages(list);
          }
        }
        // Mark as read on each poll
        await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations/${selectedConvId}/read`, {
          method: 'POST', headers: headers(),
        }).catch(() => {});
      } catch (_) {}
    }, 6000);
    return () => clearInterval(interval);
  }, [selectedConvId, partner, activeSection]);

  async function sendConvMessage(e) {
    e.preventDefault();
    if (!partner || !selectedConvId || !convMessageInput.trim() || sendingConvMessage) return;
    setSendingConvMessage(true);
    const text = convMessageInput.trim();
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/conversations/${selectedConvId}/messages`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ body: text }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success && j.data) {
        setConvMessages(prev => [...prev, j.data]);
        setConvMessageInput('');
      } else {
        const msg = j?.message || j?.error || (r.status === 429 ? 'Too many requests; please wait a moment.' : 'Failed to send');
        showNotification(msg, 'error');
      }
    } catch (err) {
      showNotification(err?.message || 'Failed to send', 'error');
    }
    setSendingConvMessage(false);
  }

  async function deleteConvMessage(msgId) {
    if (!partner || !selectedConvId || deletingMsgId) return;
    setDeletingMsgId(msgId);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/conversations/${selectedConvId}/messages/${msgId}`, {
        method: 'DELETE',
        headers: headers(),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setConvMessages(prev => prev.filter(m => m.id !== msgId));
        showNotification('Message deleted', 'success');
      } else {
        showNotification(j?.message || 'Cannot delete this message', 'error');
      }
    } catch (err) {
      showNotification(err?.message || 'Failed to delete', 'error');
    }
    setDeletingMsgId(null);
  }

  async function loadAnalytics() {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/analytics`, { headers: headers() });
      const j = await r.json();
      if (j.success) setAnalytics(j.data || null);
    } catch (e) { console.error(e); }
  }

  function handleNavigate(section) {
    setActiveSection(section);
    // lazy load
    if (section === 'menu') { loadMenuItems(); loadMenuPhotos(); }
    if (section === 'offers') loadOffers();
    if (section === 'campaigns') loadCampaignHub();
    if (section === 'guests') loadGuests();
    if (section === 'tiers') { /* Partner tier comes from partner object */ }
    if (section === 'messages') loadConversations();
    if (section === 'staff') { loadStaff(); loadStaffCheckIns(); }
    if (section === 'nfc') { loadNfcPucks(); loadNfcAnalytics(); }
    if (section === 'orders') {
      loadOrders();
      loadBookings(); // Also load bookings
    }
    if (section === 'analytics') loadAnalytics();
  }

  function logout() {
    if (window.confirm('Logout?')) {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerInfo');
      navigate('/partner/login');
    }
  }

  // Offer form state and handlers (kept simple; uses controlled inputs)
  const [offerForm, setOfferForm] = useState({});

  const DEFAULT_CO_PAY_PERCENT = 25;

  function openAddOffer() {
    setOfferEditId(null);
    setOfferForm({
      title: '',
      description: '',
      service_type: '',
      start_date: '',
      end_date: '',
      perk_type: 'discount',
      perk_description: '',
      co_pay_percentage: String(DEFAULT_CO_PAY_PERCENT),
      applicable_days: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
    });
    setShowOfferModal(true);
  }

  function parseCoPayFromText(text) {
    if (!text || typeof text !== 'string') return null;
    // Match "50%", "upto 50%", "co-pay 50%", "50 percent", etc.
    const m = text.match(/(?:upto?|up to|co-?pay|discount).*?(\d{1,3})\s*%|(\d{1,3})\s*%/i);
    const num = m ? parseFloat(m[1] || m[2]) : null;
    return (num != null && num >= 0 && num <= 100) ? num : null;
  }

  async function openEditOffer(offerOrId) {
    const id = typeof offerOrId === 'object' ? offerOrId?.id : offerOrId;
    const o = typeof offerOrId === 'object' ? offerOrId : offers.find(x => x.id === id);
    if (!o || !partner) return;
    setOfferEditId(id);
    const toDatetimeLocal = (v) => {
      if (!v) return '';
      if (typeof v === 'string' && v.length <= 16) return v;
      try { return new Date(v).toISOString().slice(0, 16); } catch (_) { return ''; }
    };
    const populateForm = (o2) => {
      const raw = o2?.co_pay_percentage;
      const coPay = (raw != null && raw !== '' && !Number.isNaN(Number(raw))) ? String(Number(raw)) : (parseCoPayFromText(o2?.title) ?? parseCoPayFromText(o2?.description) ?? '');
      return {
        ...o2,
        title: o2?.title ?? '',
        description: o2?.description ?? '',
        service_type: o2?.service_type ?? '',
        perk_type: o2?.perk_type ?? 'discount',
        perk_description: o2?.perk_description ?? '',
        co_pay_percentage: coPay,
        start_date: toDatetimeLocal(o2?.start_date),
        end_date: toDatetimeLocal(o2?.end_date),
        image_url: o2?.image_url ?? null,
        image_base64: undefined,
        is_trending: !!o2?.is_trending,
        featured_request_pending: !!o2?.featured_request_pending,
        request_trending: !!o2?.request_trending,
        applicable_days: Array.isArray(o2?.applicable_days) ? o2?.applicable_days : ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'],
      };
    };
    // Populate immediately from list data so co-pay shows right away
    setOfferForm(populateForm(o));
    setShowOfferModal(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/offers/${id}`, { headers: headers() });
      const j = await r.json();
      if (j.success && j.data) {
        setOfferForm(populateForm(j.data));
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function saveOffer(e) {
    e.preventDefault();
    if (!partner) return;
    if (offerForm.perk_type === 'discount') {
      const v = offerForm.co_pay_percentage;
      const n = v !== '' && v !== undefined && !Number.isNaN(Number(v)) ? Number(v) : NaN;
      if (Number.isNaN(n) || n < 0 || n > 100) {
        alert('Co-pay % is required when Perk type is Discount. Enter a value between 0 and 100.');
        return;
      }
    }
    const url = offerEditId ? `${API_BASE}/api/v1/partners/${partner.id}/offers/${offerEditId}` : `${API_BASE}/api/v1/partners/${partner.id}/offers`;
    const payload = { ...offerForm };
    if (payload.request_trending) payload.request_trending = true;
    const numericOptionals = ['co_pay_percentage', 'discount_amount', 'original_price', 'discounted_price', 'min_purchase_amount'];
    numericOptionals.forEach((k) => { if (payload[k] === '' || payload[k] === undefined) payload[k] = null; });
    try {
      const r = await authFetch(url, { method: offerEditId ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(payload) });
      const j = await r.json();
      if (j.success) { setShowOfferModal(false); loadOffers(); }
      else alert('Failed: ' + (j.message ?? j.error ?? 'unknown'));
    } catch (err) { console.error(err); }
  }

  // Menu item add/edit
  const [menuForm, setMenuForm] = useState({});

  function openAddMenu() {
    setMenuEditId(null);
    setMenuForm({ is_available: true });
    setShowMenuModal(true);
  }

  function openEditMenu(id) {
    const it = menuItems.find(m => m.id === id);
    if (!it) return;
    setMenuEditId(id);
    setMenuForm({ ...it });
    setShowMenuModal(true);
  }

  async function saveMenuItem(e) {
    e.preventDefault();
    if (!partner) return;
    const url = menuEditId ? `${API_BASE}/api/v1/partners/${partner.id}/menu/${menuEditId}` : `${API_BASE}/api/v1/partners/${partner.id}/menu`;
    try {
      const r = await authFetch(url, { method: menuEditId ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(menuForm) });
      const j = await r.json();
      if (j.success) { setShowMenuModal(false); loadMenuItems(); }
      else alert('Failed: ' + (j.message ?? j.error ?? 'unknown'));
    } catch (err) { console.error(err); }
  }

  // Simple redeem voucher flow used in scanner section
  async function validateVoucher(code) {
    try {
      const r = await authFetch(`${API_BASE}/api/v1/vouchers/${code}`, { headers: headers() });
      const j = await r.json();
      setScannerResult(j);
    } catch (e) { console.error(e); }
  }

  // Render helpers for sections (simple, keeping original structure)
  function DashboardSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Dashboard</h1>
          <div>
            <button className="btn btn-primary" onClick={loadDashboard}>Refresh</button>
          </div>
        </div>

        <div className="pc-stats-grid">
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.total_orders ?? 0}</div>
            <div className="pc-stat-label">Total Orders</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.today_orders ?? 0}</div>
            <div className="pc-stat-label">Today's Orders</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">₹{dashboardData?.total_revenue ?? 0}</div>
            <div className="pc-stat-label">Total Revenue</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.menu_items_count ?? 0}</div>
            <div className="pc-stat-label">Menu Items</div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3>Recent Orders &amp; Voucher Redemptions</h3>
          <div className="pc-table-container">
            <table className="pc-table">
              <thead>
                <tr>
                  <th>Order / Booking ID</th>
                  <th>Customer</th>
                  <th>Total bill</th>
                  <th>Fiat paid</th>
                  <th>Co-pay (EZT)</th>
                  <th>Redeemed at</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {(dashboardData?.recent_orders || []).length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 20 }}>No recent orders or redemptions</td></tr>
                ) : (
                  (dashboardData.recent_orders || []).map(o => (
                    <tr key={`${o.type || 'order'}-${o.id}`}>
                      <td style={{ fontSize: '0.85rem' }}>{o.id}</td>
                      <td>{o.customer_name || o.customer || '—'}</td>
                      <td>{o.total_bill_amount != null ? `₹${Number(o.total_bill_amount).toFixed(2)}` : (o.amount != null ? `₹${Number(o.amount).toFixed(2)}` : '—')}</td>
                      <td>{o.net_amount_from_user != null ? `₹${Number(o.net_amount_from_user).toFixed(2)}` : '—'}</td>
                      <td>{o.ezt_tokens_required != null ? `${Number(o.ezt_tokens_required)} EZT` : (o.ezt_co_pay_amount != null ? `₹${Number(o.ezt_co_pay_amount).toFixed(2)}` : '—')}</td>
                      <td>{o.redeemed_at ? new Date(o.redeemed_at).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '—'}</td>
                      <td><span className={`pc-badge pc-badge-${getStatusClass(o.status)}`}>{o.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function ProfileSection() {
    const displayCoords = coordsFromPastedLink ?? (
      partner?.latitude != null && partner?.longitude != null && !(Number(partner.latitude) === 0 && Number(partner.longitude) === 0)
        ? { lat: Number(partner.latitude), lng: Number(partner.longitude) }
        : null
    );

    function applyMapsLink() {
      const coords = extractCoordsFromMapsUrl(mapsLinkInput.trim());
      if (coords) {
        setCoordsFromPastedLink(coords);
        showNotification(`Location set to ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}. Click Save Changes to store.`);
      } else {
        showNotification('Could not find coordinates in that link. Use a full Google Maps link (e.g. Share → Copy link with the pin dropped).', 'error');
      }
    }

    async function saveProfile() {
      if (!partner) return;
      const payload = {
        name: document.getElementById('venueName')?.value,
        email: document.getElementById('venueEmail')?.value,
        phone_number: document.getElementById('venuePhone')?.value,
        gst_number: document.getElementById('venueGST')?.value,
        address: document.getElementById('venueAddress')?.value,
        partner_category_type: document.getElementById('venueType')?.value,
        description: document.getElementById('venueDescription')?.value
      };
      if (displayCoords) {
        payload.latitude = displayCoords.lat;
        payload.longitude = displayCoords.lng;
      }
      try {
        const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
        const j = await r.json();
        if (j.success) {
          setPartner(j.data);
          localStorage.setItem('partnerInfo', JSON.stringify(j.data));
          setCoordsFromPastedLink(null);
          setMapsLinkInput('');
          showNotification('Saved');
        } else {
          showNotification('Save failed: ' + (j.message ?? j.error ?? 'unknown'), 'error');
        }
      } catch (e) {
        console.error(e);
        showNotification('Save failed', 'error');
      }
    }

    return (
      <div>
        <div className="pc-content-header"><h1>Event Venue Profile</h1><button className="btn btn-primary" onClick={saveProfile}>Save Changes</button></div>
        <form id="profileForm">
          <div className="pc-form-grid">
            <div className="pc-form-group"><label>Venue Name</label><input id="venueName" className="pc-form-input" defaultValue={partner?.name || ''} /></div>
            <div className="pc-form-group"><label>Email</label><input id="venueEmail" className="pc-form-input" defaultValue={partner?.email || ''} /></div>
          </div>
          <div className="pc-form-group"><label>Phone</label><input id="venuePhone" className="pc-form-input" defaultValue={partner?.phone_number || partner?.phone || ''} /></div>
          <div className="pc-form-group"><label>GST</label><input id="venueGST" className="pc-form-input" defaultValue={partner?.gst_number || ''} /></div>
          <div className="pc-form-group"><label>Address</label><textarea id="venueAddress" className="pc-form-input" placeholder="Enter complete venue address (street, city, state, pincode)" defaultValue={partner?.address || ''} /></div>
          <div className="pc-form-group pc-map-preview">
            <label>Location &amp; map</label>
            <div className="pc-map-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
              <input
                type="url"
                className="pc-form-input"
                placeholder="Paste Google Maps link (e.g. from Share → Copy link)"
                value={mapsLinkInput}
                onChange={(e) => setMapsLinkInput(e.target.value)}
                style={{ flex: '1', minWidth: 200 }}
              />
              <button type="button" className="btn btn-secondary" onClick={applyMapsLink}>Apply</button>
            </div>
            {displayCoords ? (
              <>
                <div className="pc-map-embed">
                  <iframe
                    title="Venue location"
                    width="100%"
                    height="200"
                    style={{ border: 0, borderRadius: 8 }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${displayCoords.lng - 0.01},${displayCoords.lat - 0.01},${displayCoords.lng + 0.01},${displayCoords.lat + 0.01}&layer=mapnik&marker=${displayCoords.lat},${displayCoords.lng}`}
                  />
                </div>
                <div className="pc-map-actions" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
                  <button type="button" className="btn btn-primary" disabled={verifyingLocation} onClick={verifyLocation}>{verifyingLocation ? 'Verifying…' : 'Verify location'}</button>
                  <a className="pc-open-maps-btn" href={`https://www.google.com/maps/search/?api=1&query=${displayCoords.lat},${displayCoords.lng}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
                  {partner?.geo_verified && !coordsFromPastedLink && <span className="pc-geo-badge" title="Address verified">📍 Verified</span>}
                </div>
                <p className="pc-map-hint" style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                  {coordsFromPastedLink ? <>Coords from pasted link. Click <strong>Save Changes</strong> to store.</> : <>Wrong pin? Paste a Google Maps link above or click <strong>Verify location</strong> to re-geocode from address.</>}
                </p>
              </>
            ) : (partner?.address || partner?.formatted_address) ? (
              (() => {
                const rawAddr = (partner?.formatted_address || partner?.address || '').trim();
                const mapQuery = rawAddr ? (/\bIndia\b/i.test(rawAddr) ? rawAddr : `${rawAddr}, India`) : rawAddr;
                return (
                  <>
                    <div className="pc-map-embed">
                      <iframe title="Venue location (address)" src={`https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&z=15&output=embed`} width="100%" height="180" style={{ border: 0, borderRadius: 8 }} allowFullScreen loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
                    </div>
                    <p className="pc-map-hint">Map shows approximate location from address. Paste a <strong>Google Maps link</strong> above, or click <strong>Verify location</strong> to geocode.</p>
                    <div className="pc-map-actions">
                      <button type="button" className="btn btn-primary" disabled={verifyingLocation} onClick={verifyLocation}>{verifyingLocation ? 'Verifying…' : 'Verify location'}</button>
                      <a className="pc-open-maps-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`} target="_blank" rel="noopener noreferrer">Open in Google Maps</a>
                    </div>
                  </>
                );
              })()
            ) : (
              <>
                <p className="pc-map-hint">Enter your venue address above and click <strong>Save Changes</strong>, or paste a <strong>Google Maps link</strong> above to set the pin directly.</p>
              </>
            )}
          </div>
          <div className="pc-form-group"><label>Venue Type</label><select id="venueType" className="pc-form-input" defaultValue={partner?.partner_category_type || ''}><option value="">Select</option><option value="dining">Dining</option><option value="events">Events</option><option value="healthcare">Healthcare</option><option value="spa-and-salon">Spa & Salon</option><option value="wellness">Wellness</option><option value="travel">Travel</option><option value="others">Others</option></select></div>
          <div className="pc-form-group"><label>Description</label><textarea id="venueDescription" className="pc-form-input" defaultValue={partner?.description || ''} /></div>
        </form>
      </div>
    );
  }

  function MenuSection() {
    const photoInputRef = useRef(null);

    return (
      <div>
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="pc-content-header">
          <h1>Services & Menu</h1>
          <div><button className="btn btn-primary" onClick={openAddMenu}>+ Add New Service</button></div>
        </div>

        {/* ── Menu Photo Gallery ────────────────────────────────────────── */}
        <div className="mphoto-section">
          <div className="mphoto-header">
            <div>
              <h2 className="mphoto-title">Menu Photos</h2>
              <p className="mphoto-subtitle">Upload your physical menu pages or food photos. Customers see these when viewing your venue.</p>
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => photoInputRef.current?.click()}
              disabled={menuPhotosUploading}
            >
              {menuPhotosUploading ? 'Uploading…' : '+ Upload Photos'}
            </button>
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{ display: 'none' }}
              onChange={e => { if (e.target.files?.length) uploadMenuPhotos(e.target.files); e.target.value = ''; }}
            />
          </div>

          {menuPhotosLoading ? (
            <p className="mphoto-empty">Loading photos…</p>
          ) : menuPhotos.length === 0 ? (
            <div
              className="mphoto-dropzone"
              onClick={() => photoInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); e.currentTarget.classList.add('drag-over'); }}
              onDragLeave={e => e.currentTarget.classList.remove('drag-over')}
              onDrop={e => {
                e.preventDefault();
                e.currentTarget.classList.remove('drag-over');
                const files = e.dataTransfer.files;
                if (files?.length) uploadMenuPhotos(files);
              }}
            >
              <span className="mphoto-dropzone-icon">🖼️</span>
              <p>Drag & drop photos here, or click to browse</p>
              <p className="mphoto-dropzone-hint">JPG, PNG, WebP · up to 8MB each · upload as many pages as you need</p>
            </div>
          ) : (
            <div className="mphoto-strip">
              {menuPhotos.map((url, idx) => (
                <div key={idx} className="mphoto-thumb" onClick={() => setMenuPhotoLightbox(idx)}>
                  <img src={url} alt={`Menu ${idx + 1}`} loading="lazy" />
                  <button
                    className="mphoto-thumb-delete"
                    title="Remove"
                    onClick={e => { e.stopPropagation(); deleteMenuPhoto(idx); }}
                  >×</button>
                  <span className="mphoto-thumb-num">{idx + 1}/{menuPhotos.length}</span>
                </div>
              ))}
              {/* Add more tile */}
              <div
                className="mphoto-thumb mphoto-thumb-add"
                onClick={() => photoInputRef.current?.click()}
              >
                <span style={{ fontSize: '1.75rem' }}>+</span>
                <span style={{ fontSize: '0.72rem', marginTop: 4 }}>Add</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Lightbox ─────────────────────────────────────────────────── */}
        {menuPhotoLightbox !== null && (
          <div className="mphoto-lightbox" onClick={() => setMenuPhotoLightbox(null)}>
            <button className="mphoto-lb-close" onClick={() => setMenuPhotoLightbox(null)}>×</button>
            <button
              className="mphoto-lb-nav mphoto-lb-prev"
              onClick={e => { e.stopPropagation(); setMenuPhotoLightbox(i => (i - 1 + menuPhotos.length) % menuPhotos.length); }}
            >‹</button>
            <div className="mphoto-lb-img-wrap" onClick={e => e.stopPropagation()}>
              <img src={menuPhotos[menuPhotoLightbox]} alt={`Menu ${menuPhotoLightbox + 1}`} className="mphoto-lb-img" />
              <p className="mphoto-lb-counter">{menuPhotoLightbox + 1} / {menuPhotos.length}</p>
            </div>
            <button
              className="mphoto-lb-nav mphoto-lb-next"
              onClick={e => { e.stopPropagation(); setMenuPhotoLightbox(i => (i + 1) % menuPhotos.length); }}
            >›</button>
          </div>
        )}

        {/* ── Services Table ────────────────────────────────────────────── */}
        <div className="mphoto-section" style={{ marginTop: 24 }}>
          <h2 className="mphoto-title" style={{ marginBottom: 12 }}>Service Items</h2>
          <div className="pc-table-container">
            <table className="pc-table">
              <thead><tr><th>Service Name</th><th>Description</th><th>Price</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {menuItems.length === 0 ? (
                  <tr><td colSpan={6} style={{textAlign:'center', padding: 24, color: 'var(--muted)'}}>No items yet — click "+ Add New Service" above</td></tr>
                ) : menuItems.map(item => (
                  <tr key={item.id}>
                    <td>{item.name}</td>
                    <td style={{maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.description}</td>
                    <td>₹{item.price}</td>
                    <td>
                      {item.taxonomy_parent_name
                        ? `${item.taxonomy_parent_name} › ${item.taxonomy_name}`
                        : item.taxonomy_name || item.category || item.service_category_name || item.service_type || '—'}
                    </td>
                    <td><span className={`pc-badge pc-badge-${item.is_available ? 'success' : 'error'}`}>{item.is_available ? 'Available' : 'Unavailable'}</span></td>
                    <td><div className="pc-actions"><button className="btn btn-sm btn-secondary" onClick={() => openEditMenu(item.id)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteMenu(item.id)}>Delete</button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  async function deleteMenu(id) {
    if (!window.confirm('Delete item?')) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/menu/${id}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) { loadMenuItems(); showNotification('Deleted'); } else showNotification('Delete failed');
    } catch (e) { console.error(e); }
  }

  function OffersSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Deals</h1><div><button className="btn btn-primary" onClick={openAddOffer}>Create New Deal</button></div></div>
        <div className="pc-table-container"><table className="pc-table"><thead><tr><th>Deal Details</th><th>Type</th><th>Validity</th><th>Redemptions</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {offers.length === 0 ? (
            <tr><td colSpan={6} style={{textAlign:'center', padding:24}}>No deals</td></tr>
          ) : offers.map(of => (
            <tr key={of.id}><td>{of.title}</td><td>{(of.offer_type||'').toUpperCase()}</td><td>{new Date(of.start_date).toLocaleDateString()} - {new Date(of.end_date).toLocaleDateString()}</td><td>{of.max_redemptions||'Unlimited'}</td><td><span className={`pc-badge pc-badge-${(new Date(of.end_date) > new Date()) ? 'success':'error'}`}>{(new Date(of.end_date) > new Date()) ? 'ACTIVE':'INACTIVE'}</span></td><td><div className="pc-actions"><button className="btn btn-sm btn-secondary" onClick={() => openEditOffer(of)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteOffer(of.id)}>Delete</button></div></td></tr>
          ))}
        </tbody></table></div>
      </div>
    );
  }

  async function deleteOffer(id) {
    if (!window.confirm('Delete deal?')) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/offers/${id}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) loadOffers(); else showNotification('Delete failed');
    } catch (e) { console.error(e); }
  }

  function openAddCampaign() {
    setCampaignEditId(null);
    setCampaignForm({ title: '', body: '', segment_filter: null });
    setShowCampaignModal(true);
  }

  function openEditCampaign(c) {
    setCampaignEditId(c.id);
    setCampaignForm({
      title: c.title || '',
      body: c.body || '',
      segment_filter: c.segment_filter ? JSON.stringify(c.segment_filter, null, 2) : '',
    });
    setShowCampaignModal(true);
  }

  function parseSegmentFilterInput(rawValue) {
    const text = (rawValue ?? '').trim();
    if (!text) return { ok: true, value: null };
    const lowered = text.toLowerCase();
    // Accept common placeholders as "blank" to reduce form friction.
    if (['nil', 'null', 'none', 'na', 'n/a'].includes(lowered)) {
      return { ok: true, value: null };
    }
    try {
      const parsed = JSON.parse(text);
      if (parsed === null) return { ok: true, value: null };
      if (typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, value: null };
      }
      return { ok: true, value: parsed };
    } catch (_) {
      return { ok: false, value: null };
    }
  }

  async function saveCampaign(e) {
    e.preventDefault();
    if (!partner) return;
    const payload = { title: campaignForm.title.trim(), body: campaignForm.body.trim() };
    const parsedFilter = parseSegmentFilterInput(campaignForm.segment_filter);
    if (!parsedFilter.ok) {
      showNotification('Could not read the audience rule. Leave it blank, or use the example format.', 'error');
      return;
    }
    payload.segment_filter = parsedFilter.value;
    try {
      const url = campaignEditId
        ? `${API_BASE}/api/v1/partners/${partner.id}/campaigns/${campaignEditId}`
        : `${API_BASE}/api/v1/partners/${partner.id}/campaigns`;
      const r = await authFetch(url, {
        method: campaignEditId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const j = await r.json();
      if (j.success) {
        setShowCampaignModal(false);
        loadCampaigns();
        showNotification(campaignEditId ? 'Campaign updated' : 'Campaign created');
      } else {
        showNotification(j.message || 'Failed', 'error');
      }
    } catch (err) {
      showNotification('Network error', 'error');
    }
  }

  async function sendCampaignClick(id) {
    if (!partner) return;
    if (!window.confirm('Send this campaign now? (Notifications will be sent to guests.)')) return;
    setSendingCampaignId(id);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/campaigns/${id}/send`, {
        method: 'POST',
        headers: headers(),
      });
      const j = await r.json();
      if (j.success) {
        loadCampaigns();
        showNotification('Campaign sent');
      } else {
        showNotification(j.message || 'Send failed', 'error');
      }
    } catch (err) {
      showNotification('Network error', 'error');
    } finally {
      setSendingCampaignId(null);
    }
  }

  async function openEnterpriseCampaignWizard(campaignId = null) {
    if (!partner) return;
    const tier = normalizePartnerTier(campaignTier || partner?.partner_tier);
    if (tier === 'bronze') {
      showNotification('Campaign creation is available for Gold tier partners.', 'error');
      return;
    }

    setEnterpriseCampaignEditingId(campaignId);
    setEnterpriseCampaignWizardStep(1);
    setEnterpriseCampaignForm(createDefaultEnterpriseCampaignForm());

    if (!campaignId) {
      setEnterpriseCampaignWizardOpen(true);
      return;
    }

    setEnterpriseCampaignSaving(true);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns/${campaignId}`, { headers: headers() });
      const j = await r.json().catch(() => ({}));
      if (!(r.ok && j.success && j.data?.campaign)) {
        showNotification(j.message || j.error || 'Failed to load campaign', 'error');
        return;
      }
      const c = j.data.campaign;
      const rule = c.rules?.[0]?.rule_json || c.growth_rule || {};
      const trigger = rule.trigger || {};
      const action = rule.action || {};
      setEnterpriseCampaignForm({
        name: c.name || '',
        description: c.description || '',
        campaign_type: c.campaign_type || 'Growth Boost',
        start_at: c.start_at ? c.start_at.slice(0, 10) : (c.start_date ? String(c.start_date).slice(0, 10) : ''),
        end_at: c.end_at ? c.end_at.slice(0, 10) : (c.end_date ? String(c.end_date).slice(0, 10) : ''),
        status: c.status || 'draft',
        target_tiers: Array.isArray(c.target_tiers) ? c.target_tiers : [],
        target_categories: Array.isArray(c.target_categories) ? c.target_categories : [],
        geo_filter: c.geo_filter && typeof c.geo_filter === 'object' ? c.geo_filter : {},
        user_segment: c.user_segment && typeof c.user_segment === 'object' ? c.user_segment : {},
        rule_json: {
          trigger: {
            event: trigger.event || '',
            conditions: Array.isArray(trigger.conditions) ? trigger.conditions : [],
          },
          action: {
            type: action.type || '',
            params: action.params || {},
          },
        },
        budget_limit: c.budget_limit != null ? Number(c.budget_limit) : null,
        priority_weight: c.priority_weight ?? 0,
        auto_expiry: !!c.auto_expiry,
        activateAfterSave: false,
      });
      setEnterpriseCampaignWizardOpen(true);
    } catch (err) {
      showNotification('Failed to load campaign', 'error');
    } finally {
      setEnterpriseCampaignSaving(false);
    }
  }

  async function saveEnterpriseCampaign() {
    if (!partner) return;
    const tier = normalizePartnerTier(campaignTier || partner?.partner_tier);
    if (tier === 'bronze') {
      showNotification('Bronze partners do not have campaign creation access.', 'error');
      return;
    }
    if (!enterpriseCampaignForm.name?.trim()) {
      showNotification('Campaign name is required', 'error');
      return;
    }

    setEnterpriseCampaignSaving(true);
    try {
      const startAt = enterpriseCampaignForm.start_at
        ? new Date(`${enterpriseCampaignForm.start_at}T00:00:00Z`).toISOString()
        : new Date().toISOString();
      const endAt = enterpriseCampaignForm.end_at
        ? new Date(`${enterpriseCampaignForm.end_at}T23:59:59Z`).toISOString()
        : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      if (new Date(endAt).getTime() < new Date(startAt).getTime()) {
        showNotification('End date cannot be earlier than start date', 'error');
        return;
      }

      const rule = enterpriseCampaignForm.rule_json || {};
      const hasRule =
        !!rule?.trigger?.event ||
        !!rule?.action?.type ||
        (Array.isArray(rule?.trigger?.conditions) && rule.trigger.conditions.length > 0);
      const rulePayload = hasRule
        ? {
            trigger: {
              event: rule.trigger?.event || null,
              conditions: Array.isArray(rule.trigger?.conditions) ? rule.trigger.conditions : [],
            },
            action: {
              type: rule.action?.type || null,
              params: rule.action?.params || {},
            },
          }
        : undefined;

      const payload = {
        name: enterpriseCampaignForm.name.trim(),
        description: enterpriseCampaignForm.description?.trim() || null,
        campaign_type: enterpriseCampaignForm.campaign_type || null,
        start_at: startAt,
        end_at: endAt,
        status: tier === 'gold'
          ? ((!enterpriseCampaignEditingId && enterpriseCampaignForm.activateAfterSave) ? 'active' : (enterpriseCampaignForm.status || 'draft'))
          : 'draft',
        target_tiers: enterpriseCampaignForm.target_tiers || [],
        target_categories: enterpriseCampaignForm.target_categories || [],
        geo_filter: enterpriseCampaignForm.geo_filter && (enterpriseCampaignForm.geo_filter.city || enterpriseCampaignForm.geo_filter.sector)
          ? enterpriseCampaignForm.geo_filter
          : {},
        user_segment: enterpriseCampaignForm.user_segment && typeof enterpriseCampaignForm.user_segment === 'object'
          ? enterpriseCampaignForm.user_segment
          : {},
        rule_json: rulePayload,
        budget_limit: enterpriseCampaignForm.budget_limit != null ? enterpriseCampaignForm.budget_limit : null,
        priority_weight: enterpriseCampaignForm.priority_weight ?? 0,
        auto_expiry: !!enterpriseCampaignForm.auto_expiry,
      };

      const url = enterpriseCampaignEditingId
        ? `${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns/${enterpriseCampaignEditingId}`
        : `${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns`;
      const r = await authFetch(url, {
        method: enterpriseCampaignEditingId ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload),
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        setEnterpriseCampaignWizardOpen(false);
        setEnterpriseCampaignEditingId(null);
        setEnterpriseCampaignWizardStep(1);
        setEnterpriseCampaignForm(createDefaultEnterpriseCampaignForm());
        await loadEnterpriseCampaigns({ page: enterpriseCampaignPage, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
        showNotification(j.message || (tier === 'silver'
          ? 'Campaign request submitted for admin review'
          : enterpriseCampaignEditingId ? 'Campaign updated' : 'Campaign created'));
      } else {
        showNotification(j.message || j.error || 'Failed to save campaign', 'error');
      }
    } catch (err) {
      showNotification('Failed to save campaign', 'error');
    } finally {
      setEnterpriseCampaignSaving(false);
    }
  }

  async function changeEnterpriseCampaignStatus(campaignId, action) {
    if (!partner || !campaignId || !action) return;
    const tier = normalizePartnerTier(campaignTier || partner?.partner_tier);
    if (tier !== 'gold') {
      showNotification('Only Gold partners can activate or pause campaigns directly.', 'error');
      return;
    }
    setEnterpriseCampaignActionId(`${action}:${campaignId}`);
    try {
      const r = await authFetch(
        `${API_BASE}/api/v1/partners/${partner.id}/enterprise-campaigns/${campaignId}/${action}`,
        { method: 'POST', headers: headers() }
      );
      const j = await r.json().catch(() => ({}));
      if (r.ok && j.success) {
        await loadEnterpriseCampaigns({ page: enterpriseCampaignPage, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
        showNotification(action === 'pause' ? 'Campaign paused' : 'Campaign activated');
      } else {
        showNotification(j.message || j.error || 'Status update failed', 'error');
      }
    } catch (err) {
      showNotification('Status update failed', 'error');
    } finally {
      setEnterpriseCampaignActionId('');
    }
  }

  function LegacyCampaignsSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Notification Campaigns</h1>
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button className="btn btn-primary" onClick={refreshCampaignSection}>Refresh</button>
            <button className="btn btn-primary" onClick={openAddCampaign}>New campaign</button>
          </div>
        </div>
        <p style={{ color: '#666', marginBottom: 16 }}>Send push-style messages to your guests. Create a draft, then send when ready.</p>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr><th>Title</th><th>Status</th><th>Created</th><th>Sent at</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {campaigns.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24 }}>No campaigns yet. Create one to notify your guests.</td></tr>
              ) : campaigns.map(c => (
                <tr key={c.id}>
                  <td>{c.title}</td>
                  <td><span className={`pc-badge pc-badge-${c.status === 'sent' ? 'success' : c.status === 'cancelled' ? 'error' : 'warning'}`}>{c.status}</span></td>
                  <td>{c.created_at ? new Date(c.created_at).toLocaleString() : '—'}</td>
                  <td>{c.sent_at ? new Date(c.sent_at).toLocaleString() : '—'}</td>
                  <td>
                    <div className="pc-actions">
                      {c.status !== 'sent' && <button className="btn btn-sm btn-secondary" onClick={() => openEditCampaign(c)}>Edit</button>}
                      {c.status !== 'sent' && <button className="btn btn-sm btn-primary" onClick={() => sendCampaignClick(c.id)} disabled={sendingCampaignId === c.id}>{sendingCampaignId === c.id ? 'Sending…' : 'Send now'}</button>}
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

  function EnterpriseCampaignsSection() {
    const tier = normalizePartnerTier(campaignTier || partner?.partner_tier);
    const isBronze = tier === 'bronze';
    const isSilver = tier === 'silver';
    const isGold = tier === 'gold';
    const startIdx = enterpriseCampaignTotal === 0 ? 0 : enterpriseCampaignPage * ENTERPRISE_CAMPAIGN_LIMIT + 1;
    const endIdx = Math.min((enterpriseCampaignPage + 1) * ENTERPRISE_CAMPAIGN_LIMIT, enterpriseCampaignTotal);

    const statusBadgeClass = (status) => {
      if (status === 'active') return 'success';
      if (status === 'paused' || status === 'scheduled') return 'warning';
      if (status === 'expired') return 'error';
      return 'default';
    };

    return (
      <div>
        <div className="pc-content-header">
          <h1>{isSilver ? 'Campaign Requests' : 'Campaign Manager'}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              className="pc-form-input"
              style={{ width: 220 }}
              placeholder="Search campaigns..."
              value={enterpriseCampaignSearch}
              onChange={(e) => setEnterpriseCampaignSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setEnterpriseCampaignPage(0);
                  loadEnterpriseCampaigns({ page: 0, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
                }
              }}
            />
            <select
              className="pc-form-input"
              style={{ width: 140 }}
              value={enterpriseCampaignStatusFilter}
              onChange={(e) => {
                const value = e.target.value;
                setEnterpriseCampaignStatusFilter(value);
                setEnterpriseCampaignPage(0);
                loadEnterpriseCampaigns({ page: 0, search: enterpriseCampaignSearch, status: value });
              }}
            >
              <option value="">All status</option>
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="expired">Expired</option>
            </select>
            <button className="btn btn-secondary" onClick={() => { setEnterpriseCampaignPage(0); loadEnterpriseCampaigns({ page: 0, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter }); }}>Search</button>
            <button className="btn btn-primary" onClick={() => loadCampaignHub()}>Refresh</button>
            {!isBronze && (
              <button className="btn btn-primary" onClick={() => openEnterpriseCampaignWizard(null)}>
                {isSilver ? 'New request' : 'New campaign'}
              </button>
            )}
          </div>
        </div>

        {isBronze ? (
          <div className="pc-table-container">
            <div style={{ padding: 24 }}>
              <h3 style={{ marginTop: 0, marginBottom: 8 }}>Campaign creation is not available for Bronze partners</h3>
              <p style={{ margin: 0, color: '#666' }}>
                Upgrade to Gold tier for full campaign workflow access. Silver partners can submit requests to Admin.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p style={{ color: '#666', marginBottom: 16 }}>
              {isSilver
                ? 'Silver partners can draft campaign requests. Admin reviews and activates approved campaigns.'
                : 'Gold partners can create, activate, pause, and manage campaigns directly.'}
            </p>
            <div className="pc-table-container">
              {enterpriseCampaignLoading ? (
                <div style={{ padding: 36, textAlign: 'center', color: '#666' }}>Loading campaigns...</div>
              ) : (
                <>
                  <table className="pc-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Type</th>
                        <th>Status</th>
                        <th>Start</th>
                        <th>End</th>
                        <th>Target tiers</th>
                        {isSilver && <th>Admin review</th>}
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {enterpriseCampaigns.length === 0 ? (
                        <tr>
                          <td colSpan={isSilver ? 8 : 7} style={{ textAlign: 'center', padding: 28 }}>
                            {isSilver ? 'No campaign requests yet.' : 'No campaigns yet.'}
                          </td>
                        </tr>
                      ) : enterpriseCampaigns.map((c) => {
                        const status = c.status || (c.is_active ? 'active' : 'draft');
                        const requestStatus = c.user_segment?.__partner_context?.request_status || null;
                        const busyPause = enterpriseCampaignActionId === `pause:${c.id}`;
                        const busyActivate = enterpriseCampaignActionId === `activate:${c.id}`;
                        return (
                          <tr key={c.id}>
                            <td style={{ fontWeight: 600 }}>{c.name || '—'}</td>
                            <td>{c.campaign_type || '—'}</td>
                            <td>
                              <span className={`pc-badge pc-badge-${statusBadgeClass(status)}`}>
                                {status}
                              </span>
                            </td>
                            <td>{(c.start_at || c.start_date) ? new Date(c.start_at || c.start_date).toLocaleDateString() : '—'}</td>
                            <td>{(c.end_at || c.end_date) ? new Date(c.end_at || c.end_date).toLocaleDateString() : '—'}</td>
                            <td>{Array.isArray(c.target_tiers) && c.target_tiers.length > 0 ? c.target_tiers.join(', ') : 'All'}</td>
                            {isSilver && <td>{requestStatus ? String(requestStatus).replace(/_/g, ' ') : 'pending admin review'}</td>}
                            <td>
                              <div className="pc-actions">
                                <button className="btn btn-sm btn-secondary" onClick={() => openEnterpriseCampaignWizard(c.id)}>Edit</button>
                                {isGold && status === 'active' && (
                                  <button
                                    className="btn btn-sm btn-secondary"
                                    onClick={() => changeEnterpriseCampaignStatus(c.id, 'pause')}
                                    disabled={busyPause || busyActivate}
                                  >
                                    {busyPause ? 'Pausing…' : 'Pause'}
                                  </button>
                                )}
                                {isGold && status !== 'active' && status !== 'expired' && (
                                  <button
                                    className="btn btn-sm btn-primary"
                                    onClick={() => changeEnterpriseCampaignStatus(c.id, 'activate')}
                                    disabled={busyPause || busyActivate}
                                  >
                                    {busyActivate ? 'Activating…' : 'Activate'}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {enterpriseCampaignTotal > ENTERPRISE_CAMPAIGN_LIMIT && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                      <span style={{ color: '#666', fontSize: '0.9rem' }}>
                        {startIdx}–{endIdx} of {enterpriseCampaignTotal}
                      </span>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-secondary"
                          disabled={enterpriseCampaignPage === 0}
                          onClick={() => {
                            const nextPage = Math.max(0, enterpriseCampaignPage - 1);
                            setEnterpriseCampaignPage(nextPage);
                            loadEnterpriseCampaigns({ page: nextPage, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
                          }}
                        >
                          Previous
                        </button>
                        <button
                          className="btn btn-secondary"
                          disabled={(enterpriseCampaignPage + 1) * ENTERPRISE_CAMPAIGN_LIMIT >= enterpriseCampaignTotal}
                          onClick={() => {
                            const nextPage = enterpriseCampaignPage + 1;
                            setEnterpriseCampaignPage(nextPage);
                            loadEnterpriseCampaigns({ page: nextPage, search: enterpriseCampaignSearch, status: enterpriseCampaignStatusFilter });
                          }}
                        >
                          Next
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

  function CampaignsSection() {
    if (campaignAccessLoading) {
      return (
        <div className="pc-table-container">
          <div style={{ padding: 28, textAlign: 'center', color: '#666' }}>Loading campaign access...</div>
        </div>
      );
    }
    if (campaignWorkflowType === 'enterprise') {
      return <EnterpriseCampaignsSection />;
    }
    return <LegacyCampaignsSection />;
  }

  function GuestsSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Guests (CRM)</h1>
          <div><button className="btn btn-primary" onClick={loadGuests}>Refresh</button></div>
        </div>
        <p style={{ color: '#666', marginBottom: 16 }}>Guests who have booked or redeemed at your venue. View profile and add notes.</p>

        {/* Tier Card Verification */}
        <div style={{ background: 'var(--card, #0f1720)', borderRadius: 12, padding: '1rem', marginBottom: 20, border: '1px solid var(--border, rgba(255,255,255,0.04))' }}>
          <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem', fontWeight: 700 }}>Verify Guest Tier Card</h3>
          <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: 10 }}>Paste a guest's EAZY PASS QR token to verify their tier status.</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              className="pc-form-input"
              placeholder="Paste QR token here..."
              value={tierCardToken}
              onChange={e => setTierCardToken(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') verifyTierCard(); }}
              style={{ flex: 1, fontSize: '0.85rem' }}
            />
            <button className="btn btn-primary" onClick={verifyTierCard} disabled={verifyingTierCard || !tierCardToken.trim()}>
              {verifyingTierCard ? 'Verifying...' : 'Verify'}
            </button>
          </div>
          {tierCardResult && (
            <div style={{
              marginTop: 10, padding: 12, borderRadius: 8,
              background: tierCardResult.success ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)',
              border: `1px solid ${tierCardResult.success ? '#10b981' : '#ef4444'}`,
            }}>
              {tierCardResult.success ? (
                <div>
                  <div style={{ fontWeight: 700, color: '#10b981', marginBottom: 4 }}>Verified</div>
                  <div style={{ fontSize: '0.85rem', color: '#d1d5db' }}>
                    <strong>{tierCardResult.data.user?.name}</strong> &mdash; {tierCardResult.data.tier?.name} (Level {tierCardResult.data.tier?.level})
                  </div>
                  <div style={{ fontSize: '0.8rem', color: '#9ca3af', marginTop: 2 }}>
                    Card: {tierCardResult.data.cardNumber} &middot; Reward: {tierCardResult.data.tier?.rewardPercentage}%
                  </div>
                </div>
              ) : (
                <div style={{ color: '#ef4444', fontSize: '0.85rem' }}>{tierCardResult.message}</div>
              )}
            </div>
          )}
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr><th>Guest</th><th>Contact</th><th>Visits</th><th>Total spend</th><th>Last visit</th><th>Tier</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {guests.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: 24 }}>No guests yet. Guests appear after confirmed or redeemed bookings.</td></tr>
              ) : guests.map(g => (
                <tr key={g.user_id}>
                  <td>{[g.first_name, g.last_name].filter(Boolean).join(' ') || '—'}</td>
                  <td>{g.email || g.phone_number || '—'}</td>
                  <td>{g.visit_count}</td>
                  <td>₹{Number(g.total_spend || 0).toFixed(2)}</td>
                  <td>{g.last_visit ? new Date(g.last_visit).toLocaleDateString() : '—'}</td>
                  <td>{g.tier_name || '—'}</td>
                  <td><button className="btn btn-sm btn-primary" onClick={() => openGuestProfile(g.user_id)}>View & notes</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function TiersSection() {
    const tierInfo = partner?.partner_tier_benefits || {};
    const tierLabel = tierInfo.label || (partner?.partner_tier ? String(partner.partner_tier).charAt(0).toUpperCase() + String(partner.partner_tier).slice(1) + ' Partner' : 'Bronze Partner');
    const benefits = tierInfo.benefits || [];
    const description = tierInfo.description || 'Your subscription tier with Elizian defines the benefits and support you receive from the platform.';
    return (
      <div>
        <div className="pc-content-header">
          <h1>Partner Tier</h1>
          <button className="btn btn-primary" onClick={loadPartnerData}>Refresh</button>
        </div>
        <p style={{ color: '#666', marginBottom: 16 }}>
          Your relationship tier with Elizian. This subscription level determines the benefits you receive from the platform (e.g. support, visibility, features). Set by Elizian.
        </p>
        <div style={{ maxWidth: 560, background: '#f8fafc', borderRadius: 12, padding: 24, border: '1px solid #e2e8f0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <span style={{
              fontSize: '1.5rem',
              fontWeight: 700,
              color: partner?.partner_tier === 'gold' ? '#b45309' : partner?.partner_tier === 'silver' ? '#64748b' : '#78716c',
            }}>
              {partner?.partner_tier === 'gold' ? '🥇' : partner?.partner_tier === 'silver' ? '🥈' : '🥉'}
            </span>
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.25rem', color: '#1e293b' }}>{tierLabel}</div>
              {description && <div style={{ fontSize: '0.9rem', color: '#64748b', marginTop: 4 }}>{description}</div>}
            </div>
          </div>
          {benefits.length > 0 && (
            <div>
              <div style={{ fontWeight: 600, marginBottom: 8, color: '#334155' }}>Your benefits</div>
              <ul style={{ margin: 0, paddingLeft: 20, color: '#475569', lineHeight: 1.7 }}>
                {benefits.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          )}
        </div>
      </div>
    );
  }

  function MessagesSection() {
    return (
      <div className="pc-messages-section">
        <div className="pc-content-header">
          <h1>Messages</h1>
          <div><button className="btn btn-primary" onClick={loadConversations}>Refresh</button></div>
        </div>
        <p className="pc-messages-subtitle">Conversations with guests. Click a conversation to view and reply.</p>
        <div className="pc-messages-layout">
          <div className="pc-messages-conv-list">
            {conversations.length === 0 ? (
              <p className="pc-messages-empty">No conversations yet.</p>
            ) : (
              conversations.map(c => (
                <div
                  key={c.id}
                  className={`pc-messages-conv-item ${selectedConvId === c.id ? 'selected' : ''}`}
                  onClick={() => selectConversation(c)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <strong>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || 'Guest'}</strong>
                    {parseInt(c.unread_count || 0, 10) > 0 && (
                      <span style={{
                        background: '#004f4a', color: '#fff', fontSize: '0.65rem', fontWeight: 700,
                        minWidth: '18px', height: '18px', borderRadius: '9px',
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        padding: '0 5px',
                      }}>{c.unread_count}</span>
                    )}
                  </div>
                  <p className="pc-messages-conv-preview" style={{ fontWeight: parseInt(c.unread_count || 0, 10) > 0 ? 600 : 400 }}>
                    {c.last_message_sender === 'partner' && 'You: '}
                    {c.last_message || 'No messages'}
                  </p>
                </div>
              ))
            )}
          </div>
          <div className="pc-messages-thread-panel">
            {!selectedConvId ? (
              <p className="pc-messages-placeholder">Select a conversation</p>
            ) : (
              <>
                <div className="pc-messages-list">
                  {convMessages.length === 0 ? (
                    <p className="pc-messages-empty">No messages</p>
                  ) : (
                    convMessages.map(m => {
                      const isPartnerMsg = m.sender_type === 'partner';
                      const canDelete = isPartnerMsg && m.status && m.status !== 'read';
                      return (
                        <div key={m.id} className={`pc-msg-row ${isPartnerMsg ? 'partner' : 'user'}`}
                          style={{ position: 'relative' }}>
                          <div className="pc-msg-bubble" style={{ position: 'relative' }}>
                            <span className="pc-msg-body">{m.body}</span>
                            <span className="pc-msg-time">
                              {new Date(m.created_at).toLocaleString()}
                              {isPartnerMsg && m.status && (
                                <span style={{ marginLeft: 4, fontSize: '0.7rem', color: m.status === 'read' ? '#34b7f1' : '#9ca3af' }}>
                                  {m.status === 'sent' ? '✓' : '✓✓'}
                                </span>
                              )}
                            </span>
                            {canDelete && (
                              <button
                                onClick={() => deleteConvMessage(m.id)}
                                disabled={deletingMsgId === m.id}
                                title="Delete message (only possible before recipient reads it)"
                                style={{
                                  position: 'absolute', top: -6, right: -6,
                                  width: 20, height: 20, borderRadius: '50%',
                                  background: '#dc2626', color: '#fff', border: 'none',
                                  fontSize: '0.6rem', cursor: 'pointer',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                                  opacity: deletingMsgId === m.id ? 0.5 : 0.8,
                                  transition: 'opacity 0.15s',
                                }}
                                onMouseEnter={e => e.currentTarget.style.opacity = '1'}
                                onMouseLeave={e => e.currentTarget.style.opacity = '0.8'}
                              >✕</button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
                <form className="pc-messages-form" onSubmit={sendConvMessage}>
                  <input
                    ref={messageInputRef}
                    type="text"
                    className="pc-messages-input"
                    value={convMessageInput}
                    onChange={e => setConvMessageInput(e.target.value)}
                    placeholder="Type a message..."
                    aria-label="Message text"
                    autoComplete="off"
                  />
                  <button type="submit" className="btn btn-primary" disabled={!convMessageInput.trim() || sendingConvMessage}>
                    {sendingConvMessage ? 'Sending…' : 'Send'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  function StaffSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Staff Rewards</h1>
          <div><button className="btn btn-primary" onClick={() => { loadStaff(); loadStaffCheckIns(); }}>Refresh</button></div>
        </div>
        <p style={{ color: '#666', marginBottom: 16 }}>Add staff by email. When they check in at your venue, award them EZT to spend across the network.</p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
          <div>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Add staff</h2>
            <form onSubmit={addStaff} style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input type="email" className="pc-form-input" value={staffAddEmail} onChange={e => setStaffAddEmail(e.target.value)} placeholder="Staff email" style={{ flex: 1 }} />
              <button type="submit" className="btn btn-primary" disabled={!staffAddEmail.trim() || addingStaff}>{addingStaff ? 'Adding…' : 'Add'}</button>
            </form>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Staff list</h2>
            <table className="pc-table" style={{ width: '100%' }}>
              <thead><tr><th>Name</th><th>Email</th><th>Actions</th></tr></thead>
              <tbody>
                {staffList.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16 }}>No staff added. Add by email above.</td></tr> : staffList.map(s => (
                  <tr key={s.user_id}><td>{[s.first_name, s.last_name].filter(Boolean).join(' ') || '—'}</td><td>{s.email || '—'}</td><td><button type="button" className="btn btn-sm" onClick={() => removeStaff(s.user_id)}>Remove</button></td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Record check-in</h2>
            <form onSubmit={recordStaffCheckIn} style={{ marginBottom: 16 }}>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>Staff member</label>
                <select className="pc-form-input" value={staffCheckInUserId} onChange={e => setStaffCheckInUserId(e.target.value)} style={{ width: '100%' }}>
                  <option value="">Select…</option>
                  {staffList.map(s => <option key={s.user_id} value={s.user_id}>{[s.first_name, s.last_name].filter(Boolean).join(' ') || s.email || s.user_id}</option>)}
                </select>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label style={{ display: 'block', marginBottom: 4 }}>EZT to award</label>
                <input type="number" className="pc-form-input" value={staffCheckInEzt} onChange={e => setStaffCheckInEzt(e.target.value)} min={1} step={1} style={{ width: '100%' }} />
              </div>
              <button type="submit" className="btn btn-primary" disabled={!staffCheckInUserId || recordingCheckIn}>{recordingCheckIn ? 'Recording…' : 'Record check-in'}</button>
            </form>
            <h2 style={{ fontSize: '1rem', marginBottom: 12 }}>Recent check-ins</h2>
            <table className="pc-table" style={{ width: '100%' }}>
              <thead><tr><th>Staff</th><th>Date</th><th>EZT</th></tr></thead>
              <tbody>
                {staffCheckIns.length === 0 ? <tr><td colSpan={3} style={{ textAlign: 'center', padding: 16 }}>No check-ins yet.</td></tr> : staffCheckIns.map(c => (
                  <tr key={c.id}><td>{[c.first_name, c.last_name].filter(Boolean).join(' ') || c.email || '—'}</td><td>{new Date(c.checked_in_at).toLocaleString()}</td><td>{Number(c.ezt_earned)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function NfcPucksSection() {
    const tapUrl = typeof window !== 'undefined' ? `${window.location.origin}/tap/` : '/tap/';
    return (
      <div>
        <div className="pc-content-header">
          <h1>NFC Pucks</h1>
          <div>
            <button className="btn btn-primary" onClick={() => { loadNfcPucks(); loadNfcAnalytics(); }}>Refresh</button>
            <button className="btn btn-primary" onClick={openAddNfcPuck} style={{ marginLeft: 8 }}>Register puck</button>
          </div>
        </div>
        <p style={{ color: '#666', marginBottom: 16 }}>
          Place NFC pucks on tables or at your counter. When guests tap their phone, they instantly check in, view your venue, and can book/review/tip.
        </p>

        {/* Pucks table */}
        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr><th>Puck Code</th><th>Label</th><th>Location</th><th>Taps</th><th>Last tap</th><th>Active</th><th>NFC URL</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {nfcPucks.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24 }}>No NFC pucks registered. Click "Register puck" to create one.</td></tr>
              ) : nfcPucks.map(p => (
                <tr key={p.id}>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{p.puck_code}</td>
                  <td>{p.label || '—'}</td>
                  <td>{p.location_hint || '—'}</td>
                  <td>{p.tap_count}</td>
                  <td>{p.last_tapped_at ? new Date(p.last_tapped_at).toLocaleString() : '—'}</td>
                  <td>
                    <span className={`pc-badge pc-badge-${p.is_active ? 'success' : 'error'}`} style={{ cursor: 'pointer' }} onClick={() => toggleNfcPuck(p)}>
                      {p.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td>
                    <input
                      readOnly
                      value={`${tapUrl}${p.puck_code}`}
                      style={{ width: 160, fontSize: '0.75rem', fontFamily: 'monospace', padding: '4px 6px', border: '1px solid #ddd', borderRadius: 4 }}
                      onClick={e => { e.target.select(); navigator.clipboard?.writeText(e.target.value); showNotification('URL copied!'); }}
                      title="Click to copy"
                    />
                  </td>
                  <td>
                    <div className="pc-actions">
                      <button className="btn btn-sm btn-secondary" onClick={() => openEditNfcPuck(p)}>Edit</button>
                      <button className="btn btn-sm btn-danger" onClick={() => deleteNfcPuck(p.id)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Analytics */}
        {nfcAnalytics.length > 0 && (
          <div style={{ marginTop: 24 }}>
            <h3 style={{ marginBottom: 12 }}>Tap analytics (last 30 days)</h3>
            <div className="pc-stats-grid">
              {nfcAnalytics.map(a => (
                <div className="pc-stat-card" key={a.puck_id}>
                  <div className="pc-stat-value">{a.recent_taps}</div>
                  <div className="pc-stat-label">{a.label || a.puck_code} — {a.unique_users} unique guests</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Setup instructions */}
        <div style={{ marginTop: 24, padding: 16, background: '#f0f9ff', borderRadius: 8, border: '1px solid #bae6fd' }}>
          <h4 style={{ marginBottom: 8 }}>How to set up NFC pucks</h4>
          <ol style={{ paddingLeft: 20, margin: 0, color: '#374151', lineHeight: 1.8 }}>
            <li>Click <strong>"Register puck"</strong> to generate a unique puck code</li>
            <li>Copy the <strong>NFC URL</strong> for the registered puck</li>
            <li>Use an NFC writer app to program the URL onto an NFC tag/sticker</li>
            <li>Place the NFC tag on tables, counters, or at the entrance</li>
            <li>Guests tap their phone on the tag to instantly check in and interact</li>
          </ol>
        </div>
      </div>
    );
  }

  function OrdersSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Bookings & Vouchers</h1>
          <div>
            <select 
              className="pc-form-input" 
              style={{width: 'auto', marginRight: '10px'}}
              onChange={(e) => {
                const status = e.target.value;
                if (status) {
                  loadBookingsWithFilter(status);
                } else {
                  loadBookings();
                }
              }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="redeemed">Redeemed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="btn btn-secondary" onClick={loadBookings}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Booking Ref</th>
                <th>Customer</th>
                <th>Tier</th>
                <th>Deal/Event</th>
                <th>Date/Time</th>
                <th>Guests</th>
                <th>Amount</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={10} style={{textAlign:'center', padding:24}}>No bookings</td></tr>
              ) : bookings.map(b => (
                <tr key={b.id}>
                  <td style={{fontFamily:'monospace', fontSize:'0.85rem'}}>{b.booking_reference || b.id.substring(0,8)}</td>
                  <td>{b.customer_name || 'N/A'}</td>
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
                  <td>{b.deal_title || 'N/A'}</td>
                  <td>
                    {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'N/A'}
                    {b.time_slot && <div style={{fontSize:'0.75rem', color:'#666'}}>{b.time_slot}</div>}
                  </td>
                  <td>{b.num_tickets || b.num_guests || 1}</td>
                  <td>₹{parseFloat(b.total_price || b.fiat_amount || 0).toFixed(2)}</td>
                  <td>
                    {b.qr_code_url ? (
                      <img 
                        src={b.qr_code_url} 
                        alt="QR Code" 
                        style={{width:'50px', height:'50px', cursor:'pointer', borderRadius:'4px'}}
                        onClick={() => {
                          setSelectedBooking(b);
                          setShowRedemptionModal(true);
                        }}
                        title="Click to redeem"
                      />
                    ) : b.voucher_code ? (
                      <button
                        type="button"
                        className="btn btn-sm btn-outline"
                        style={{ fontSize: '0.8rem' }}
                        onClick={() => {
                          setSelectedBooking(b);
                          setShowRedemptionModal(true);
                        }}
                        title="Redeem voucher"
                      >
                        Voucher
                      </button>
                    ) : (
                      <span style={{color:'#999', fontSize:'0.85rem'}}>No QR</span>
                    )}
                  </td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(b.status)}`}>{b.status}</span></td>
                  <td>
                    <div className="pc-actions">
                      {b.status === 'redeemed' && (
                        <span style={{ fontSize: '0.8rem', color: '#059669', marginRight: 8 }} title="Voucher was redeemed">✓ Redeemed</span>
                      )}
                      {b.status === 'confirmed' && b.voucher_code && (
                        <button 
                          className="btn btn-sm btn-primary" 
                          onClick={() => {
                            setSelectedBooking(b);
                            setShowRedemptionModal(true);
                          }}
                          title="Redeem voucher at POS"
                        >
                          Redeem
                        </button>
                      )}
                      <button className="btn btn-sm btn-secondary" onClick={() => viewBooking(b.id)}>View</button>
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

  async function loadBookingsWithFilter(status) {
    if (!partner) return;
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/bookings?status=${status}`, { headers: headers() });
      const j = await r.json();
      if (j.success) setBookings(j.data?.bookings || []);
    } catch (e) { console.error(e); }
  }

  function viewBooking(id) {
    const b = bookings.find(x => x.id === id);
    if (!b) return;
    alert(`Booking Details:\n\nReference: ${b.booking_reference}\nCustomer: ${b.customer_name}\nDeal: ${b.deal_title}\nStatus: ${b.status}\nAmount: ₹${b.total_price || b.fiat_amount}\nVoucher Code: ${b.voucher_code || 'N/A'}`);
  }

  function AnalyticsSection() {
    if (!partner?.id) return <div className="pc-content-header"><p>Loading…</p></div>;
    return (
      <div>
        <div className="pc-content-header"><h1>Analytics</h1></div>
        <EnterpriseAnalyticsDashboard
          authHeaders={headers}
          role="partner"
          partnerId={partner.id}
          dealOptions={offers}
          categoryOptions={[]}
          tierOptions={[]}
          partnerOptions={[]}
        />
      </div>
    );
  }

  /**
   * Extract voucher UUID from any QR content format (v1/v2/v3, plain UUID, or URL).
   * Backward-compatible: handles old 800-byte QR content and new deep link URLs.
   */
  function extractVoucherCodeFromQR(rawText) {
    if (!rawText || typeof rawText !== 'string') return null;
    const trimmed = rawText.trim();

    // v3: Deep link URL — https://elizian.in/v/{uuid} (also accepts .com for compat)
    const urlMatch = trimmed.match(/elizian\.(?:in|com)\/v\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (urlMatch) return urlMatch[1];

    // Plain UUID (36 chars)
    const uuidMatch = trimmed.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    if (uuidMatch) return uuidMatch[0];

    // v2: Human-readable + JSON after "---" delimiter
    const jsonSplit = trimmed.split('---');
    if (jsonSplit.length > 1) {
      try {
        const data = JSON.parse(jsonSplit[jsonSplit.length - 1].trim());
        if (data.voucher_code) return data.voucher_code;
      } catch (_) { /* not valid JSON, continue */ }
    }

    // v1: Pure JSON
    try {
      const data = JSON.parse(trimmed);
      if (data.voucher_code) return data.voucher_code;
    } catch (_) { /* not JSON, continue */ }

    // Last resort: find any UUID embedded in the text
    const anyUuid = trimmed.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (anyUuid) return anyUuid[0];

    return null;
  }

  function QRScannerSection() {
    const codeRef = useRef();
    const scannerRef = useRef(null);
    const [scanning, setScanning] = useState(false);
    const [cameraError, setCameraError] = useState(null);

    // Cleanup camera on unmount
    useEffect(() => {
      return () => {
        if (scannerRef.current) {
          scannerRef.current.stop().catch(() => {});
          scannerRef.current = null;
        }
      };
    }, []);

    const startScanner = async () => {
      setCameraError(null);
      setScanning(true);
      try {
        const { Html5Qrcode } = await import('html5-qrcode');
        const scanner = new Html5Qrcode('qr-reader');
        scannerRef.current = scanner;
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 250, height: 250 } },
          (decodedText) => {
            const voucherCode = extractVoucherCodeFromQR(decodedText);
            if (voucherCode) {
              if (codeRef.current) codeRef.current.value = voucherCode;
              validateVoucher(voucherCode);
              stopScanner();
            }
          },
          () => {} // ignore scan-in-progress failures
        );
      } catch (err) {
        setCameraError(err?.message || 'Camera access denied or not available. Use manual input below.');
        setScanning(false);
      }
    };

    const stopScanner = () => {
      if (scannerRef.current) {
        scannerRef.current.stop().catch(() => {});
        scannerRef.current = null;
      }
      setScanning(false);
    };

    const handleValidateInput = () => {
      const raw = codeRef.current?.value || '';
      const voucherCode = extractVoucherCodeFromQR(raw) || raw.trim();
      if (voucherCode) validateVoucher(voucherCode);
    };

    return (
      <div>
        <div className="pc-content-header"><h1>QR Voucher Scanner</h1></div>
        <div style={{maxWidth:500}}>
          {/* Camera scanner */}
          <div style={{marginBottom:16}}>
            <button
              className={`btn ${scanning ? 'btn-danger' : 'btn-primary'}`}
              onClick={scanning ? stopScanner : startScanner}
              style={{marginBottom:10}}
            >
              {scanning ? '⏹ Stop Camera' : '📷 Scan QR Code'}
            </button>
            {cameraError && <div style={{color:'#b91c1c', fontSize:'0.85rem', marginBottom:8}}>{cameraError}</div>}
            <div
              id="qr-reader"
              style={{
                display: scanning ? 'block' : 'none',
                width: '100%',
                maxWidth: 400,
                marginBottom: 16,
                borderRadius: 8,
                overflow: 'hidden',
                border: '2px solid #10b981'
              }}
            />
          </div>

          {/* Manual input */}
          <div className="pc-form-group">
            <label>Voucher Code / URL</label>
            <input
              ref={codeRef}
              className="pc-form-input"
              placeholder="Enter voucher code, URL, or scan QR"
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleValidateInput();
              }}
            />
          </div>
          <div style={{display:'flex', gap:10}}>
            <button className="btn btn-primary" onClick={handleValidateInput}>Validate</button>
            <button className="btn btn-secondary" onClick={() => { if (codeRef.current) codeRef.current.value=''; setScannerResult(null); }}>Reset</button>
          </div>
          <div style={{marginTop:20}}>
            {scannerResult && scannerResult.success ? (
              <div style={{padding:16, borderRadius:8, background:'#f0fdf4', border:'1px solid #10b981'}}>
                <div style={{marginBottom:8}}><strong>Voucher Code:</strong> {scannerResult.data.voucher_code}</div>
                <div style={{marginBottom:8}}><strong>Booking Reference:</strong> {scannerResult.data.booking_reference}</div>
                <div style={{marginBottom:8}}><strong>Status:</strong> {scannerResult.data.status}</div>
                <div style={{marginBottom:8}}><strong>Customer:</strong> {scannerResult.data.customer_name || 'N/A'}</div>
                <div style={{marginBottom:8}}><strong>Amount:</strong> ₹{scannerResult.data.total_price || scannerResult.data.fiat_amount || 0}</div>
                {scannerResult.data.status === 'confirmed' && (
                  <div style={{marginTop:10}}>
                    <button
                      className="btn btn-primary"
                      onClick={() => {
                        // Find booking and open redemption modal
                        const booking = bookings.find(b => b.voucher_code === scannerResult.data.voucher_code);
                        if (booking) {
                          setSelectedBooking(booking);
                          setShowRedemptionModal(true);
                        } else {
                          // If not in list, create a booking object from scanner result
                          setSelectedBooking({
                            id: scannerResult.data.booking_id,
                            voucher_code: scannerResult.data.voucher_code,
                            booking_reference: scannerResult.data.booking_reference,
                            customer_name: scannerResult.data.customer_name,
                            deal_title: scannerResult.data.deal_title,
                            total_price: scannerResult.data.total_price || scannerResult.data.fiat_amount
                          });
                          setShowRedemptionModal(true);
                        }
                      }}
                    >
                      Redeem Voucher
                    </button>
                  </div>
                )}
              </div>
            ) : scannerResult && !scannerResult.success ? (
              <div style={{padding:16, borderRadius:8, background:'#fee2e2', border:'1px solid #ef4444', color:'#991b1b'}}>
                {scannerResult.error || 'Invalid voucher'}
              </div>
            ) : null}
          </div>
          <hr style={{margin:'24px 0'}} />
          <h3 style={{marginBottom:12}}>Redeem subscription pass</h3>
          <div className="pc-form-group">
            <label>Pass code</label>
            <input className="pc-form-input" value={passRedeemCode} onChange={e => setPassRedeemCode(e.target.value)} placeholder="Enter customer pass code" />
          </div>
          <button className="btn btn-primary" onClick={redeemPassCode} disabled={!passRedeemCode.trim() || redeemingPass}>{redeemingPass ? 'Redeeming…' : 'Redeem pass'}</button>
          {passRedeemResult && (
            <div style={{marginTop:12, padding:12, borderRadius:8, background: passRedeemResult.success ? '#f0fdf4' : '#fee2e2', border: `1px solid ${passRedeemResult.success ? '#10b981' : '#ef4444'}`}}>
              {passRedeemResult.success ? 'Pass redeemed successfully.' : (passRedeemResult.message || 'Failed to redeem.')}
            </div>
          )}
        </div>
      </div>
    );
  }

  async function redeemPassCode() {
    if (!partner || !passRedeemCode.trim() || redeemingPass) return;
    setRedeemingPass(true);
    setPassRedeemResult(null);
    try {
      const r = await authFetch(`${API_BASE}/api/v1/partners/${partner.id}/passes/redeem`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ code: passRedeemCode.trim() }),
      });
      const j = await r.json();
      setPassRedeemResult(j);
      if (j.success) { setPassRedeemCode(''); showNotification('Pass redeemed'); }
    } catch (err) { setPassRedeemResult({ success: false, message: 'Network error' }); }
    setRedeemingPass(false);
  }

  async function validateVoucher(voucherCode) {
    if (!voucherCode || voucherCode.trim() === '') {
      setScannerResult({ success: false, error: 'Please enter a voucher code' });
      return;
    }

    try {
      // First, try to get redemption by voucher code
      const r = await authFetch(`${API_BASE}/api/v1/redemptions/voucher/${voucherCode}`, { headers: headers() });
      const j = await r.json();
      
      if (j.success && j.data) {
        // Already redeemed
        setScannerResult({ 
          success: true, 
          data: {
            voucher_code: j.data.voucher_code,
            booking_reference: j.data.booking_reference,
            status: 'redeemed',
            redeemed_at: j.data.redeemed_at
          }
        });
        showNotification('Voucher already redeemed', 'warning');
        return;
      }

      // If not redeemed, try local list then server-side lookup (covers vouchers not in first 50 bookings)
      let booking = bookings.find(b => b.voucher_code === voucherCode);
      if (!booking && partner?.id) {
        const lookupRes = await authFetch(
          `${API_BASE}/api/v1/partners/${partner.id}/vouchers/lookup?code=${encodeURIComponent(voucherCode.trim())}`,
          { headers: headers() }
        );
        const lookupJson = await lookupRes.json();
        if (lookupJson.success && lookupJson.data?.valid) {
          booking = {
            id: lookupJson.data.id,
            voucher_code: lookupJson.data.voucher_code,
            booking_reference: lookupJson.data.booking_reference,
            customer_name: lookupJson.data.customer_name,
            deal_title: lookupJson.data.deal_title,
            total_price: lookupJson.data.total_price,
            fiat_amount: lookupJson.data.fiat_amount,
            status: lookupJson.data.status,
            user_id: lookupJson.data.user_id,
            deal_id: lookupJson.data.deal_id
          };
        }
      }
      if (booking) {
        setScannerResult({ 
          success: true, 
          data: {
            voucher_code: booking.voucher_code,
            booking_reference: booking.booking_reference,
            booking_id: booking.id,
            customer_name: booking.customer_name,
            deal_title: booking.deal_title,
            total_price: booking.total_price || booking.fiat_amount,
            status: booking.status
          }
        });
      } else {
        setScannerResult({ success: false, error: 'Voucher not found or not for your venue' });
      }
    } catch (e) { 
      console.error('Validate voucher error:', e);
      setScannerResult({ success: false, error: 'Error validating voucher' });
    }
  }

  function getStatusClass(status) {
    const mapping = { 
      pending: 'warning', 
      confirmed: 'secondary', 
      redeemed: 'success',
      preparing: 'warning', 
      ready: 'success', 
      completed: 'success', 
      cancelled: 'error' 
    };
    return mapping[status] || 'secondary';
  }

  function showNotification(msg, type='success') {
    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 16px;border-radius:8px;color:#fff;background:${type==='success'?'#10b981':'#ef4444'};z-index:11000;`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),400); },3000);
  }

  function viewOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    alert(JSON.stringify(o, null, 2));
  }

  async function fetchCalculationPreview(voucherCode, totalBillAmount) {
    if (!voucherCode || totalBillAmount == null || totalBillAmount === '' || parseFloat(totalBillAmount) <= 0) {
      setCalculationPreview(null);
      return;
    }
    setCalculationLoading(true);
    setCalculationPreview(null);
    try {
      const url = `${API_BASE}/api/v1/redemptions/calculate?voucher_code=${encodeURIComponent(voucherCode)}&total_bill_amount=${encodeURIComponent(totalBillAmount)}`;
      const r = await authFetch(url, { headers: headers() });
      const j = await r.json();
      if (j.success && j.data) {
        setCalculationPreview(j.data);
        const maxAllowed = j.data.max_allowed_co_pay != null ? parseFloat(j.data.max_allowed_co_pay) : (j.data.effective_max_ezt_co_pay_inr != null ? parseFloat(j.data.effective_max_ezt_co_pay_inr) : (j.data.ezt_co_pay_amount != null ? parseFloat(j.data.ezt_co_pay_amount) : 0));
        setWalletInfo({
          max_allowed_co_pay: maxAllowed,
          wallet_shortfall: j.data.wallet_shortfall != null ? parseFloat(j.data.wallet_shortfall) : null,
          customer_fully_funded: j.data.customer_fully_funded !== false
        });
        const total = parseFloat(totalBillAmount) || 0;
        const eztToUse = Math.min(maxAllowed, total);
        const net = Math.max(0, total - eztToUse);
        setRedemptionForm((prev) => ({
          ...prev,
          ezt_co_pay_amount: String(eztToUse),
          net_amount_from_user: String(net.toFixed(2)),
        }));
      } else {
        setCalculationPreview(null);
        setWalletInfo({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
      }
    } catch (err) {
      console.error('Calculate preview error:', err);
      setCalculationPreview(null);
      setWalletInfo({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
    } finally {
      setCalculationLoading(false);
    }
  }

  async function handleRedemptionSubmit(e) {
    e.preventDefault();
    if (!selectedBooking || !selectedBooking.voucher_code) {
      showNotification('Invalid booking selected', 'error');
      return;
    }

    // Validate financial amounts
    const totalBill = parseFloat(redemptionForm.total_bill_amount);
    const eztCoPay = parseFloat(redemptionForm.ezt_co_pay_amount);
    const netAmount = parseFloat(redemptionForm.net_amount_from_user);

    if (isNaN(totalBill) || totalBill <= 0) {
      showNotification('Please enter a valid bill amount', 'error');
      return;
    }
    if (isNaN(eztCoPay) || eztCoPay < 0 || isNaN(netAmount) || netAmount < 0) {
      showNotification('Please fill all financial fields', 'error');
      return;
    }

    if (Math.abs(netAmount - (totalBill - eztCoPay)) > 0.01) {
      showNotification('Net amount must equal Total Bill - EZT Co-Pay', 'error');
      return;
    }
    const maxAllowed = walletInfo.max_allowed_co_pay ?? calculationPreview?.max_allowed_co_pay ?? calculationPreview?.effective_max_ezt_co_pay_inr;
    if (maxAllowed != null && eztCoPay < maxAllowed - 0.01 && !(redemptionForm.redemption_notes && String(redemptionForm.redemption_notes).trim())) {
      showNotification('A reason is required in Redemption Notes when reducing EZT co-pay below the max applicable.', 'error');
      return;
    }

    try {
      const response = await authFetch(`${API_BASE}/api/v1/redemptions/redeem`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          voucher_code: selectedBooking.voucher_code,
          total_bill_amount: totalBill,
          ezt_co_pay_amount: eztCoPay,
          net_amount_from_user: netAmount,
          redemption_notes: redemptionForm.redemption_notes || null
        })
      });

      let result;
      try {
        result = await response.json();
      } catch (_) {
        result = { success: false, message: response.statusText || 'Invalid response' };
      }

      if (result?.success) {
        const isPending = result.data?.pending_confirmation;
        showNotification(
          isPending
            ? 'Redemption submitted — waiting for customer confirmation'
            : 'Voucher redeemed successfully!',
          'success'
        );
        setShowRedemptionModal(false);
        setSelectedBooking(null);
        setRedemptionForm({
          total_bill_amount: '',
          ezt_co_pay_amount: '',
          net_amount_from_user: '',
          redemption_notes: ''
        });
        setCalculationPreview(null);
        setOverrideCalculation(false);
        setWalletInfo({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
        loadBookings();
        loadDashboard();
      } else {
        const msg = result?.message ?? result?.error ?? (response.ok ? 'Redemption failed' : `Request failed (${response.status})`);
        showNotification(msg, 'error');
      }
    } catch (error) {
      console.error('Redemption error:', error);
      const isRefused = error?.message?.includes('Failed to fetch') || error?.name === 'TypeError';
      showNotification(
        isRefused ? 'Cannot reach server. Is the backend running? Check API URL (e.g. http://localhost:4000).' : 'Network error. Please try again.',
        'error'
      );
    }
  }

  // Don't render if no token (will redirect)
  if (!token) {
    return null;
  }

  return (
    <div className="pc-root">
      <Header partnerName={partner?.name} onLogout={logout} />
      <div className="pc-container">
        <div className="pc-dashboard-grid">
          <Sidebar active={activeSection} onNavigate={handleNavigate} />
          <main className="pc-main-content">
            {activeSection === 'dashboard' && <DashboardSection />}
            {activeSection === 'profile' && <ProfileSection />}
            {activeSection === 'hours' && partner && (
              <OperatingHoursManager partnerId={partner.id} token={token} />
            )}
            {activeSection === 'menu' && <MenuSection />}
            {activeSection === 'orders' && <OrdersSection />}
            {activeSection === 'analytics' && <AnalyticsSection />}
            {activeSection === 'offers' && <OffersSection />}
            {activeSection === 'campaigns' && <CampaignsSection />}
            {activeSection === 'guests' && <GuestsSection />}
            {activeSection === 'tiers' && <TiersSection />}
            {activeSection === 'messages' && MessagesSection()}
            {activeSection === 'staff' && <StaffSection />}
            {activeSection === 'nfc' && <NfcPucksSection />}
            {activeSection === 'scanner' && <QRScannerSection />}
          </main>
        </div>
      </div>

      {/* Offer modal */}
      <Modal id="offerModal" title={offerEditId ? 'Edit Deal' : 'Create New Deal'} show={showOfferModal} onClose={() => setShowOfferModal(false)} width={700}>
        <form onSubmit={saveOffer}>
          <div className="pc-form-group">
            <label>Deal Title *</label>
            <input
              className="pc-form-input"
              required
              value={offerForm.title||''}
              onChange={e=>setOfferForm({...offerForm, title: e.target.value})}
              spellCheck={true}
              autoComplete="off"
              placeholder="e.g. Valentine's Dinner, Weekend Brunch"
            />
            <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Check spelling (e.g. Hygiene, Camp). This appears on the app.</p>
          </div>
          <div className="pc-form-group"><label>Service Type</label><select className="pc-form-input" value={offerForm.service_type||''} onChange={e=>setOfferForm({...offerForm, service_type: e.target.value})}><option value="">Select</option><option value="dining">Dining</option><option value="events">Events</option><option value="spa-and-salon">Spa & Salon</option><option value="wellness">Wellness</option><option value="travel">Travel</option><option value="healthcare">Healthcare</option><option value="others">Others</option></select></div>
          <div className="pc-form-grid"><div className="pc-form-group"><label>Start Date</label><input type="datetime-local" className="pc-form-input" value={offerForm.start_date||''} onChange={e=>setOfferForm({...offerForm, start_date: e.target.value})} /></div><div className="pc-form-group"><label>End Date</label><input type="datetime-local" className="pc-form-input" value={offerForm.end_date||''} onChange={e=>setOfferForm({...offerForm, end_date: e.target.value})} /></div></div>
          <div className="pc-form-group"><label>Perk type</label><select className="pc-form-input" value={offerForm.perk_type||'discount'} onChange={e=>{
            const newPerk = e.target.value;
            const isDiscount = newPerk === 'discount';
            const coPayEmpty = offerForm.co_pay_percentage === '' || offerForm.co_pay_percentage == null;
            setOfferForm({...offerForm, perk_type: newPerk, co_pay_percentage: (isDiscount && coPayEmpty) ? String(DEFAULT_CO_PAY_PERCENT) : offerForm.co_pay_percentage});
          }}><option value="discount">Discount</option><option value="fixed_price_deal">Fixed Price deal</option><option value="free_item">Free item</option><option value="secret_menu">Secret menu</option><option value="priority_access">Priority access</option><option value="other">Other</option></select></div>
          <div className="pc-form-group"><label>Perk description (optional)</label><textarea className="pc-form-input" rows={2} value={offerForm.perk_description||''} onChange={e=>setOfferForm({...offerForm, perk_description: e.target.value})} placeholder="e.g. Complimentary dessert with main" /></div>
          <div className="pc-form-group">
            <label>Co-pay % (EZT) {offerForm.perk_type === 'discount' ? '*' : '(optional)'}</label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.01}
              className="pc-form-input"
              value={offerForm.co_pay_percentage ?? ''}
              onChange={e=>setOfferForm({...offerForm, co_pay_percentage: e.target.value === '' ? '' : parseFloat(e.target.value)})}
              placeholder={offerForm.perk_type === 'discount' ? 'e.g. 30 (required for Discount)' : 'e.g. 30'}
            />
          </div>
          <p style={{ margin: '0 0 12px', fontSize: '0.85rem', color: '#666' }}>Co-pay % is used at redemption: EZT amount = Total bill × (Co-pay % / 100). Net = Bill − EZT. Required when Perk type is Discount.</p>
          <div className="pc-form-group" style={{ padding: '10px 0', borderTop: '1px solid #eee' }}>
            <label style={{ fontWeight: 600 }}>Deal card image</label>
            <p style={{ margin: '4px 0 8px', fontSize: '0.9rem', color: '#666' }}>Image shown on the deal card. Recommended: 16:9, max 2MB.</p>
            {(offerForm.image_url || offerForm.image_base64) && (
              <div style={{ marginBottom: 10 }}>
                <img
                  src={offerForm.image_base64 || offerForm.image_url}
                  alt="Deal"
                  style={{ maxWidth: '100%', maxHeight: 160, objectFit: 'contain', borderRadius: 8, border: '1px solid #ddd' }}
                />
                <button type="button" className="btn btn-sm btn-secondary" style={{ marginTop: 6 }} onClick={() => setOfferForm({ ...offerForm, image_url: null, image_base64: undefined, image_filename: undefined })}>Remove image</button>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="pc-form-input"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) { alert('Image should be under 2MB'); return; }
                const reader = new FileReader();
                reader.onload = () => {
                  setOfferForm((prev) => ({
                    ...prev,
                    image_base64: reader.result,
                    image_filename: (file.name && /\.(jpe?g|png|gif|webp)$/i.test(file.name)) ? file.name : `${file.name.replace(/\.[^.]+$/, '') || 'offer'}.jpg`,
                  }));
                };
                reader.onerror = () => alert('Could not read the image file. Try another image.');
                reader.readAsDataURL(file);
                e.target.value = '';
              }}
            />
          </div>
          {offerEditId && (
            <>
              <div className="pc-form-group" style={{ padding: '10px 0', borderTop: '1px solid #eee' }}>
                <label style={{ fontWeight: 600 }}>Trending</label>
                <p style={{ margin: '4px 0 8px', fontSize: '0.9rem', color: '#666' }}>
                  {offerForm.is_trending ? '🔥 This deal is marked as Trending (shown in Trending Experiences).' : offerForm.featured_request_pending ? '⏳ Trending request pending admin approval.' : partner?.partner_tier === 'gold' ? '🥇 Gold partners: all your deals are already Trending.' : partner?.partner_tier === 'bronze' ? '🥉 Bronze partners cannot request Trending. Admin can override to mark a deal as Trending.' : '— Not set. Request below to be considered for Trending.'}
                </p>
                {partner?.partner_tier === 'silver' && !offerForm.is_trending && !offerForm.featured_request_pending && (
                  <label className="pc-form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input type="checkbox" checked={!!offerForm.request_trending} onChange={e=>setOfferForm({...offerForm, request_trending: e.target.checked})} />
                    <span>Request Trending (admin approves with reason)</span>
                  </label>
                )}
              </div>
            </>
          )}
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}><button type="button" className="btn btn-secondary" onClick={()=>setShowOfferModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Deal</button></div>
        </form>
      </Modal>

      {/* Enterprise campaign wizard */}
      {enterpriseCampaignWizardOpen && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
          onClick={() => !enterpriseCampaignSaving && setEnterpriseCampaignWizardOpen(false)}
        >
          <div
            style={{ background: '#1f2937', borderRadius: 12, maxWidth: 560, width: '100%', maxHeight: '90vh', overflow: 'auto', padding: 24 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 8px' }}>
              {enterpriseCampaignEditingId ? 'Edit campaign' : normalizePartnerTier(campaignTier) === 'silver' ? 'New campaign request' : 'New campaign'}
            </h3>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: 16 }}>Step {enterpriseCampaignWizardStep} of 5</p>

            {enterpriseCampaignWizardStep === 1 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Name</label>
                  <input
                    className="pc-form-input"
                    value={enterpriseCampaignForm.name}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Campaign name"
                  />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Description</label>
                  <textarea
                    className="pc-form-input"
                    rows={2}
                    value={enterpriseCampaignForm.description}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, description: e.target.value }))}
                    placeholder="Optional"
                  />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Type</label>
                  <select
                    className="pc-form-input"
                    value={enterpriseCampaignForm.campaign_type}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, campaign_type: e.target.value }))}
                  >
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
                    <input
                      type="date"
                      className="pc-form-input"
                      value={enterpriseCampaignForm.start_at || ''}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, start_at: e.target.value || '' }))}
                    />
                  </div>
                  <div className="pc-form-group">
                    <label className="pc-form-label">End date</label>
                    <input
                      type="date"
                      className="pc-form-input"
                      value={enterpriseCampaignForm.end_at || ''}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, end_at: e.target.value || '' }))}
                    />
                  </div>
                </div>
              </>
            )}

            {enterpriseCampaignWizardStep === 2 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Target tiers</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(enterpriseCampaignSchema?.target_tiers || ['Ather', 'Nova', 'Luminar', 'Valiant', 'Echelon']).map((t) => (
                      <label key={t} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(enterpriseCampaignForm.target_tiers || []).includes(t)}
                          onChange={(e) => setEnterpriseCampaignForm((f) => ({
                            ...f,
                            target_tiers: e.target.checked
                              ? [...(f.target_tiers || []), t]
                              : (f.target_tiers || []).filter((x) => x !== t),
                          }))}
                        />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Target categories</label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(enterpriseCampaignSchema?.target_categories || ['Dining', 'Spa', 'Events', 'Travel', 'Healthcare', 'Others']).map((cat) => (
                      <label key={cat} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={(enterpriseCampaignForm.target_categories || []).includes(cat)}
                          onChange={(e) => setEnterpriseCampaignForm((f) => ({
                            ...f,
                            target_categories: e.target.checked
                              ? [...(f.target_categories || []), cat]
                              : (f.target_categories || []).filter((x) => x !== cat),
                          }))}
                        />
                        <span>{cat}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                  <div className="pc-form-group">
                    <label className="pc-form-label">Geo: City</label>
                    <input
                      className="pc-form-input"
                      value={enterpriseCampaignForm.geo_filter?.city || ''}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, geo_filter: { ...(f.geo_filter || {}), city: e.target.value || undefined } }))}
                      placeholder="Optional"
                    />
                  </div>
                  <div className="pc-form-group">
                    <label className="pc-form-label">Sector</label>
                    <input
                      className="pc-form-input"
                      value={enterpriseCampaignForm.geo_filter?.sector || ''}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, geo_filter: { ...(f.geo_filter || {}), sector: e.target.value || undefined } }))}
                      placeholder="Optional"
                    />
                  </div>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">User segment</label>
                  <select
                    className="pc-form-input"
                    value={enterpriseCampaignForm.user_segment?.segment || ''}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, user_segment: { ...(f.user_segment || {}), segment: e.target.value || undefined } }))}
                  >
                    <option value="">Any</option>
                    {(enterpriseCampaignSchema?.user_segments || ['new', 'dormant', 'high_value', 'low_engagement']).map((s) => (
                      <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {enterpriseCampaignWizardStep === 3 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">IF event</label>
                  <select
                    className="pc-form-input"
                    value={enterpriseCampaignForm.rule_json?.trigger?.event || ''}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({
                      ...f,
                      rule_json: {
                        ...(f.rule_json || {}),
                        trigger: { ...(f.rule_json?.trigger || {}), event: e.target.value },
                        action: f.rule_json?.action || {},
                      },
                    }))}
                  >
                    <option value="">— Select —</option>
                    {(enterpriseCampaignSchema?.event_types || []).map((ev) => (
                      <option key={ev} value={ev}>{ev}</option>
                    ))}
                  </select>
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">THEN action</label>
                  <select
                    className="pc-form-input"
                    value={enterpriseCampaignForm.rule_json?.action?.type || ''}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({
                      ...f,
                      rule_json: {
                        ...(f.rule_json || {}),
                        action: { type: e.target.value, params: f.rule_json?.action?.params || {} },
                      },
                    }))}
                  >
                    <option value="">— Select —</option>
                    {(enterpriseCampaignSchema?.action_types || []).map((ac) => (
                      <option key={ac} value={ac}>{ac.replace(/_/g, ' ')}</option>
                    ))}
                  </select>
                </div>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem' }}>Advanced conditions can be added via API as JSON.</p>
              </>
            )}

            {enterpriseCampaignWizardStep === 4 && (
              <>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Budget cap (₹)</label>
                  <input
                    type="number"
                    min={0}
                    step={100}
                    className="pc-form-input"
                    value={enterpriseCampaignForm.budget_limit ?? ''}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, budget_limit: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) }))}
                    placeholder="Leave empty for no limit"
                  />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label className="pc-form-label">Priority weight</label>
                  <input
                    type="number"
                    min={0}
                    className="pc-form-input"
                    value={enterpriseCampaignForm.priority_weight ?? 0}
                    onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, priority_weight: Math.max(0, Number(e.target.value) || 0) }))}
                  />
                </div>
                <div className="pc-form-group" style={{ marginBottom: 12 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={!!enterpriseCampaignForm.auto_expiry}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, auto_expiry: e.target.checked }))}
                    />
                    <span>Auto-expiry (respect end date)</span>
                  </label>
                </div>
              </>
            )}

            {enterpriseCampaignWizardStep === 5 && (
              <>
                <div style={{ padding: 12, background: '#111827', borderRadius: 8, marginBottom: 16 }}>
                  <div style={{ marginBottom: 8 }}><strong>{enterpriseCampaignForm.name || 'Unnamed'}</strong> — {enterpriseCampaignForm.campaign_type}</div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af' }}>
                    Tiers: {(enterpriseCampaignForm.target_tiers || []).length ? enterpriseCampaignForm.target_tiers.join(', ') : 'All'} · Categories: {(enterpriseCampaignForm.target_categories || []).length ? enterpriseCampaignForm.target_categories.join(', ') : 'Any'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 4 }}>
                    Rule: IF {enterpriseCampaignForm.rule_json?.trigger?.event || '—'} THEN {enterpriseCampaignForm.rule_json?.action?.type || '—'}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: 4 }}>
                    Budget: {enterpriseCampaignForm.budget_limit != null ? `₹${Number(enterpriseCampaignForm.budget_limit).toLocaleString()}` : 'No limit'} · Priority: {enterpriseCampaignForm.priority_weight ?? 0}
                  </div>
                </div>
                {!enterpriseCampaignEditingId && normalizePartnerTier(campaignTier) === 'gold' && (
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={enterpriseCampaignForm.activateAfterSave}
                      onChange={(e) => setEnterpriseCampaignForm((f) => ({ ...f, activateAfterSave: e.target.checked }))}
                    />
                    <span>Activate campaign after save</span>
                  </label>
                )}
                {normalizePartnerTier(campaignTier) === 'silver' && (
                  <p style={{ color: '#fbbf24', fontSize: '0.85rem', marginBottom: 0 }}>
                    This will be submitted to Admin for review and approval.
                  </p>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 16 }}>
              <div>
                {enterpriseCampaignWizardStep > 1 && (
                  <button
                    type="button"
                    className="btn btn-secondary"
                    disabled={enterpriseCampaignSaving}
                    onClick={() => setEnterpriseCampaignWizardStep((s) => s - 1)}
                  >
                    Back
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {enterpriseCampaignWizardStep < 5 ? (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={enterpriseCampaignWizardStep === 1 && !enterpriseCampaignForm.name.trim()}
                    onClick={() => setEnterpriseCampaignWizardStep((s) => s + 1)}
                  >
                    Next
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn btn-secondary" disabled={enterpriseCampaignSaving} onClick={() => setEnterpriseCampaignWizardOpen(false)}>Cancel</button>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={enterpriseCampaignSaving || !enterpriseCampaignForm.name.trim()}
                      onClick={saveEnterpriseCampaign}
                    >
                      {enterpriseCampaignSaving ? 'Saving...' : enterpriseCampaignEditingId ? 'Update' : normalizePartnerTier(campaignTier) === 'silver' ? 'Submit request' : 'Save campaign'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Legacy campaign modal */}
      {campaignWorkflowType === 'legacy' && (
        <Modal id="campaignModal" title={campaignEditId ? 'Edit campaign' : 'New campaign'} show={showCampaignModal} onClose={() => setShowCampaignModal(false)} width={560}>
          <form onSubmit={saveCampaign}>
            <div className="pc-form-group"><label>Title *</label><input className="pc-form-input" required value={campaignForm.title} onChange={e => setCampaignForm({ ...campaignForm, title: e.target.value })} placeholder="e.g. Weekend special" /></div>
            <div className="pc-form-group"><label>Message body *</label><textarea className="pc-form-input" required rows={4} value={campaignForm.body} onChange={e => setCampaignForm({ ...campaignForm, body: e.target.value })} placeholder="Your message to guests..." /></div>
            <div className="pc-form-group">
              <label>Who should receive this message? (optional)</label>
              <textarea className="pc-form-input" rows={2} value={typeof campaignForm.segment_filter === 'string' ? campaignForm.segment_filter : (campaignForm.segment_filter ? JSON.stringify(campaignForm.segment_filter, null, 2) : '')} onChange={e => setCampaignForm({ ...campaignForm, segment_filter: e.target.value })} placeholder='Leave blank to send to all guests. Example: {"min_visits": 2}' />
              <p style={{ margin: '4px 0 0', fontSize: '0.8rem', color: '#6b7280' }}>Leave this empty to send to everyone. Only use the example format if you want to target a specific group.</p>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCampaignModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">{campaignEditId ? 'Update' : 'Create draft'}</button>
            </div>
          </form>
        </Modal>
      )}

      {/* Guest profile modal */}
      <Modal id="guestModal" title="Guest profile" show={showGuestModal} onClose={() => { setShowGuestModal(false); setGuestProfile(null); }} width={600}>
        {guestProfile && (
          <>
            <div style={{ marginBottom: 16 }}>
              <p><strong>{[guestProfile.first_name, guestProfile.last_name].filter(Boolean).join(' ') || 'Guest'}</strong></p>
              <p style={{ color: '#666', fontSize: '0.9rem' }}>{guestProfile.email || guestProfile.phone_number || '—'} · Tier: {guestProfile.tier_name || '—'}</p>
              <p>Visits: {guestProfile.visit_count} · Total spend: ₹{Number(guestProfile.total_spend || 0).toFixed(2)} · Value score: {guestProfile.value_score ?? '—'}</p>
            </div>
            <h4 style={{ marginBottom: 8 }}>Visit history</h4>
            <div className="pc-table-container" style={{ maxHeight: 200, overflow: 'auto', marginBottom: 16 }}>
              <table className="pc-table"><thead><tr><th>Ref</th><th>Date</th><th>Deal</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {(guestProfile.visit_history || []).length === 0 ? <tr><td colSpan={5}>No visits</td></tr> : (guestProfile.visit_history || []).map(v => (
                  <tr key={v.booking_id}><td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{v.booking_reference || v.booking_id?.slice(0,8)}</td><td>{v.booking_date ? new Date(v.booking_date).toLocaleDateString() : '—'}</td><td>{v.offer_title || '—'}</td><td>₹{Number(v.total_price || 0).toFixed(2)}</td><td>{v.status}</td></tr>
                ))}
              </tbody></table>
            </div>
            <h4 style={{ marginBottom: 8 }}>Notes</h4>
            <ul style={{ listStyle: 'none', padding: 0, marginBottom: 16, maxHeight: 120, overflow: 'auto' }}>
              {(guestProfile.notes || []).length === 0 ? <li style={{ color: '#888' }}>No notes yet</li> : (guestProfile.notes || []).map(n => (
                <li key={n.id} style={{ padding: '6px 0', borderBottom: '1px solid #eee', fontSize: '0.9rem' }}>{n.note} <span style={{ color: '#888', fontSize: '0.8rem' }}>{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</span></li>
              ))}
            </ul>
            <form onSubmit={addGuestNoteSubmit}>
              <div className="pc-form-group">
                <label>Add note</label>
                <textarea className="pc-form-input" rows={2} value={guestNoteText} onChange={e => setGuestNoteText(e.target.value)} placeholder="e.g. Prefers window table" />
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowGuestModal(false)}>Close</button>
                <button type="submit" className="btn btn-primary" disabled={!guestNoteText.trim() || addingNote}>{addingNote ? 'Adding…' : 'Add note'}</button>
              </div>
            </form>
          </>
        )}
      </Modal>

      {/* NFC puck modal */}
      <Modal id="nfcModal" title={nfcEditId ? 'Edit NFC Puck' : 'Register NFC Puck'} show={showNfcModal} onClose={() => setShowNfcModal(false)} width={480}>
        <form onSubmit={saveNfcPuck}>
          <div className="pc-form-group"><label>Label (optional)</label><input className="pc-form-input" value={nfcForm.label} onChange={e => setNfcForm({ ...nfcForm, label: e.target.value })} placeholder="e.g. Table 5, Counter, Entrance" /></div>
          <div className="pc-form-group"><label>Location hint (optional)</label><input className="pc-form-input" value={nfcForm.location_hint} onChange={e => setNfcForm({ ...nfcForm, location_hint: e.target.value })} placeholder="e.g. Near the window, VIP section" /></div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <button type="button" className="btn btn-secondary" onClick={() => setShowNfcModal(false)}>Cancel</button>
            <button type="submit" className="btn btn-primary">{nfcEditId ? 'Update' : 'Register'}</button>
          </div>
        </form>
      </Modal>

      {/* Menu modal — hierarchical taxonomy-driven builder */}
      <MenuBuilderModal
        show={showMenuModal}
        onClose={() => setShowMenuModal(false)}
        editItem={menuEditId ? menuItems.find(m => m.id === menuEditId) : null}
        partnerId={partner?.id}
        token={token}
        onSaved={() => { setShowMenuModal(false); loadMenuItems(); }}
      />

      {/* Redemption Modal with Financial Capture */}
      <Modal 
        id="redemptionModal" 
        title="Redeem Voucher" 
        show={showRedemptionModal} 
        onClose={() => {
          setShowRedemptionModal(false);
          setSelectedBooking(null);
          setRedemptionForm({
            total_bill_amount: '',
            ezt_co_pay_amount: '',
            net_amount_from_user: '',
            redemption_notes: ''
          });
          setCalculationPreview(null);
          setCalculationLoading(false);
          setOverrideCalculation(false);
          setWalletInfo({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
        }} 
        width={600}
      >
        {selectedBooking && (
          <form onSubmit={handleRedemptionSubmit}>
            {/* Booking Info - explicit dark text on light background for readability */}
            <div style={{
              background: '#f3f4f6',
              color: '#1f2937',
              padding: '1rem',
              borderRadius: '8px',
              marginBottom: '1.5rem',
              border: '1px solid #e5e7eb'
            }}>
              <div style={{marginBottom:'0.5rem', color:'#111827'}}><strong>Booking Reference:</strong> {selectedBooking.booking_reference}</div>
              <div style={{marginBottom:'0.5rem', color:'#111827'}}><strong>Customer:</strong> {selectedBooking.customer_name || 'N/A'}</div>
              <div style={{marginBottom:'0.5rem', color:'#111827'}}><strong>Deal:</strong> {selectedBooking.deal_title || 'N/A'}</div>
              <div style={{marginBottom:'0.5rem', color:'#111827'}}><strong>Voucher Code:</strong> <span style={{fontFamily:'monospace', fontSize:'0.9rem', color:'#374151'}}>{selectedBooking.voucher_code}</span></div>
              {selectedBooking.qr_code_url && (
                <div style={{marginTop:'1rem', textAlign:'center'}}>
                  <img src={selectedBooking.qr_code_url} alt="QR Code" style={{width:'150px', height:'150px', border:'2px solid #9ca3af', borderRadius:'8px', display:'block', margin:'0 auto'}} />
                  <span style={{display:'inline-block', marginTop:'0.5rem', fontSize:'0.85rem', color:'#4b5563', fontWeight:500}}>QR Code</span>
                </div>
              )}
            </div>

            {/* Financial Capture Fields */}
            <div style={{marginBottom:'1.5rem'}}>
              <h3 style={{marginBottom:'1rem', fontSize:'1.1rem', color:'#374151'}}>Financial Details</h3>

              {/* Co-pay offer auto-calculation from deal */}
              <div style={{marginBottom:'1rem'}}>
                <label style={{display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:'0.9rem'}}>
                  <input
                    type="checkbox"
                    checked={overrideCalculation}
                    onChange={(e) => {
                      setOverrideCalculation(e.target.checked);
                      if (e.target.checked) {
                        setCalculationPreview(null);
                      } else if (selectedBooking?.voucher_code && redemptionForm.total_bill_amount) {
                        fetchCalculationPreview(selectedBooking.voucher_code, redemptionForm.total_bill_amount);
                      }
                    }}
                  />
                  Override calculation (enter amounts manually)
                </label>
              </div>
              
              <div className="pc-form-group">
                <label>Total Bill Amount (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  className="pc-form-input" 
                  required 
                  value={redemptionForm.total_bill_amount} 
                  onChange={(e) => {
                    const val = e.target.value;
                    setRedemptionForm((prev) => ({ ...prev, total_bill_amount: val }));
                    if (!overrideCalculation && selectedBooking?.voucher_code) {
                      fetchCalculationPreview(selectedBooking.voucher_code, val);
                    } else if (overrideCalculation) {
                      const total = parseFloat(val) || 0;
                      const ezt = parseFloat(redemptionForm.ezt_co_pay_amount) || 0;
                      setRedemptionForm((prev) => ({ ...prev, net_amount_from_user: Math.max(0, total - ezt).toFixed(2) }));
                    }
                  }}
                  placeholder="Enter total bill amount"
                />
              </div>

              {calculationLoading && (
                <div style={{fontSize:'0.9rem', color:'#6b7280', marginBottom:'0.5rem'}}>Calculating from deal…</div>
              )}

              {calculationPreview && !overrideCalculation && (
                <div style={{
                  background: '#ecfdf5',
                  color: '#065f46',
                  border: '1px solid #10b981',
                  borderRadius: '8px',
                  padding: '0.75rem 1rem',
                  marginBottom: '1rem',
                  fontSize: '0.9rem'
                }}>
                  <div style={{marginBottom:'0.25rem'}}><strong>Deal:</strong> {calculationPreview.co_pay_percentage ?? 0}% Co-Pay Discount</div>
                  <div style={{marginBottom:'0.25rem'}}><strong>Discount:</strong> ₹{calculationPreview.discount_amount ?? 0}</div>
                  <div style={{marginBottom:'0.25rem'}}><strong>EZT tokens required (full co-pay):</strong> {calculationPreview.ezt_tokens_required ?? 0} EZT</div>
                  {calculationPreview.user_ezt_balance != null && (
                    <div style={{marginBottom:'0.25rem'}}>
                      <strong>Customer EZT balance:</strong> {calculationPreview.user_ezt_balance} EZT
                      {(calculationPreview.ezt_tokens_required ?? 0) > (calculationPreview.user_ezt_balance ?? 0) && (
                        <span style={{color:'#b91c1c', marginLeft:'0.5rem'}}>⚠️ Insufficient balance</span>
                      )}
                    </div>
                  )}
                  {(walletInfo.max_allowed_co_pay ?? calculationPreview?.max_allowed_co_pay ?? calculationPreview?.effective_max_ezt_co_pay_inr) != null && (
                    <div style={{marginTop:'0.25rem', fontSize:'0.85rem', opacity:0.95}}>
                      Max applicable (capped by balance): ₹{(walletInfo.max_allowed_co_pay ?? calculationPreview?.max_allowed_co_pay ?? calculationPreview?.effective_max_ezt_co_pay_inr)}
                    </div>
                  )}
                  {walletInfo.wallet_shortfall != null && walletInfo.wallet_shortfall > 0 && (
                    <div style={{marginTop:'0.25rem', fontSize:'0.85rem', color:'#b91c1c'}}>
                      Customer shortfall: ₹{walletInfo.wallet_shortfall.toFixed(2)} of standard co-pay
                    </div>
                  )}
                </div>
              )}

              <div className="pc-form-group">
                <label>EZT Co-Pay Amount (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  min="0"
                  className="pc-form-input" 
                  required 
                  readOnly={!overrideCalculation && calculationPreview != null}
                  value={redemptionForm.ezt_co_pay_amount} 
                  onChange={(e) => {
                    if (!overrideCalculation) return;
                    const ezt = parseFloat(e.target.value) || 0;
                    const total = parseFloat(redemptionForm.total_bill_amount) || 0;
                    setRedemptionForm((prev) => ({
                      ...prev,
                      ezt_co_pay_amount: e.target.value,
                      net_amount_from_user: Math.max(0, total - ezt).toFixed(2)
                    }));
                  }}
                  style={!overrideCalculation && calculationPreview ? {background:'#f9fafb', color:'#6b7280'} : {}}
                  placeholder="Auto from deal or enter manually"
                />
              </div>

              <div className="pc-form-group">
                <label>Net Amount from User (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="pc-form-input" 
                  required 
                  readOnly
                  value={redemptionForm.net_amount_from_user} 
                  style={{background:'#f9fafb', color:'#6b7280'}}
                  placeholder="Auto-calculated"
                />
                <div style={{fontSize:'0.85rem', color:'#6b7280', marginTop:'0.25rem'}}>
                  = Total Bill − EZT Co-Pay (discount)
                </div>
              </div>

              <div className="pc-form-group">
                <label>Redemption Notes {calculationPreview?.effective_max_ezt_co_pay_inr != null ? '(Required if reducing EZT below max applicable)' : '(Optional)'}</label>
                <textarea 
                  className="pc-form-input" 
                  rows={3}
                  value={redemptionForm.redemption_notes} 
                  onChange={(e) => setRedemptionForm({...redemptionForm, redemption_notes: e.target.value})}
                  placeholder={calculationPreview?.effective_max_ezt_co_pay_inr != null ? "e.g. Customer requested partial EZT use; required when co-pay is below customer's available balance" : "Any additional notes about this redemption"}
                />
              </div>
            </div>

            {/* Validation Message */}
            {redemptionForm.total_bill_amount && redemptionForm.ezt_co_pay_amount && 
             parseFloat(redemptionForm.net_amount_from_user) !== (parseFloat(redemptionForm.total_bill_amount) - parseFloat(redemptionForm.ezt_co_pay_amount)) && (
              <div style={{padding:'0.75rem', background:'#fee2e2', color:'#991b1b', borderRadius:'6px', marginBottom:'1rem', fontSize:'0.9rem'}}>
                ⚠️ Net amount must equal Total Bill - EZT Co-Pay
              </div>
            )}

            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowRedemptionModal(false);
                  setSelectedBooking(null);
                  setRedemptionForm({
                    total_bill_amount: '',
                    ezt_co_pay_amount: '',
                    net_amount_from_user: '',
                    redemption_notes: ''
                  });
                  setCalculationPreview(null);
                  setOverrideCalculation(false);
                  setWalletInfo({ max_allowed_co_pay: null, wallet_shortfall: null, customer_fully_funded: true });
                }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={
                  !redemptionForm.total_bill_amount || 
                  !redemptionForm.ezt_co_pay_amount || 
                  !redemptionForm.net_amount_from_user ||
                  parseFloat(redemptionForm.net_amount_from_user) !== (parseFloat(redemptionForm.total_bill_amount) - parseFloat(redemptionForm.ezt_co_pay_amount))
                }
              >
                Redeem Voucher
              </button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
}
