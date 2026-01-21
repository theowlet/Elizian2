const API_BASE = window.parent.MY_GLOBAL_CONFIG.apiUrl || 'http://localhost:3000';

const state = {
  sections: [
    'dashboardSection',
    'usersSection',
    'partnersSection',
    'dealsSection',
    'bookingsSection',
    'analyticsSection',
    'activitySection',
    'systemHealthSection',
    'settingsSection',
  ],
  charts: {
    revenue: null,
  },
  pagination: {
    users: { page: 0, limit: 20 },
  },
  filters: {
    users: {
      search: '',
      role: 'all',
      status: 'all',
      tier: 'all',
      sortBy: 'created',
    },
    partners: {
      status: 'all',
    },
    deals: {
      search: '',
      status: 'all',
      promo: 'all',
    },
    analyticsPeriod: '30',
  },
  cache: {
    partners: [],
    deals: [],
  },
  selectedDeals: new Set(),
  registration: {
    phone: '',
    otpVerified: false,
    resendSeconds: 0,
    resendTimer: null,
    countryCode: '+91'
  },
  isAuthenticated: false,
};

const DEAL_STATUS_LABELS = {
  draft: 'Draft',
  pending_approval: 'Pending Approval',
  active: 'Active',
  paused: 'Paused',
  rejected: 'Rejected',
  expired: 'Expired'
};

const DEAL_STATUS_BADGES = {
  draft: 'badge bg-secondary',
  pending_approval: 'badge bg-warning text-dark',
  active: 'badge bg-success',
  paused: 'badge bg-orange text-white',
  rejected: 'badge bg-danger',
  expired: 'badge bg-secondary text-muted',
  default: 'badge bg-secondary'
};

const DEAL_SCHEDULE_LABELS = {
  upcoming: 'Upcoming',
  live: 'Live',
  expired: 'Expired'
};

const DEAL_SCHEDULE_BADGES = {
  upcoming: 'badge bg-info',
  live: 'badge bg-success',
  expired: 'badge bg-secondary',
  default: 'badge bg-secondary'
};

const DEAL_STATUS_PERMISSIONS = {
  draft: { approve: false, reject: false, pause: false, promote: false, edit: true },
  pending_approval: { approve: true, reject: true, pause: false, promote: false, edit: true },
  active: { approve: false, reject: false, pause: true, promote: true, edit: true }, // Active deals can only be paused, not rejected
  paused: { approve: true, reject: true, pause: false, promote: true, edit: true },
  rejected: { approve: true, reject: false, pause: false, promote: false, edit: true }, // Rejected deals can be re-approved
  expired: { approve: false, reject: false, pause: false, promote: false, edit: false },
  default: { approve: false, reject: true, pause: false, promote: false, edit: true }
};

const DEAL_STATUS_FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'pending_approval', label: 'Pending Approval' },
  { value: 'active', label: 'Active' },
  { value: 'paused', label: 'Paused' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'expired', label: 'Expired' }
];

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString();
}

function $(selector) {
  return document.querySelector(selector);
}

function $all(selector) {
  return Array.from(document.querySelectorAll(selector));
}

function showNotification(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `admin-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('visible'));
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 200);
  }, 3200);
}

function getHeaders() {
  const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function switchSection(targetId) {
  // Check if we have a token - if yes, allow navigation (auth will be verified on API calls)
  const token = localStorage.getItem('adminToken') || localStorage.getItem('token');
  if (!token) {
    console.warn('[Admin] No token found, showing login modal.');
    showLoginModal();
    return;
  }
  
  // If we have a token but auth state is not set, verify it in background (don't block)
  if (!state.isAuthenticated && token) {
    // Verify auth in background, but don't block navigation
    checkAuth().catch(err => {
      console.error('[Admin] Background auth check failed:', err);
      // Only show login if token is actually invalid
      if (err.message?.includes('401') || err.message?.includes('403')) {
        showLoginModal();
      }
    });
  }
  
  state.sections.forEach((sectionId) => {
    const section = document.getElementById(sectionId);
    if (section) section.classList.toggle('visible', sectionId === targetId);
  });
  $all('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.target === targetId);
  });

  if (targetId === 'dashboardSection') loadDashboard();
  if (targetId === 'usersSection') loadUsers();
  if (targetId === 'partnersSection') loadPartners();
  if (targetId === 'dealsSection') loadDeals();
  if (targetId === 'bookingsSection') {
    loadBookings();
    loadBookingStats();
  }
  if (targetId === 'analyticsSection') loadAdminAnalytics();
  if (targetId === 'activitySection') loadActivity();
  if (targetId === 'systemHealthSection') loadSystemHealth();
  if (targetId === 'settingsSection') loadSettings();
}

async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(url, { headers: getHeaders(), ...options });
    if (!response.ok) {
      // Handle authentication errors gracefully
      if (response.status === 401 || response.status === 403) {
        console.warn('[Admin] Authentication failed, clearing token and showing login.');
        state.isAuthenticated = false;
        localStorage.removeItem('token');
        localStorage.removeItem('adminToken');
        // Only show login modal if we're not already showing it
        const modal = $('#modal');
        if (!modal || modal.classList.contains('hidden')) {
          showLoginModal();
        }
        const errorText = await response.text();
        throw new Error('Authentication required. Please login again.');
      }
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }
    return await response.json();
  } catch (error) {
    // Don't log network errors as errors if they're auth-related (already handled above)
    if (!error.message?.includes('Authentication required')) {
      console.error('Fetch error:', error);
    }
    throw error;
  }
}

function normalizeDashboardData(raw = {}) {
  const users = raw.users || {};
  const partners = raw.partners || {};
  const deals = raw.deals || {};
  const revenue = raw.revenue || {};

  return {
    total_users: Number(users.total ?? raw.total_users ?? 0),
    new_users_today: Number(users.new_today ?? raw.new_users_today ?? 0),
    active_sessions: Number(users.active_sessions ?? raw.active_sessions ?? 0),
    total_partners: Number(partners.total ?? raw.total_partners ?? 0),
    pending_partners: Number(partners.pending ?? raw.pending_partners ?? 0),
    total_deals: Number(deals.total ?? raw.total_deals ?? 0),
    active_deals: Number(deals.active ?? raw.active_deals ?? 0),
    promoted_deals: Number(deals.promoted ?? raw.promoted_deals ?? 0),
    total_revenue: Number(revenue.total ?? raw.total_revenue ?? 0),
    revenue_chart: revenue.chart || raw.revenue_chart || [],
    recent_activity: raw.recent_activity || [],
    last_login: raw.last_login || null
  };
}

async function loadDashboard() {
  const dashboardCards = document.getElementById('dashboardCards');
  dashboardCards.innerHTML = '<div class="card muted">Loading dashboard…</div>';
  try {
    const response = await fetchJSON(`${API_BASE}/api/v1/admin/dashboard`);
    const summary = normalizeDashboardData(response?.data || {});
    renderDashboardCards(summary);
    renderRecentActivity(summary.recent_activity || []);
    renderRevenueChart(summary.revenue_chart || []);
    if (summary.last_login) {
      $('#adminLastLogin').textContent = `Last login: ${new Date(summary.last_login).toLocaleString()}`;
    }
    
    // Show/hide pending partners alert
    updatePendingPartnersAlert(summary.pending_partners || 0);
  } catch (error) {
    dashboardCards.innerHTML = `<div class="card error">Failed to load dashboard: ${error.message}</div>`;
  }
}

function updatePendingPartnersAlert(count) {
  const alert = $('#pendingPartnersAlert');
  const countEl = $('#pendingPartnersCount');
  
  if (!alert || !countEl) return;
  
  if (count > 0) {
    countEl.textContent = count;
    alert.classList.remove('hidden');
    
    // Store in localStorage to show on page load
    localStorage.setItem('pendingPartnersCount', count);
    localStorage.setItem('pendingPartnersAlertDismissed', 'false');
  } else {
    alert.classList.add('hidden');
    localStorage.removeItem('pendingPartnersCount');
  }
}

function formatCount(value, fallback = '—') {
  const num = Number(value);
  return Number.isFinite(num) ? num.toLocaleString('en-IN') : fallback;
}

function formatDelta(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '0';
  const sign = num >= 0 ? '+' : '−';
  return `${sign}${Math.abs(num).toLocaleString('en-IN')}`;
}

function formatCurrency(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return '₹0';
  return `₹${num.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
}

function renderDashboardCards(data) {
  const cards = [
    { label: 'Users', icon: '👥', primary: formatCount(data.total_users), meta: `${formatDelta(data.new_users_today)} today` },
    { label: 'Partners', icon: '🏢', primary: formatCount(data.total_partners), meta: `${formatCount(data.pending_partners, '0')} pending` },
    { label: 'Deals', icon: '🎫', primary: formatCount(data.total_deals), meta: `${formatCount(data.active_deals, '0')} active` },
    { label: 'Revenue', icon: '💰', primary: formatCurrency(data.total_revenue), meta: 'This period' },
    { label: 'Featured Deals', icon: '⭐', primary: formatCount(data.promoted_deals), meta: 'Live now' },
    { label: 'Sessions', icon: '📊', primary: formatCount(data.active_sessions), meta: 'Active now' },
  ];
  $('#dashboardCards').innerHTML = cards.map((card) => `
    <div class="card stat-card">
      <div class="stat-icon">${card.icon}</div>
      <div class="stat-content">
        <div class="stat-value">${card.primary}</div>
        <div class="stat-label">${card.label}</div>
        <div class="stat-meta">${card.meta}</div>
      </div>
    </div>`).join('');
}

function renderRecentActivity(activity) {
  const list = $('#recentActivity');
  if (!activity.length) {
    list.innerHTML = '<li class="muted">No recent activity.</li>';
    return;
  }
  list.innerHTML = activity.map((item) => {
    // Safely extract actor name - handle both string and object cases
    let actorName = 'System';
    if (item.actor) {
      if (typeof item.actor === 'string') {
        actorName = item.actor;
      } else if (typeof item.actor === 'object') {
        actorName = item.actor.name || item.actor.email || item.actor.first_name || 'System';
      }
    }
    
    const description = escapeHtml(item.description || `${item.type?.replace(/_/g, ' ')} event`);
    const actor = escapeHtml(actorName);
    const entity = item.entity ? escapeHtml(item.entity) : '';
    const actionLabel = escapeHtml(item.type?.replace(/_/g, ' ') || 'activity');
    const timestamp = new Date(item.timestamp).toLocaleString();

    const details = [];
    if (item.meta && typeof item.meta === 'object') {
      const meta = item.meta;
      if (meta.next && meta.previous) {
        const keys = ['is_trending', 'featured_request_pending', 'status'];
        keys.forEach((key) => {
          if (meta.next[key] !== undefined && meta.next[key] !== meta.previous[key]) {
            details.push(`${key.replace(/_/g, ' ')}: ${meta.previous[key]} → ${meta.next[key]}`);
          }
        });
      }
    }

    return `
      <li class="activity-item">
        <div class="activity-header">
          <span class="activity-badge">${actionLabel}</span>
          <span class="activity-time">${timestamp}</span>
        </div>
        <div class="activity-description">${description}</div>
        <div class="activity-meta">
          <span class="activity-actor">${actor}</span>
          ${entity ? `<span class="activity-entity">${entity}</span>` : ''}
        </div>
        ${details.length ? `<ul class="activity-details">${details.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>` : ''}
      </li>`;
  }).join('');
}

function renderRevenueChart(data) {
  const ctx = document.getElementById('revenueChart').getContext('2d');
  const dates = data.map((point) => new Date(point.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }));
  const values = data.map((point) => point.amount);

  if (state.charts.revenue) state.charts.revenue.destroy();
  state.charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates,
      datasets: [{
        label: 'Revenue',
        data: values,
        fill: true,
        borderColor: '#5E17EB',
        backgroundColor: 'rgba(94, 23, 235, 0.12)',
        tension: 0.35,
      }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: {
            callback: (value) => `₹${value.toLocaleString('en-IN')}`,
          },
        },
      },
    },
  });
}

async function loadUsers() {
  const { page, limit } = state.pagination.users;
  const { search, role, status, tier, sortBy } = state.filters.users;
  const params = new URLSearchParams({
    search,
    role,
    status,
    tier: tier || 'all',
    sortBy: sortBy || 'created',
    limit,
    offset: page * limit,
  });
  const table = $('#usersTable');
  table.innerHTML = '<tr><td colspan="9" class="muted">Loading users…</td></tr>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/users?${params.toString()}`);
    renderUsersTable(data.items || []);
    renderUsersPagination(data.total || 0);
  } catch (error) {
    table.innerHTML = `<tr><td colspan="9" class="error">Failed to load users: ${error.message}</td></tr>`;
  }
}

function renderUsersTable(users = []) {
  if (!users.length) {
    $('#usersTable').innerHTML = '<tr><td colspan="9" class="muted">No users found.</td></tr>';
    return;
  }
  
  const getTierBadgeColor = (tier) => {
    const colors = {
      'Ather': '#B0BEC5',
      'Nova': '#64B5F6',
      'Luminar': '#9575CD',
      'Valiant': '#66BB6A',
      'Echelon': '#FFD54F'
    };
    return colors[tier] || '#B0BEC5';
  };
  
  $('#usersTable').innerHTML = users.map((user) => {
    const tier = user.tier || 'Ather';
    const tierColor = getTierBadgeColor(tier);
    const tierPercentage = user.tier_percentage || 1;
    const annualSpend = user.annual_spend || 0;
    
    return `
    <tr>
      <td>${user.first_name || ''} ${user.last_name || ''}</td>
      <td>${user.email || '—'}</td>
      <td>${user.phone_number || '—'}</td>
      <td>${user.role || 'user'}</td>
      <td>
        <span class="badge" style="background-color: ${tierColor}; color: ${tier === 'Echelon' ? '#000' : '#fff'};">
          ${tier} (${tierPercentage}%)
        </span>
      </td>
      <td>₹${parseFloat(annualSpend).toLocaleString('en-IN')}</td>
      <td>${user.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-error">Inactive</span>'}</td>
      <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
      <td>
        <button class="btn btn-secondary btn-xs" data-user="${user.id}" data-action="viewUser">View</button>
        <button class="btn btn-primary btn-xs" data-user="${user.id}" data-action="viewRewards">Rewards</button>
        <button class="btn btn-secondary btn-xs" data-user="${user.id}" data-action="suspendUser">${user.is_active ? 'Suspend' : 'Activate'}</button>
      </td>
    </tr>`;
  }).join('');
}

function renderUsersPagination(total) {
  const { page, limit } = state.pagination.users;
  const totalPages = Math.ceil(total / limit);
  const container = $('#usersPagination');
  if (!totalPages) {
    container.innerHTML = '';
    return;
  }
  const buttons = [];
  for (let i = 0; i < totalPages; i += 1) {
    buttons.push(`<button class="${page === i ? 'active' : ''}" data-page="${i}">${i + 1}</button>`);
  }
  container.innerHTML = buttons.join('');
}

// Partner state
const partnerState = {
  search: '',
  sortBy: 'newest',
  selectedPartners: new Set()
};

async function loadPartners() {
  const status = state.filters.partners.status;
  const list = $('#partnersList');
  list.innerHTML = '<div class="card muted">Loading partners…</div>';
  
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/partners?status=${status}`);
    if (!data.length) {
      list.innerHTML = '<div class="card muted">No partners found.</div>';
      updatePartnerStats([]);
      updatePartnerBulkToolbar();
      return;
    }
    
    state.cache.partners = data;
    
    // Apply search filter
    let filteredPartners = data;
    if (partnerState.search) {
      const searchLower = partnerState.search.toLowerCase();
      filteredPartners = data.filter(p => 
        (p.name || '').toLowerCase().includes(searchLower) ||
        (p.email || '').toLowerCase().includes(searchLower) ||
        (p.business_name || '').toLowerCase().includes(searchLower) ||
        (p.address || '').toLowerCase().includes(searchLower)
      );
    }
    
    // Apply sorting
    filteredPartners = sortPartners(filteredPartners, partnerState.sortBy);
    
    // Update stats
    updatePartnerStats(data);
    
    // Render partner cards
    list.innerHTML = filteredPartners.map(renderPartnerCard).join('');
    
    // Update bulk actions toolbar
    updatePartnerBulkToolbar();
    
  } catch (error) {
    list.innerHTML = `<div class="card error">Failed to load partners: ${error.message}</div>`;
  }
}

function sortPartners(partners, sortBy) {
  const sorted = [...partners];
  switch (sortBy) {
    case 'newest':
      return sorted.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
    case 'oldest':
      return sorted.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    case 'priority':
      // Priority: pending > needs_info > approved > suspended
      const priority = { pending: 1, needs_info: 2, approved: 3, suspended: 4 };
      return sorted.sort((a, b) => (priority[a.status] || 5) - (priority[b.status] || 5));
    default:
      return sorted;
  }
}

function renderPartnerCard(partner) {
  const isSelected = partnerState.selectedPartners.has(partner.id);
  const isPending = partner.status === 'pending';
  
  return `
    <div class="card partner-card ${isSelected ? 'selected' : ''}" data-partner="${partner.id}">
      ${isPending ? `
        <div class="partner-selector">
          <input type="checkbox" 
                 class="partner-checkbox" 
                 data-id="${partner.id}" 
                 ${isSelected ? 'checked' : ''}>
        </div>
      ` : ''}
      <div class="partner-header">
        <h3>${escapeHtml(partner.name || partner.business_name || 'Unnamed Partner')}</h3>
        <div style="display: flex; gap: 0.5rem; align-items: center;">
          <span class="badge ${partner.status === 'approved' ? 'badge-success' : partner.status === 'pending' ? 'badge-warning' : 'badge-error'}">
            ${(partner.status || 'unknown').toUpperCase()}
          </span>
          ${partner.approved_for_featured 
            ? `<span class="badge badge-success" title="Approved for Featured/Trending content">⭐ Featured</span>`
            : ''}
        </div>
      </div>
      <div class="partner-meta">
        <div>📧 ${escapeHtml(partner.email || '—')}</div>
        <div>📞 ${escapeHtml(partner.phone_number || '—')}</div>
        <div>📍 ${escapeHtml(partner.address || '—')}</div>
      </div>
      <div class="partner-stats">
        <span>Tier: ${escapeHtml(partner.tier || 'Standard')}</span>
        <span>Active Deals: ${partner.active_deals || 0}</span>
        <span>Total Bookings: ${partner.total_bookings || 0}</span>
      </div>
      <div class="partner-actions">
        ${partner.status === 'pending'
          ? `<button class="btn btn-primary btn-xs" data-action="reviewPartner" data-id="${partner.id}">📋 Review</button>
             <button class="btn btn-success btn-xs" data-action="approvePartner" data-id="${partner.id}">✓ Quick Approve</button>
             <button class="btn btn-danger btn-xs" data-action="rejectPartner" data-id="${partner.id}">✗ Reject</button>`
          : `<button class="btn btn-primary btn-xs" data-action="reviewPartner" data-id="${partner.id}">📋 View Details</button>
             <button class="btn btn-secondary btn-xs" data-action="changeTier" data-id="${partner.id}">Change Tier</button>
             <button class="btn btn-secondary btn-xs" data-action="suspendPartner" data-id="${partner.id}">${partner.status === 'suspended' ? 'Activate' : 'Suspend'}</button>
             <button class="btn ${partner.approved_for_featured ? 'btn-warning' : 'btn-success'} btn-xs" data-action="toggleFeaturedEligibility" data-id="${partner.id}" title="${partner.approved_for_featured ? 'Revoke featured eligibility' : 'Approve for featured/trending content'}">
               ${partner.approved_for_featured ? '⭐ Revoke Featured' : '⭐ Approve Featured'}
             </button>`}
      </div>
    </div>
  `;
}

function updatePartnerStats(partners) {
  const total = partners.length;
  const pending = partners.filter(p => p.status === 'pending').length;
  const approved = partners.filter(p => p.status === 'approved').length;
  const featuredEligible = partners.filter(p => p.approved_for_featured).length;
  
  $('#totalPartners').textContent = total;
  $('#pendingPartners').textContent = pending;
  $('#approvedPartners').textContent = approved;
  $('#featuredEligiblePartners').textContent = featuredEligible;
}

function updatePartnerBulkToolbar() {
  const bulkApprove = $('#bulkApprovePartners');
  const bulkReject = $('#bulkRejectPartners');
  const selectedCount = partnerState.selectedPartners.size;
  
  if (bulkApprove && bulkReject) {
    if (selectedCount > 0) {
      bulkApprove.style.display = 'inline-block';
      bulkReject.style.display = 'inline-block';
      bulkApprove.textContent = `✓ Approve Selected (${selectedCount})`;
      bulkReject.textContent = `✗ Reject Selected (${selectedCount})`;
    } else {
      bulkApprove.style.display = 'none';
      bulkReject.style.display = 'none';
    }
  }
}

function handlePartnerCheckboxChange(partnerId, checked) {
  if (checked) {
    partnerState.selectedPartners.add(partnerId);
  } else {
    partnerState.selectedPartners.delete(partnerId);
  }
  updatePartnerBulkToolbar();
  
  // Update card visual state
  const card = document.querySelector(`.partner-card[data-partner="${partnerId}"]`);
  if (card) {
    card.classList.toggle('selected', checked);
  }
}

// ============================================
// PARTNER REVIEW MODAL
// ============================================

let currentReviewPartnerId = null;
let currentReviewDecisionType = null;

async function showPartnerReviewModal(partnerId) {
  try {
    // Fetch partner details
    const { data } = await fetchJSON(`${API_BASE}/api/v1/partners/${partnerId}`);
    
    if (!data) {
      showNotification('Partner not found.', 'error');
      return;
    }
    
    currentReviewPartnerId = partnerId;
    
    // Populate basic information
    $('#reviewPartnerName').textContent = data.business_name || data.name || 'Unnamed Partner';
    $('#reviewPartnerStatus').textContent = (data.status || 'unknown').toUpperCase();
    $('#reviewPartnerStatus').className = `partner-review-status badge ${
      data.status === 'approved' ? 'badge-success' : 
      data.status === 'pending' ? 'badge-warning' : 
      'badge-error'
    }`;
    
    $('#reviewAppliedDate').textContent = formatDate(data.created_at);
    $('#reviewPriority').textContent = data.status === 'pending' ? 'High' : 'Normal';
    
    // Info Tab
    $('#reviewBusinessName').textContent = data.business_name || data.name || '—';
    $('#reviewCategory').textContent = data.category || '—';
    $('#reviewAddress').textContent = data.address || '—';
    $('#reviewCity').textContent = data.city || '—';
    $('#reviewState').textContent = data.state || '—';
    $('#reviewContactPerson').textContent = data.contact_person || data.name || '—';
    $('#reviewEmail').textContent = data.email || '—';
    $('#reviewPhone').textContent = data.phone || data.phone_number || '—';
    $('#reviewWebsite').textContent = data.website || '—';
    $('#reviewGST').textContent = data.gst_number || '—';
    $('#reviewPAN').textContent = data.pan_number || '—';
    $('#reviewBankAccount').textContent = data.bank_account_number || '—';
    $('#reviewIFSC').textContent = data.ifsc_code || '—';
    $('#reviewDescription').textContent = data.description || 'No description provided.';
    
    // Documents Tab (placeholder - would need backend support)
    $('#reviewDocumentsList').innerHTML = `
      <div class="muted" style="padding: 2rem; text-align: center;">
        <p>Document management feature coming soon.</p>
        <p style="font-size: 0.875rem;">Documents will be reviewed manually for now.</p>
      </div>
    `;
    
    // History Tab (placeholder - would need audit log)
    $('#reviewActivityTimeline').innerHTML = `
      <div class="timeline-item">
        <div class="timeline-marker"></div>
        <div class="timeline-content">
          <div class="timeline-time">${formatDate(data.created_at)}</div>
          <div class="timeline-text">Partner application submitted</div>
        </div>
      </div>
      ${data.updated_at && data.updated_at !== data.created_at ? `
        <div class="timeline-item">
          <div class="timeline-marker"></div>
          <div class="timeline-content">
            <div class="timeline-time">${formatDate(data.updated_at)}</div>
            <div class="timeline-text">Partner information updated</div>
          </div>
        </div>
      ` : ''}
    `;
    
    // Reset checklist
    resetVerificationChecklist();
    
    // Hide decision form
    $('#reviewDecisionForm').classList.add('hidden');
    
    // Show/hide action buttons based on status
    const approveBtn = $('#reviewApprove');
    const rejectBtn = $('#reviewReject');
    
    if (data.status === 'pending') {
      approveBtn.style.display = 'inline-block';
      rejectBtn.style.display = 'inline-block';
    } else {
      approveBtn.style.display = 'none';
      rejectBtn.style.display = data.status === 'approved' ? 'none' : 'inline-block';
    }
    
    // Show modal
    $('#partnerReviewModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading partner review:', error);
    showNotification(`Failed to load partner details: ${error.message}`, 'error');
  }
}

function closePartnerReviewModal() {
  $('#partnerReviewModal').classList.add('hidden');
  currentReviewPartnerId = null;
  currentReviewDecisionType = null;
  $('#reviewDecisionForm').classList.add('hidden');
  $('#decisionReason').value = '';
}

function switchReviewTab(tabName) {
  // Update tab buttons
  $all('.review-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });
  
  // Update tab content
  $all('.review-tab-content').forEach(content => {
    content.classList.remove('active');
  });
  
  const targetContent = $(`#reviewTab${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`);
  if (targetContent) {
    targetContent.classList.add('active');
  }
}

function resetVerificationChecklist() {
  $all('.checklist-checkbox').forEach(checkbox => {
    checkbox.checked = false;
  });
  updateChecklistProgress();
}

function updateChecklistProgress() {
  const checkboxes = $all('.checklist-checkbox');
  const total = checkboxes.length;
  const completed = Array.from(checkboxes).filter(cb => cb.checked).length;
  const percentage = total > 0 ? (completed / total) * 100 : 0;
  
  $('#checklistProgress').style.width = `${percentage}%`;
  $('#checklistCompleted').textContent = completed;
}

function showReviewDecisionForm(type) {
  currentReviewDecisionType = type;
  
  const form = $('#reviewDecisionForm');
  const title = $('#decisionFormTitle');
  
  if (type === 'approve') {
    title.textContent = 'Approve Partner';
    $('#decisionReason').placeholder = 'Optional: Add approval notes or instructions for the partner...';
  } else {
    title.textContent = 'Reject Partner';
    $('#decisionReason').placeholder = 'Required: Explain why this partner application is being rejected...';
  }
  
  form.classList.remove('hidden');
  $('#decisionReason').focus();
}

async function submitPartnerDecision() {
  if (!currentReviewPartnerId || !currentReviewDecisionType) return;
  
  const reason = $('#decisionReason').value.trim();
  
  if (currentReviewDecisionType === 'reject' && !reason) {
    showNotification('Please provide a reason for rejection.', 'error');
    return;
  }
  
  try {
    const action = currentReviewDecisionType === 'approve' ? 'approve' : 'reject';
    
    await fetchJSON(`${API_BASE}/api/v1/admin/partners/${currentReviewPartnerId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ action, reason })
    });
    
    showNotification(
      `Partner ${action === 'approve' ? 'approved' : 'rejected'} successfully.`,
      'success'
    );
    
    closePartnerReviewModal();
    loadPartners();
    
    // Refresh dashboard if on dashboard
    if ($('#dashboardSection')?.classList.contains('visible')) {
      loadDashboard();
    }
    
  } catch (error) {
    console.error('Partner decision error:', error);
    showNotification(`Failed to ${currentReviewDecisionType} partner: ${error.message}`, 'error');
  }
}

async function bulkApprovePartners() {
  if (partnerState.selectedPartners.size === 0) {
    showNotification('No partners selected.', 'warning');
    return;
  }
  
  const count = partnerState.selectedPartners.size;
  const confirmed = confirm(`Are you sure you want to approve ${count} partner(s)?`);
  
  if (!confirmed) return;
  
  try {
    const ids = Array.from(partnerState.selectedPartners);
    
    await fetchJSON(`${API_BASE}/api/v1/admin/partners/bulk-approve`, {
      method: 'POST',
      body: JSON.stringify({ ids })
    });
    
    showNotification(`${count} partner(s) approved successfully.`, 'success');
    
    // Clear selection
    partnerState.selectedPartners.clear();
    
    // Reload partners
    loadPartners();
    
    // Refresh dashboard
    if ($('#dashboardSection')?.classList.contains('visible')) {
      loadDashboard();
    }
    
  } catch (error) {
    console.error('Bulk approve error:', error);
    showNotification(`Failed to approve partners: ${error.message}`, 'error');
  }
}

async function bulkRejectPartners() {
  if (partnerState.selectedPartners.size === 0) {
    showNotification('No partners selected.', 'warning');
    return;
  }
  
  const count = partnerState.selectedPartners.size;
  const reason = prompt(`Please provide a reason for rejecting ${count} partner(s):`);
  
  if (reason === null) return; // User cancelled
  
  if (!reason.trim()) {
    showNotification('Please provide a reason for rejection.', 'error');
    return;
  }
  
  try {
    const ids = Array.from(partnerState.selectedPartners);
    
    // We'll need to loop through each one since bulk reject might not exist yet
    let successCount = 0;
    let errorCount = 0;
    
    for (const id of ids) {
      try {
        await fetchJSON(`${API_BASE}/api/v1/admin/partners/${id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ action: 'reject', reason: reason.trim() })
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to reject partner ${id}:`, error);
        errorCount++;
      }
    }
    
    if (successCount > 0) {
      showNotification(`${successCount} partner(s) rejected successfully.`, 'success');
    }
    
    if (errorCount > 0) {
      showNotification(`Failed to reject ${errorCount} partner(s).`, 'error');
    }
    
    // Clear selection
    partnerState.selectedPartners.clear();
    
    // Reload partners
    loadPartners();
    
    // Refresh dashboard
    if ($('#dashboardSection')?.classList.contains('visible')) {
      loadDashboard();
    }
    
  } catch (error) {
    console.error('Bulk reject error:', error);
    showNotification(`Failed to reject partners: ${error.message}`, 'error');
  }
}

// Make functions globally accessible
window.showPartnerReviewModal = showPartnerReviewModal;
window.closePartnerReviewModal = closePartnerReviewModal;

async function loadDeals() {
  const list = $('#dealsList');
  const dealsSection = $('#dealsSection') || document.body;
  ensureDealBulkUI(dealsSection);

  if (!list) {
    console.warn('[Admin] Missing #dealsList container in DOM. Creating fallback element.');
    const fallback = document.createElement('div');
    fallback.id = 'dealsList';
    fallback.className = 'card-list';
    dealsSection.appendChild(fallback);
    fallback.addEventListener('click', handleDealAction);
    state.cache.deals = [];
    state.selectedDeals.clear();
    updateDealBulkToolbar();
    return;
  }

  list.innerHTML = '<div class="card muted">Loading deals…</div>';
  const { search, status, promo } = state.filters.deals;
  const params = new URLSearchParams({ search, status, promo });
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/deals?${params.toString()}`);
    if (!data.length) {
      state.cache.deals = [];
      state.selectedDeals.clear();
      updateDealBulkToolbar();
      list.innerHTML = '<div class="card muted">No deals found.</div>';
      return;
    }

    state.cache.deals = data;
    const visibleIds = new Set(data.map((deal) => deal.id));
    state.selectedDeals = new Set([...state.selectedDeals].filter((id) => visibleIds.has(id)));

    list.innerHTML = data.map(renderDealCard).join('');
    syncDealSelections();
  } catch (error) {
    list.innerHTML = `<div class="card error">Failed to load deals: ${error.message}</div>`;
  }
}

function ensureDealBulkUI(container) {
  let toolbar = $('#dealBulkActions');
  if (toolbar) return toolbar;

  toolbar = document.createElement('div');
  toolbar.id = 'dealBulkActions';
  toolbar.className = 'bulk-actions hidden';
  toolbar.innerHTML = `
    <div class="bulk-info">
      <label class="select-all">
        <input type="checkbox" id="selectAllDeals">
        <span>Select All</span>
      </label>
      <span id="selectedDealCount" class="muted">No deals selected</span>
    </div>
    <div class="button-group">
      <button class="btn btn-primary btn-xs" id="bulkApproveDealsBtn" disabled>Approve Selected</button>
      <button class="btn btn-secondary btn-xs" id="bulkRejectDealsBtn" disabled>Reject Selected</button>
    </div>
  `;
  container?.prepend(toolbar);
  toolbar.addEventListener('click', (event) => {
    if (event.target.id === 'bulkApproveDealsBtn') {
      handleBulkDealAction('approve');
    } else if (event.target.id === 'bulkRejectDealsBtn') {
      handleBulkDealAction('reject');
    }
  });
  toolbar.addEventListener('change', (event) => {
    if (event.target.id === 'selectAllDeals') {
      handleSelectAllDeals(event.target.checked);
    }
  });
  return toolbar;
}

function renderDealCard(deal) {
  const isTrending = Boolean(deal.is_trending || deal.is_promoted);
  const statusLabel = DEAL_STATUS_LABELS[deal.status] || (deal.status || 'Unknown').toUpperCase();
  const statusClass = DEAL_STATUS_BADGES[deal.status] || DEAL_STATUS_BADGES.default;
  const scheduleLabel = DEAL_SCHEDULE_LABELS[deal.schedule_status] || (deal.schedule_status || 'Unknown');
  const scheduleClass = DEAL_SCHEDULE_BADGES[deal.schedule_status] || DEAL_SCHEDULE_BADGES.default;
  const trendingBadge = isTrending ? '<span class="badge badge-accent">Trending</span>' : '';
  const pendingTrendingBadge = deal.featured_request_pending ? '<span class="badge bg-warning text-dark">Pending Trending</span>' : '';
  const perms = DEAL_STATUS_PERMISSIONS[deal.status] || DEAL_STATUS_PERMISSIONS.default;
  
  // Disable trending/promotion actions for inactive deals (rejected, expired, draft, pending)
  const canPromote = deal.status === 'active' || deal.status === 'paused';
  const disableTrendingActions = deal.status === 'expired' || !canPromote;

  const approveBtn = `<button class="btn btn-primary btn-xs ${perms.approve ? '' : 'disabled'}" data-action="approveDeal" data-id="${deal.id}" data-partner="${deal.partner_id}" ${perms.approve ? '' : 'disabled'}>Approve</button>`;
  const rejectBtn = `<button class="btn btn-secondary btn-xs ${perms.reject ? '' : 'disabled'}" data-action="rejectDeal" data-id="${deal.id}" data-partner="${deal.partner_id}" ${perms.reject ? '' : 'disabled'}>Reject</button>`;
  const pauseBtn = `<button class="btn btn-secondary btn-xs ${perms.pause ? '' : 'disabled'}" data-action="pauseDeal" data-id="${deal.id}" data-partner="${deal.partner_id}" ${perms.pause ? '' : 'disabled'}>${deal.status === 'paused' ? 'Resume' : 'Pause'}</button>`;
  
  const trendingActions = deal.featured_request_pending
    ? `
      <p class="muted" style="margin:0 0 0.5rem;">Partner requested Trending placement.</p>
      <div class="button-group">
        <button class="btn btn-primary btn-xs ${disableTrendingActions ? 'disabled' : ''}" data-action="approveTrending" data-id="${deal.id}" ${disableTrendingActions ? 'disabled' : ''}>Approve Trending</button>
        <button class="btn btn-secondary btn-xs ${disableTrendingActions ? 'disabled' : ''}" data-action="rejectTrending" data-id="${deal.id}" ${disableTrendingActions ? 'disabled' : ''}>Reject Request</button>
      </div>
    `
    : `<button class="btn btn-secondary btn-xs ${disableTrendingActions ? 'disabled' : ''}" data-action="${isTrending ? 'unpromoteDeal' : 'promoteDeal'}" data-id="${deal.id}" data-partner="${deal.partner_id}" ${disableTrendingActions ? 'disabled' : ''}>
         ${isTrending ? 'Remove from Trending' : 'Set as Trending'}
       </button>`;

  // Add 'approved' class for inverse styling when deal is active
  const isApproved = deal.status === 'active';
  const cardClass = `card deal-card ${isApproved ? 'deal-approved' : ''}`;
  
  return `
    <div class="${cardClass}" data-deal="${deal.id}">
      <div class="deal-header">
        <label class="deal-select-wrapper">
          <input type="checkbox" class="deal-select" data-id="${deal.id}" ${state.selectedDeals.has(deal.id) ? 'checked' : ''}>
        </label>
        <div class="deal-title">
          <h3>${deal.title}</h3>
          <span class="muted">by ${deal.partner_name || 'Unknown partner'}</span>
        </div>
        <div class="deal-badges">
          <span class="${statusClass}">${statusLabel}</span>
          <span class="${scheduleClass}">${scheduleLabel}</span>
          ${trendingBadge}
          ${pendingTrendingBadge}
        </div>
      </div>
      <div class="deal-meta">
        <div>💰 ${deal.original_price ? `₹${Number(deal.original_price).toLocaleString('en-IN')} → ` : ''}₹${Number(deal.discounted_price || 0).toLocaleString('en-IN')}</div>
        <div>📅 ${formatDateTime(deal.start_date)} – ${formatDateTime(deal.end_date)}</div>
        <div>🎟️ Max: ${deal.max_redemptions || 'Unlimited'} | Used: ${deal.current_redemptions || 0}</div>
      </div>
      <div class="deal-actions">
        <div class="button-group">
          ${approveBtn}
          ${rejectBtn}
          ${pauseBtn}
          <button class="btn btn-secondary btn-xs" data-action="viewDeal" data-id="${deal.id}" data-partner="${deal.partner_id}">View</button>
        </div>
        <div class="button-group">
          ${trendingActions}
        </div>
      </div>
    </div>
  `;
}

function syncDealSelections() {
  $all('.deal-select').forEach((checkbox) => {
    checkbox.checked = state.selectedDeals.has(checkbox.dataset.id);
  });
  updateDealBulkToolbar();
}

function updateDealBulkToolbar() {
  const toolbar = $('#dealBulkActions');
  if (!toolbar) return;
  const count = state.selectedDeals.size;
  const approveBtn = $('#bulkApproveDealsBtn');
  const rejectBtn = $('#bulkRejectDealsBtn');
  const countLabel = $('#selectedDealCount');
  const selectAll = $('#selectAllDeals');
  const totalDeals = state.cache.deals.length;

  toolbar.classList.toggle('hidden', totalDeals === 0);

  if (approveBtn) approveBtn.disabled = count === 0;
  if (rejectBtn) rejectBtn.disabled = count === 0;
  if (countLabel) {
    countLabel.textContent = count ? `${count} selected` : 'No deals selected';
  }
  if (selectAll) {
    if (totalDeals === 0) {
      selectAll.checked = false;
      selectAll.indeterminate = false;
    } else {
      selectAll.checked = count > 0 && count === totalDeals;
      selectAll.indeterminate = count > 0 && count < totalDeals;
    }
  }
}

function handleSelectAllDeals(checked) {
  if (!state.cache.deals.length) return;
  if (checked) {
    state.cache.deals.forEach((deal) => state.selectedDeals.add(deal.id));
  } else {
    state.selectedDeals.clear();
  }
  syncDealSelections();
}

function handleDealSelectionChange(dealId, checked) {
  if (!dealId) return;
  if (checked) {
    state.selectedDeals.add(dealId);
  } else {
    state.selectedDeals.delete(dealId);
  }
  updateDealBulkToolbar();
}

async function handleBulkDealAction(action) {
  const ids = Array.from(state.selectedDeals);
  if (!ids.length) return;

  // Filter out deals that are already in the target state
  const deals = state.cache.deals || [];
  const validIds = [];
  const skippedIds = [];
  
  ids.forEach(id => {
    const deal = deals.find(d => d.id === id);
    if (!deal) {
      validIds.push(id); // Let backend handle missing deals
      return;
    }
    
    // Skip deals that are already in the target state
    if (action === 'approve' && deal.status === 'active') {
      skippedIds.push({ id, reason: 'Deal is already active' });
    } else if (action === 'reject' && deal.status === 'rejected') {
      skippedIds.push({ id, reason: 'Deal is already rejected' });
    } else {
      validIds.push(id);
    }
  });

  // Show warning if some deals were skipped
  if (skippedIds.length > 0) {
    const skippedSummary = skippedIds.map(s => s.reason).join(', ');
    showNotification(`${skippedIds.length} deal(s) skipped: ${skippedSummary}`, 'warning');
  }

  // If no valid deals remain, return early
  if (validIds.length === 0) {
    if (skippedIds.length > 0) {
      state.selectedDeals.clear();
      updateDealBulkToolbar();
    }
    return;
  }

  const endpoint = action === 'approve'
    ? `${API_BASE}/api/v1/admin/deals/bulk-approve`
    : `${API_BASE}/api/v1/admin/deals/bulk-reject`;

  try {
    const result = await fetchJSON(endpoint, {
      method: 'POST',
      body: JSON.stringify({ ids: validIds })
    });

    const succeeded = result?.succeeded || [];
    const failed = result?.failed || [];

    if (succeeded.length) {
      showNotification(`${succeeded.length} deal(s) ${action === 'approve' ? 'approved' : 'rejected'}.`);
    }

    if (failed.length) {
      const reasonSummary = failed.map((entry) => `${entry.id}: ${entry.reason}`).join(', ');
      showNotification(`Failed to process ${failed.length} deal(s): ${reasonSummary}`, 'error');
    }
  } catch (error) {
    showNotification(`Bulk ${action} failed: ${error.message}`, 'error');
  } finally {
    state.selectedDeals.clear();
    updateDealBulkToolbar();
    loadDeals();
  }
}

async function loadAdminAnalytics() {
  const overview = $('#analyticsOverview');
  overview.innerHTML = '<div class="card muted">Loading analytics…</div>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/analytics?period=${state.filters.analyticsPeriod}`);
    const summary = data.summary || {};
    overview.innerHTML = `
      <div class="card stat-card">
        <div class="stat-value">₹${Number(summary.totalRevenue || 0).toLocaleString('en-IN')}</div>
        <div class="stat-label">Total Revenue</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">₹${Number(summary.totalRevenue || 0).toLocaleString('en-IN')}</div>
        <div class="stat-label">Platform Commission</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${summary.totalBookings || 0}</div>
        <div class="stat-label">Total Bookings</div>
      </div>
      <div class="card stat-card">
        <div class="stat-value">${summary.repeatCustomersPercent || 0}%</div>
        <div class="stat-label">Repeat Customers</div>
      </div>`;

    const topCategories = data.top_categories || [];
    const topPartners = data.top_partners || [];
    $('#topCategories').innerHTML = topCategories.length
      ? topCategories.map((c) => `<li><span>${c.category || '—'}</span><strong>₹${Number(c.revenue || 0).toLocaleString('en-IN')}</strong></li>`).join('')
      : '<li class="muted">Not enough data.</li>';
    $('#topPartners').innerHTML = topPartners.length
      ? topPartners.map((p) => `<li><span>${p.partner || '—'}</span><strong>₹${Number(p.revenue || 0).toLocaleString('en-IN')}</strong></li>`).join('')
      : '<li class="muted">Not enough data.</li>';
    
    // Load admin rewards overview
    loadAdminRewardsOverview();
  } catch (error) {
    overview.innerHTML = `<div class="card error">Failed to load analytics: ${error.message}</div>`;
  }
}

// Load admin rewards overview
async function loadAdminRewardsOverview() {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/rewards/overview`);
    
    // Update overview stats
    const totalEztCirculationEl = $('#totalEztCirculation');
    if (totalEztCirculationEl) {
      totalEztCirculationEl.textContent = (data.total_ezt_in_circulation || 0).toFixed(2) + ' EZT';
    }
    
    const totalEztEarnedEl = $('#totalEztEarned');
    if (totalEztEarnedEl) {
      totalEztEarnedEl.textContent = (data.total_ezt_earned || 0).toFixed(2) + ' EZT';
    }
    
    const totalEztRedeemedEl = $('#totalEztRedeemed');
    if (totalEztRedeemedEl) {
      totalEztRedeemedEl.textContent = (data.total_ezt_redeemed || 0).toFixed(2) + ' EZT';
    }
    
    // Render tier distribution
    renderTierDistribution(data.tier_distribution || {});
    
    // Render recent transactions
    renderRecentEztTransactions(data.recent_transactions || []);
    
    // Render recent tier upgrades
    renderRecentTierUpgrades(data.recent_upgrades || []);
  } catch (error) {
    console.error('Error loading admin rewards overview:', error);
  }
}

function renderTierDistribution(distribution) {
  const container = $('#tierDistribution');
  if (!container) return;
  
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  
  if (total === 0) {
    container.innerHTML = '<p class="muted">No tier data available.</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 8px;">
      ${Object.entries(distribution).map(([tier, count]) => {
        const percentage = (count / total * 100).toFixed(1);
        return `
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="min-width: 80px; font-weight: 500;">${tier}</div>
            <div style="flex: 1; height: 20px; background: var(--bg); border-radius: 4px; overflow: hidden;">
              <div style="height: 100%; width: ${percentage}%; background: var(--primary); transition: width 0.3s;"></div>
            </div>
            <div style="min-width: 80px; text-align: right; font-size: 0.875rem; color: var(--text-muted);">
              ${count} (${percentage}%)
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderRecentEztTransactions(transactions) {
  const container = $('#recentEztTransactions');
  if (!container) return;
  
  if (transactions.length === 0) {
    container.innerHTML = '<p class="muted">No transactions yet.</p>';
    return;
  }
  
  container.innerHTML = `
    <table class="table" style="font-size: 0.875rem;">
      <thead>
        <tr>
          <th>User</th>
          <th>Type</th>
          <th>Amount</th>
          <th>Balance</th>
          <th>Date</th>
        </tr>
      </thead>
      <tbody>
        ${transactions.map(tx => `
          <tr>
            <td>${tx.user_name || 'Unknown'}<br><small class="muted">${tx.user_phone || ''}</small></td>
            <td><span class="badge ${tx.transaction_type === 'earned' ? 'success' : 'warning'}">${tx.transaction_type || 'unknown'}</span></td>
            <td class="${tx.amount > 0 ? 'positive' : 'negative'}" style="font-weight: 600;">
              ${tx.amount > 0 ? '+' : ''}${tx.amount.toFixed(5)} EZT
            </td>
            <td>${tx.balance_after.toFixed(5)} EZT</td>
            <td><small>${new Date(tx.created_at).toLocaleString('en-IN')}</small></td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

function renderRecentTierUpgrades(upgrades) {
  const container = $('#recentTierUpgrades');
  if (!container) return;
  
  if (upgrades.length === 0) {
    container.innerHTML = '<p class="muted">No tier upgrades yet.</p>';
    return;
  }
  
  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 12px;">
      ${upgrades.map(upgrade => `
        <div style="padding: 12px; background: var(--bg); border-radius: 8px; border: 1px solid var(--border);">
          <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
            <div>
              <div style="font-weight: 600; margin-bottom: 4px;">${upgrade.user_name || 'Unknown'}</div>
              <div style="font-size: 0.75rem; color: var(--text-muted);">${upgrade.user_phone || ''}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="badge" style="background: var(--bg);">${upgrade.from_tier}</span>
              <span style="color: var(--text-muted);">→</span>
              <span class="badge success">${upgrade.to_tier}</span>
            </div>
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-muted);">
            <span>₹${upgrade.total_spending.toLocaleString('en-IN')} spent</span>
            <span>${new Date(upgrade.upgraded_at).toLocaleDateString('en-IN')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function loadActivity() {
  const list = $('#activityList');
  list.innerHTML = '<li class="muted">Loading activity…</li>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/activity?type=${$('#activityFilter').value}`);
    if (!data.length) {
      list.innerHTML = '<li class="muted">No activity yet.</li>';
      return;
    }
    list.innerHTML = data.map((entry) => {
      // Safely extract actor name
      let actorName = 'System';
      if (entry.actor) {
        if (typeof entry.actor === 'string') {
          actorName = entry.actor;
        } else if (typeof entry.actor === 'object') {
          actorName = entry.actor.name || entry.actor.email || entry.actor.first_name || 'System';
        }
      }

      // Format meta for display - show only meaningful changes
      let metaDisplay = '';
      if (entry.meta) {
        if (typeof entry.meta === 'string') {
          metaDisplay = entry.meta;
        } else if (typeof entry.meta === 'object') {
          const metaParts = [];
          const meta = entry.meta;
          
          // Check for changes in next/previous structure
          if (meta.next && meta.previous) {
            // Check is_trending changes
            if (meta.next.is_trending !== undefined && meta.previous.is_trending !== undefined) {
              if (meta.next.is_trending !== meta.previous.is_trending) {
                metaParts.push(`Trending: ${meta.previous.is_trending ? 'Yes' : 'No'} → ${meta.next.is_trending ? 'Yes' : 'No'}`);
              }
            }
            // Backward compatibility: also check is_promoted if present
            if (meta.next.is_promoted !== undefined && meta.previous.is_promoted !== undefined) {
              if (meta.next.is_promoted !== meta.previous.is_promoted) {
                metaParts.push(`Trending: ${meta.previous.is_promoted ? 'Yes' : 'No'} → ${meta.next.is_promoted ? 'Yes' : 'No'}`);
              }
            }
            
            // Check featured_request_pending changes
            if (meta.next.featured_request_pending !== undefined && meta.previous.featured_request_pending !== undefined) {
              if (meta.next.featured_request_pending !== meta.previous.featured_request_pending) {
                metaParts.push(`Featured Request: ${meta.previous.featured_request_pending ? 'Pending' : 'None'} → ${meta.next.featured_request_pending ? 'Pending' : 'None'}`);
              }
            }
            
            // Check status changes
            if (meta.next.status !== undefined && meta.previous.status !== undefined) {
              if (meta.next.status !== meta.previous.status) {
                metaParts.push(`Status: ${meta.previous.status} → ${meta.next.status}`);
              }
            }
            
            // Check is_active changes
            if (meta.next.is_active !== undefined && meta.previous.is_active !== undefined) {
              if (meta.next.is_active !== meta.previous.is_active) {
                metaParts.push(`Active: ${meta.previous.is_active ? 'Yes' : 'No'} → ${meta.next.is_active ? 'Yes' : 'No'}`);
              }
            }
          }
          
          // For feature_toggle actions, provide context even if no changes detected
          if (entry.type === 'feature_toggle' && metaParts.length === 0) {
            const nextTrending = meta.next?.is_trending ?? meta.next?.is_promoted;
            const prevTrending = meta.previous?.is_trending ?? meta.previous?.is_promoted;
            if (nextTrending === false && prevTrending === false) {
              metaParts.push('Removed from trending');
            } else if (nextTrending === true) {
              metaParts.push('Added to trending');
            }
          }
          
          // Only show meta if there are meaningful changes
          if (metaParts.length > 0) {
            metaDisplay = metaParts.join(' • ');
          }
          // Don't show raw JSON - it's not user-friendly
        }
      }

      const actionLabel = escapeHtml((entry.type || 'activity').replace(/_/g, ' '));
      const entityDisplay = escapeHtml(entry.entity || 'N/A');
      const actorDisplay = escapeHtml(actorName);
      const timeDisplay = new Date(entry.created_at).toLocaleString();
      
      // Use backend description if available, otherwise generate one
      const description = entry.description || `${actorDisplay} performed ${actionLabel} on ${entityDisplay}`;

      return `
      <li class="activity-item">
        <div class="activity-header">
          <span class="activity-badge">${actionLabel}</span>
          <span class="activity-time">${timeDisplay}</span>
        </div>
        <div class="activity-description">
          ${escapeHtml(description)}
        </div>
        ${metaDisplay ? `<div class="activity-meta">${escapeHtml(metaDisplay)}</div>` : ''}
      </li>`;
    }).join('');
  } catch (error) {
    list.innerHTML = `<li class="error">Failed to load activity: ${error.message}</li>`;
  }
}

async function loadSettings() {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/settings`);
    if (!data) return;
    $('#platformName').value = data.platform_name || 'Elizian';
    $('#defaultCommission').value = data.default_commission || 0;
    $('#promotedLimit').value = data.max_promoted || 12;
    $('#dealApprovalRequired').checked = data.deal_approval_required ?? true;
    $('#partnerAutoApproval').checked = data.partner_auto_approval ?? false;
    $('#loyaltyPoints').value = data.loyalty_points || 1;
    $('#loyaltyPerRupees').value = data.loyalty_rupees || 100;
  } catch (error) {
    showNotification(`Failed to load settings: ${error.message}`, 'error');
  }
}

async function saveSettings(event) {
  event.preventDefault();
  const payload = {
    platform_name: $('#platformName').value,
    default_commission: Number($('#defaultCommission').value),
    max_promoted: Number($('#promotedLimit').value),
    deal_approval_required: $('#dealApprovalRequired').checked,
    partner_auto_approval: $('#partnerAutoApproval').checked,
    loyalty_points: Number($('#loyaltyPoints').value),
    loyalty_rupees: Number($('#loyaltyPerRupees').value),
  };
  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/settings`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    showNotification('Settings saved successfully.');
  } catch (error) {
    showNotification(`Failed to save settings: ${error.message}`, 'error');
  }
}

// System Health Monitoring
async function loadSystemHealth() {
  console.log('📊 Loading system health...');
  
  // Simulate loading metrics (in production, these would come from backend APIs)
  updateServerStatus();
  updateDatabaseStatus();
  updateAPIHealth();
  updatePerformanceMetrics();
  loadEndpointsHealth();
  loadRecentErrors();
}

function updateServerStatus() {
  try {
    // Simulate server status check
    const serverStatusEl = $('#serverStatus');
    const serverUptimeEl = $('#serverUptime');
    
    // In production, this would call: GET /api/v1/admin/health/server
    const status = 'online'; // Mock data
    const uptimeHours = Math.floor(Math.random() * 168); // Mock uptime
    
    if (serverStatusEl) {
      serverStatusEl.innerHTML = `<span class="badge bg-success">✓ Online</span>`;
    }
    
    if (serverUptimeEl) {
      const days = Math.floor(uptimeHours / 24);
      const hours = uptimeHours % 24;
      serverUptimeEl.textContent = `Uptime: ${days}d ${hours}h`;
    }
  } catch (error) {
    console.error('Error updating server status:', error);
  }
}

function updateDatabaseStatus() {
  try {
    const databaseStatusEl = $('#databaseStatus');
    const databaseConnectionsEl = $('#databaseConnections');
    
    // In production: GET /api/v1/admin/health/database
    const isConnected = true;
    const activeConnections = Math.floor(Math.random() * 50) + 10;
    
    if (databaseStatusEl) {
      databaseStatusEl.innerHTML = isConnected ? 
        '<span class="badge bg-success">✓ Connected</span>' : 
        '<span class="badge bg-danger">✗ Disconnected</span>';
    }
    
    if (databaseConnectionsEl) {
      databaseConnectionsEl.textContent = `Active: ${activeConnections} / 100`;
    }
  } catch (error) {
    console.error('Error updating database status:', error);
  }
}

function updateAPIHealth() {
  try {
    const apiHealthEl = $('#apiHealth');
    const apiResponseTimeEl = $('#apiResponseTime');
    
    // In production: GET /api/v1/admin/health/api
    const avgResponseTime = Math.floor(Math.random() * 200) + 50;
    const isHealthy = avgResponseTime < 300;
    
    if (apiHealthEl) {
      apiHealthEl.innerHTML = isHealthy ? 
        '<span class="badge bg-success">✓ Healthy</span>' : 
        '<span class="badge bg-warning">⚠ Slow</span>';
    }
    
    if (apiResponseTimeEl) {
      apiResponseTimeEl.textContent = `Avg response: ${avgResponseTime}ms`;
    }
    
    // Update error rate
    const errorRateEl = $('#errorRate');
    if (errorRateEl) {
      const errorRate = (Math.random() * 2).toFixed(2);
      errorRateEl.textContent = `${errorRate}%`;
      errorRateEl.style.color = errorRate > 1 ? '#ef4444' : '#10b981';
    }
  } catch (error) {
    console.error('Error updating API health:', error);
  }
}

function updatePerformanceMetrics() {
  try {
    // CPU Usage
    const cpuUsage = Math.floor(Math.random() * 60) + 20;
    $('#cpuUsage').textContent = `${cpuUsage}%`;
    $('#cpuProgress').style.width = `${cpuUsage}%`;
    $('#cpuProgress').style.background = cpuUsage > 80 ? '#ef4444' : 'linear-gradient(90deg, #10b981, #059669)';
    
    // Memory Usage
    const memoryUsage = Math.floor(Math.random() * 70) + 30;
    $('#memoryUsage').textContent = `${memoryUsage}%`;
    $('#memoryProgress').style.width = `${memoryUsage}%`;
    $('#memoryProgress').style.background = memoryUsage > 85 ? '#ef4444' : 'linear-gradient(90deg, #3b82f6, #2563eb)';
    
    // Disk Usage
    const diskUsage = Math.floor(Math.random() * 50) + 20;
    $('#diskUsage').textContent = `${diskUsage}%`;
    $('#diskProgress').style.width = `${diskUsage}%`;
    $('#diskProgress').style.background = diskUsage > 90 ? '#ef4444' : 'linear-gradient(90deg, #8b5cf6, #7c3aed)';
    
    // Network I/O
    const networkIO = Math.floor(Math.random() * 40) + 10;
    $('#networkIO').textContent = `${networkIO} MB/s`;
    $('#networkProgress').style.width = `${networkIO}%`;
    $('#networkProgress').style.background = 'linear-gradient(90deg, #f59e0b, #d97706)';
  } catch (error) {
    console.error('Error updating performance metrics:', error);
  }
}

function loadEndpointsHealth() {
  try {
    const table = $('#endpointsHealthTable');
    if (!table) return;
    
    // Mock endpoints data (in production: GET /api/v1/admin/health/endpoints)
    const endpoints = [
      { path: '/api/v1/auth/login', method: 'POST', status: 'healthy', avgTime: 145, successRate: 99.8 },
      { path: '/api/v1/offers', method: 'GET', status: 'healthy', avgTime: 82, successRate: 99.9 },
      { path: '/api/v1/bookings', method: 'POST', status: 'healthy', avgTime: 234, successRate: 98.5 },
      { path: '/api/v1/partners', method: 'GET', status: 'healthy', avgTime: 91, successRate: 100 },
      { path: '/api/v1/user/profile', method: 'GET', status: 'healthy', avgTime: 67, successRate: 99.7 },
    ];
    
    table.innerHTML = endpoints.map(endpoint => {
      const statusBadge = endpoint.status === 'healthy' ? 
        '<span class="badge bg-success">✓ Healthy</span>' : 
        '<span class="badge bg-warning">⚠ Degraded</span>';
      
      const successRateColor = endpoint.successRate >= 99 ? '#10b981' : endpoint.successRate >= 95 ? '#f59e0b' : '#ef4444';
      
      return `
        <tr>
          <td><code>${endpoint.path}</code></td>
          <td><span class="badge bg-secondary">${endpoint.method}</span></td>
          <td>${statusBadge}</td>
          <td>${endpoint.avgTime}ms</td>
          <td style="color: ${successRateColor}; font-weight: 600;">${endpoint.successRate}%</td>
          <td>${new Date().toLocaleTimeString()}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading endpoints health:', error);
    $('#endpointsHealthTable').innerHTML = '<tr><td colspan="6" class="error">Failed to load endpoint health</td></tr>';
  }
}

function loadRecentErrors() {
  try {
    const table = $('#recentErrorsTable');
    if (!table) return;
    
    // Mock errors data (in production: GET /api/v1/admin/health/errors?limit=10)
    const errors = [
      { time: new Date(Date.now() - 300000), severity: 'warning', type: '404 Not Found', message: 'Route /api/invalid not found', ip: '192.168.1.1' },
      { time: new Date(Date.now() - 600000), severity: 'error', type: 'Database Error', message: 'Connection timeout', ip: '192.168.1.5' },
      { time: new Date(Date.now() - 900000), severity: 'warning', type: 'Validation Error', message: 'Invalid email format', ip: '192.168.1.10' },
    ];
    
    if (errors.length === 0) {
      table.innerHTML = '<tr><td colspan="5" class="muted" style="text-align: center;">✓ No recent errors</td></tr>';
      return;
    }
    
    table.innerHTML = errors.map(error => {
      const severityBadge = error.severity === 'error' ? 
        '<span class="badge bg-danger">Error</span>' : 
        '<span class="badge bg-warning">Warning</span>';
      
      const timeAgo = Math.floor((Date.now() - error.time.getTime()) / 60000);
      
      return `
        <tr>
          <td>${timeAgo}m ago</td>
          <td>${severityBadge}</td>
          <td><code>${error.type}</code></td>
          <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${error.message}</td>
          <td>${error.ip}</td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    console.error('Error loading recent errors:', error);
    $('#recentErrorsTable').innerHTML = '<tr><td colspan="5" class="error">Failed to load recent errors</td></tr>';
  }
}

// Refresh system health
window.refreshSystemHealth = function() {
  const btn = $('#refreshHealthBtn');
  if (btn) {
    btn.textContent = '🔄 Refreshing...';
    btn.disabled = true;
  }
  
  loadSystemHealth();
  
  setTimeout(() => {
    if (btn) {
      btn.textContent = '🔄 Refresh';
      btn.disabled = false;
    }
    showNotification('System health refreshed', 'success');
  }, 1000);
};

function attachEventListeners() {
  $all('.nav-item').forEach((btn) => {
    btn.addEventListener('click', () => switchSection(btn.dataset.target));
  });

  $('#usersPagination').addEventListener('click', (event) => {
    if (event.target.matches('button[data-page]')) {
      state.pagination.users.page = Number(event.target.dataset.page);
      loadUsers();
    }
  });

  $('#userSearch').addEventListener('input', (event) => {
    state.filters.users.search = event.target.value;
    state.pagination.users.page = 0;
    loadUsers();
  });
  $('#userRoleFilter').addEventListener('change', (event) => {
    state.filters.users.role = event.target.value;
    state.pagination.users.page = 0;
    loadUsers();
  });
  $('#userStatusFilter').addEventListener('change', (event) => {
    state.filters.users.status = event.target.value;
    state.pagination.users.page = 0;
    loadUsers();
  });
  
  const userTierFilter = $('#userTierFilter');
  if (userTierFilter) {
    userTierFilter.addEventListener('change', (event) => {
      state.filters.users.tier = event.target.value;
      state.pagination.users.page = 0;
      loadUsers();
    });
  }
  
  const userSortBy = $('#userSortBy');
  if (userSortBy) {
    userSortBy.addEventListener('change', (event) => {
      state.filters.users.sortBy = event.target.value;
      state.pagination.users.page = 0;
      loadUsers();
    });
  }
  
  $('#partnerTabFilter').addEventListener('change', (event) => {
    state.filters.partners.status = event.target.value;
    partnerState.selectedPartners.clear();
    loadPartners();
  });
  
  // Partner Search
  const partnerSearch = $('#partnerSearch');
  if (partnerSearch) {
    partnerSearch.addEventListener('input', (event) => {
      partnerState.search = event.target.value;
      loadPartners();
    });
  }
  
  // Partner Sort
  const partnerSortBy = $('#partnerSortBy');
  if (partnerSortBy) {
    partnerSortBy.addEventListener('change', (event) => {
      partnerState.sortBy = event.target.value;
      loadPartners();
    });
  }
  
  // Bulk Partner Actions
  const bulkApprovePartnersBtn = $('#bulkApprovePartners');
  if (bulkApprovePartnersBtn) {
    bulkApprovePartnersBtn.addEventListener('click', bulkApprovePartners);
  }
  
  const bulkRejectPartnersBtn = $('#bulkRejectPartners');
  if (bulkRejectPartnersBtn) {
    bulkRejectPartnersBtn.addEventListener('click', bulkRejectPartners);
  }
  
  // Partner Review Modal Event Listeners
  const partnerReviewModalClose = $('#partnerReviewModalClose');
  if (partnerReviewModalClose) {
    partnerReviewModalClose.addEventListener('click', closePartnerReviewModal);
  }
  
  const partnerReviewModal = $('#partnerReviewModal');
  if (partnerReviewModal) {
    partnerReviewModal.addEventListener('click', (event) => {
      if (event.target === partnerReviewModal) {
        closePartnerReviewModal();
      }
    });
  }
  
  // Review Tab Switching
  $all('.review-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchReviewTab(tab.dataset.tab);
    });
  });
  
  // Verification Checklist
  $all('.checklist-checkbox').forEach(checkbox => {
    checkbox.addEventListener('change', updateChecklistProgress);
  });
  
  // Review Action Buttons
  const reviewApprove = $('#reviewApprove');
  if (reviewApprove) {
    reviewApprove.addEventListener('click', () => showReviewDecisionForm('approve'));
  }
  
  const reviewReject = $('#reviewReject');
  if (reviewReject) {
    reviewReject.addEventListener('click', () => showReviewDecisionForm('reject'));
  }
  
  const reviewSendEmail = $('#reviewSendEmail');
  if (reviewSendEmail) {
    reviewSendEmail.addEventListener('click', () => {
      showNotification('Email notification feature coming soon.', 'info');
    });
  }
  
  const reviewRequestDocs = $('#reviewRequestDocs');
  if (reviewRequestDocs) {
    reviewRequestDocs.addEventListener('click', () => {
      showNotification('Document request feature coming soon.', 'info');
    });
  }
  
  // Decision Form Buttons
  const submitDecision = $('#submitDecision');
  if (submitDecision) {
    submitDecision.addEventListener('click', submitPartnerDecision);
  }
  
  const cancelDecision = $('#cancelDecision');
  if (cancelDecision) {
    cancelDecision.addEventListener('click', () => {
      $('#reviewDecisionForm').classList.add('hidden');
      $('#decisionReason').value = '';
      currentReviewDecisionType = null;
    });
  }
  $('#dealSearch').addEventListener('input', (event) => {
    state.filters.deals.search = event.target.value;
    state.selectedDeals.clear();
    loadDeals();
  });
  $('#dealStatusFilter').addEventListener('change', (event) => {
    state.filters.deals.status = event.target.value;
    state.selectedDeals.clear();
    loadDeals();
  });
  $('#dealPromoFilter').addEventListener('change', (event) => {
    state.filters.deals.promo = event.target.value;
    state.selectedDeals.clear();
    loadDeals();
  });
  $('#analyticsRange').addEventListener('change', (event) => {
    state.filters.analyticsPeriod = event.target.value;
    loadAdminAnalytics();
  });
  $('#activityFilter').addEventListener('change', loadActivity);
  $('#settingsForm').addEventListener('submit', saveSettings);

  const exportUsersBtn = $('#exportUsers');
  if (exportUsersBtn) {
    exportUsersBtn.addEventListener('click', exportUsersCSV);
  }

  $('#revenueRange').addEventListener('change', async (event) => {
    try {
      const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/dashboard?range=${event.target.value}`);
      renderRevenueChart(data.revenue_chart || []);
    } catch (error) {
      showNotification(`Failed to update chart: ${error.message}`, 'error');
    }
  });

  const partnersList = $('#partnersList');
  if (partnersList) {
    partnersList.addEventListener('click', handlePartnerAction);
  }

  const dealsList = $('#dealsList');
  if (dealsList) {
    dealsList.addEventListener('click', handleDealAction);
    dealsList.addEventListener('change', (event) => {
      if (event.target.classList.contains('deal-select')) {
        handleDealSelectionChange(event.target.dataset.id, event.target.checked);
      }
    });
  }

  // User actions (including rewards)
  // const usersTable = $('#usersTable');
  // if (usersTable) {
  //   usersTable.addEventListener('click', handleUserAction);
  // }

  const activityList = $('#activityList');
  if (activityList) {
    activityList.addEventListener('click', (event) => {
      const item = event.target.closest('li');
      if (item?.dataset?.details) {
        openModal(`<pre style="white-space: pre-wrap;">${item.dataset.details}</pre>`);
      }
    });
  }

  const quickButtons = document.querySelectorAll('.quick-actions .btn');
  quickButtons.forEach((button) => {
    button.addEventListener('click', () => handleQuickAction(button.dataset.action));
  });

  const modalClose = $('#modalClose');
  if (modalClose) {
    modalClose.addEventListener('click', closeModal);
  }

  const modal = $('#modal');
  if (modal) {
    modal.addEventListener('click', (event) => {
      if (event.target === modal) {
        closeModal();
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
      closeBookingModal();
      closeRefundModal();
    }
  });
  
  // Booking Management Event Listeners
  const bookingSearch = $('#bookingSearch');
  if (bookingSearch) {
    bookingSearch.addEventListener('input', applyBookingFilters);
  }
  
  const bookingStatusFilter = $('#bookingStatusFilter');
  if (bookingStatusFilter) {
    bookingStatusFilter.addEventListener('change', applyBookingFilters);
  }
  
  const bookingStartDate = $('#bookingStartDate');
  if (bookingStartDate) {
    bookingStartDate.addEventListener('change', applyBookingFilters);
  }
  
  const bookingEndDate = $('#bookingEndDate');
  if (bookingEndDate) {
    bookingEndDate.addEventListener('change', applyBookingFilters);
  }
  
  const refreshBookings = $('#refreshBookings');
  if (refreshBookings) {
    refreshBookings.addEventListener('click', () => {
      loadBookings();
      loadBookingStats();
    });
  }
  
  const exportBookingsBtn = $('#exportBookings');
  if (exportBookingsBtn) {
    exportBookingsBtn.addEventListener('click', exportBookings);
  }
  
  // Booking Modal Event Listeners
  const bookingModalClose = $('#bookingModalClose');
  if (bookingModalClose) {
    bookingModalClose.addEventListener('click', closeBookingModal);
  }
  
  const bookingModal = $('#bookingModal');
  if (bookingModal) {
    bookingModal.addEventListener('click', (event) => {
      if (event.target === bookingModal) {
        closeBookingModal();
      }
    });
  }
  
  const modalConfirmBooking = $('#modalConfirmBooking');
  if (modalConfirmBooking) {
    modalConfirmBooking.addEventListener('click', () => {
      updateBookingStatus('confirmed');
    });
  }
  
  const modalCancelBooking = $('#modalCancelBooking');
  if (modalCancelBooking) {
    modalCancelBooking.addEventListener('click', () => {
      const reason = prompt('Reason for cancellation:');
      if (reason !== null) {
        updateBookingStatus('cancelled', reason);
      }
    });
  }
  
  const modalCompleteBooking = $('#modalCompleteBooking');
  if (modalCompleteBooking) {
    modalCompleteBooking.addEventListener('click', () => {
      updateBookingStatus('completed');
    });
  }
  
  const modalRefundBooking = $('#modalRefundBooking');
  if (modalRefundBooking) {
    modalRefundBooking.addEventListener('click', showRefundModal);
  }
  
  // Refund Modal Event Listeners
  const refundModalClose = $('#refundModalClose');
  if (refundModalClose) {
    refundModalClose.addEventListener('click', closeRefundModal);
  }
  
  const refundModal = $('#refundModal');
  if (refundModal) {
    refundModal.addEventListener('click', (event) => {
      if (event.target === refundModal) {
        closeRefundModal();
      }
    });
  }
  
  const refundForm = $('#refundForm');
  if (refundForm) {
    refundForm.addEventListener('submit', processRefund);
  }
  
  const cancelRefund = $('#cancelRefund');
  if (cancelRefund) {
    cancelRefund.addEventListener('click', closeRefundModal);
  }
  
  // Logout button
  const logoutBtn = $('#adminLogout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', handleLogout);
  }

  // Pending partners alert buttons
  const reviewPendingBtn = $('#reviewPendingPartners');
  if (reviewPendingBtn) {
    reviewPendingBtn.addEventListener('click', () => {
      // Switch to partners section and filter to pending
      state.filters.partners.status = 'pending';
      const partnerTabFilter = $('#partnerTabFilter');
      if (partnerTabFilter) {
        partnerTabFilter.value = 'pending';
      }
      switchSection('partnersSection');
      // Hide alert after clicking
      const alert = $('#pendingPartnersAlert');
      if (alert) alert.classList.add('hidden');
    });
  }

  const dismissAlertBtn = $('#dismissPendingAlert');
  if (dismissAlertBtn) {
    dismissAlertBtn.addEventListener('click', () => {
      const alert = $('#pendingPartnersAlert');
      if (alert) {
        alert.classList.add('hidden');
        localStorage.setItem('pendingPartnersAlertDismissed', 'true');
      }
    });
  }
}

// Authentication functions
async function checkAuth() {
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
  if (!token) {
    console.warn('[Admin] No token found, showing login modal.');
    state.isAuthenticated = false;
    showLoginModal();
    return false;
  }
  
  // Verify token is valid by checking user profile
  try {
    console.info('[Admin] Verifying token via /user/profile');
    const response = await fetch(`${API_BASE}/api/v1/user/profile`, {
      headers: getHeaders()
    });
    
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        console.warn('[Admin] Token invalid or expired, forcing re-login.');
        state.isAuthenticated = false;
        localStorage.removeItem('token');
        localStorage.removeItem('adminToken');
        showLoginModal();
        return false;
      }
      // For other errors, don't invalidate auth - might be temporary
      console.warn('[Admin] Auth check returned non-ok status:', response.status);
      // Keep current auth state, but don't set to true
      return state.isAuthenticated;
    }
    
    const result = await response.json();
    const userRole = result.data?.role_name || result.data?.role || 'user';
    
    if (userRole !== 'super_admin') {
      console.error('[Admin] Auth check failed: user is not super_admin', userRole);
      showNotification('Access denied. Super admin privileges required.', 'error');
      state.isAuthenticated = false;
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      showLoginModal();
      return false;
    }
    
    // Update welcome message
    if (result.data?.first_name) {
      const welcomeEl = $('#adminWelcome');
      if (welcomeEl) {
        welcomeEl.textContent = `Welcome back, ${result.data.first_name}`;
      }
    }

    console.info('[Admin] Token verified successfully.');
    state.isAuthenticated = true;
    
    return true;
  } catch (error) {
    // Network errors or other issues - don't invalidate auth if we have a token
    // Only invalidate if it's clearly an auth error
    if (error.message?.includes('401') || error.message?.includes('403') || error.message?.includes('Authentication')) {
      console.error('Auth check error (auth-related):', error);
      state.isAuthenticated = false;
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      showLoginModal();
      return false;
    }
    // For network errors, keep current state but log warning
    console.warn('[Admin] Auth check error (non-auth):', error.message);
    // Don't change auth state on network errors - might be temporary
    return state.isAuthenticated;
  }
}

function showLoginModal() {
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  if (!modal || !modalBody) return;
  
  console.info('[Admin] Rendering login modal');
  modalBody.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:1rem;padding:1.5rem;">
      <h2 style="margin:0;">Super Admin Login</h2>
      <p style="color:#6b7280;margin:0;">Please login to access the admin console</p>
      <div id="loginError" style="color:#ef4444;font-size:0.875rem;display:none;"></div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Email</label>
        <input type="email" id="loginEmailInput" class="input" placeholder="admin@elizian.com" required>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Password</label>
        <input type="password" id="loginPasswordInput" class="input" placeholder="Enter password" required>
      </div>
      <button id="loginSubmitBtn" class="btn btn-primary" style="margin-top:0.5rem;">Login</button>
      <p style="text-align:center;color:#6b7280;font-size:0.875rem;margin:0;">
        Don't have an account? <a href="#" id="showRegisterLink" style="color:#5E17EB;">Register Super Admin</a>
      </p>
    </div>
  `;
  modal.classList.remove('hidden');
  
  // Focus email input
  setTimeout(() => {
    const emailInput = document.getElementById('loginEmailInput');
    if (emailInput) emailInput.focus();
  }, 100);
  
  // Handle login form submission
  const loginSubmitBtn = document.getElementById('loginSubmitBtn');
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener('click', handleLogin);
  }
  
  // Handle Enter key
  const emailInput = document.getElementById('loginEmailInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  if (emailInput && passwordInput) {
    [emailInput, passwordInput].forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          handleLogin();
        }
      });
    });
  }
  
  // Handle register link
  const registerLink = document.getElementById('showRegisterLink');
  if (registerLink) {
    registerLink.addEventListener('click', (e) => {
      e.preventDefault();
      showRegisterModal();
    });
  }
}

function showRegisterModal() {
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  if (!modal || !modalBody) return;
  
  resetRegistrationState();
  modal.classList.remove('hidden');
  modalBody.innerHTML = `
    <div class="modal-form">
      <h2>Register Super Admin</h2>
      <p class="modal-subtitle">Create the first super admin account</p>
      <div id="registerError" style="color:#ef4444;font-size:0.875rem;display:none;"></div>
      <div id="registerSuccess" style="color:#10b981;font-size:0.875rem;display:none;"></div>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;">
        <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:0.5rem;">
          <label style="font-weight:600;color:#374151;">First Name</label>
          <input type="text" id="registerFirstName" class="input" placeholder="First name" required>
        </div>
        <div style="flex:1;min-width:200px;display:flex;flex-direction:column;gap:0.5rem;">
          <label style="font-weight:600;color:#374151;">Last Name</label>
          <input type="text" id="registerLastName" class="input" placeholder="Last name" required>
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Email</label>
        <input type="email" id="registerEmail" class="input" placeholder="admin@elizian.com" required>
      </div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Mobile Number</label>
        <div style="display:flex;gap:0.5rem;align-items:center;">
          <span style="background:#f3f4f6;border-radius:8px;padding:0.65rem 0.9rem;font-weight:600;color:#374151;">+91</span>
          <input type="tel" id="registerPhone" class="input" placeholder="10-digit mobile number" maxlength="10" inputmode="numeric" required>
        </div>
      </div>
      <button id="sendAdminOtpBtn" class="btn btn-secondary">Send OTP</button>
      <div id="registerOtpStatus" style="font-size:0.85rem;color:#6b7280;min-height:20px;"></div>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Enter OTP</label>
        <input type="text" id="registerOtpInput" class="input" placeholder="6-digit OTP" maxlength="6" inputmode="numeric" autocomplete="one-time-code" disabled>
      </div>
      <button id="verifyAdminOtpBtn" class="btn btn-secondary" disabled>Verify OTP</button>
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <label style="font-weight:600;color:#374151;">Password</label>
        <input type="password" id="registerPassword" class="input" placeholder="Minimum 8 characters" required>
      </div>
      <button id="registerSubmitBtn" class="btn btn-primary" style="margin-top:0.5rem;" disabled>Register</button>
      <p style="text-align:center;color:#6b7280;font-size:0.875rem;margin:0;">
        Already have an account? <a href="#" id="showLoginLink" style="color:#5E17EB;">Login</a>
      </p>
    </div>
  `;
  
  const registerSubmitBtn = document.getElementById('registerSubmitBtn');
  const loginLink = document.getElementById('showLoginLink');
  const sendOtpBtn = document.getElementById('sendAdminOtpBtn');
  const verifyOtpBtn = document.getElementById('verifyAdminOtpBtn');
  const otpInput = document.getElementById('registerOtpInput');
  const phoneInput = document.getElementById('registerPhone');

  if (phoneInput) {
    phoneInput.value = '';
    phoneInput.setAttribute('autocomplete', 'tel');
    phoneInput.focus();
  }

  if (registerSubmitBtn) {
    registerSubmitBtn.disabled = true;
    registerSubmitBtn.addEventListener('click', handleRegister);
  }

  if (loginLink) {
    loginLink.addEventListener('click', (e) => {
      e.preventDefault();
      showLoginModal();
    });
  }

  if (sendOtpBtn && phoneInput) {
    sendOtpBtn.addEventListener('click', () => sendSuperAdminOTP(phoneInput, sendOtpBtn, otpInput));
  }

  if (otpInput) {
    otpInput.addEventListener('input', (event) => {
      const value = sanitizePhoneNumber(event.target.value).slice(0, 6);
      event.target.value = value;
      if (verifyOtpBtn) {
        verifyOtpBtn.disabled = value.length !== 6;
      }
    });
  }

  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', () => verifySuperAdminOTP(verifyOtpBtn));
  }
}

async function handleLogin() {
  const email = document.getElementById('loginEmailInput')?.value?.trim();
  const password = document.getElementById('loginPasswordInput')?.value;
  const errorEl = document.getElementById('loginError');
  const submitBtn = document.getElementById('loginSubmitBtn');
  console.info('[Admin] Login attempt for', email);
  
  if (!email || !password) {
    if (errorEl) {
      errorEl.textContent = 'Email and password are required';
      errorEl.style.display = 'block';
    }
    return;
  }
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Logging in...';
  }
  
  if (errorEl) {
    errorEl.style.display = 'none';
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Login failed');
    }
    
    // Store token (backend returns token at top level)
    if (result.token) {
      console.info('[Admin] Login successful, token received.');
      localStorage.setItem('token', result.token);
      localStorage.setItem('adminToken', result.token);
    } else {
      throw new Error('No token received from server');
    }
    
    // Verify user role by checking profile
    try {
      const profileResponse = await fetch(`${API_BASE}/api/v1/user/profile`, {
        headers: getHeaders()
      });
      
      if (profileResponse.ok) {
        const profileResult = await profileResponse.json();
        const userRole = profileResult.data?.role_name || profileResult.data?.role || 'user';
        if (userRole !== 'super_admin') {
          localStorage.removeItem('token');
          localStorage.removeItem('adminToken');
          throw new Error('Access denied. Super admin privileges required.');
        }
      }
    } catch (profileError) {
      localStorage.removeItem('token');
      localStorage.removeItem('adminToken');
      throw profileError;
    }
    
    // Close modal and reload dashboard
    closeModal();
    showNotification('Login successful!', 'success');
    
    // Reload page to refresh all data
    setTimeout(() => {
      window.location.reload();
    }, 500);
    
  } catch (error) {
    console.error('Login error:', error);
    if (errorEl) {
      errorEl.textContent = error.message || 'Login failed. Please check your credentials.';
      errorEl.style.display = 'block';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Login';
    }
  }
}

async function handleRegister() {
  const firstName = document.getElementById('registerFirstName')?.value?.trim();
  const lastName = document.getElementById('registerLastName')?.value?.trim();
  const email = document.getElementById('registerEmail')?.value?.trim();
  const phoneInput = document.getElementById('registerPhone');
  const password = document.getElementById('registerPassword')?.value;
  const errorEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  const submitBtn = document.getElementById('registerSubmitBtn');
  const cleanPhone = sanitizePhoneNumber(phoneInput?.value || '');
  
  if (errorEl) errorEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';
  
  if (!firstName || !email || !password) {
    if (errorEl) {
      errorEl.textContent = 'First name, email, phone number, OTP and password are required.';
      errorEl.style.display = 'block';
    }
    return;
  }
  
  if (cleanPhone.length !== 10) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
      errorEl.style.display = 'block';
    }
    return;
  }
  
  if (!state.registration.otpVerified || state.registration.phone !== cleanPhone) {
    if (errorEl) {
      errorEl.textContent = 'Please verify the OTP for this phone number before registering.';
      errorEl.style.display = 'block';
    }
    return;
  }
  
  if (password.length < 8) {
    if (errorEl) {
      errorEl.textContent = 'Password must be at least 8 characters long';
      errorEl.style.display = 'block';
    }
    return;
  }
  
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering...';
  }
  
  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        first_name: firstName,
        last_name: lastName || '',
        email,
        password,
        role: 'super_admin',
        phone_number: cleanPhone,
        country_code: state.registration.countryCode
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      throw new Error(result.error || result.message || 'Registration failed');
    }
    
    if (successEl) {
      successEl.textContent = 'Super admin created successfully! Please login.';
      successEl.style.display = 'block';
    }
    
    resetRegistrationState();
    
    setTimeout(() => {
      showLoginModal();
      const emailInput = document.getElementById('loginEmailInput');
      if (emailInput) emailInput.value = email;
    }, 1500);
    
  } catch (error) {
    console.error('Register error:', error);
    if (errorEl) {
      errorEl.textContent = error.message || 'Registration failed. Please try again.';
      errorEl.style.display = 'block';
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Register';
    }
    return;
  }

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Registered';
  }
}

function handleLogout() {
  console.info('[Admin] Logout initiated.');
  localStorage.removeItem('token');
  localStorage.removeItem('adminToken');
  state.isAuthenticated = false;
  showNotification('Logged out successfully.', 'success');
  setTimeout(() => {
    console.info('[Admin] Reloading after logout.');
    window.top.location.href = `/admin/login`;
  }, 500);
}

// ============================================
// BOOKING MANAGEMENT
// ============================================

let currentBookingId = null;
const bookingState = {
  page: 1,
  limit: 20,
  status: 'all',
  search: '',
  startDate: '',
  endDate: ''
};

async function loadBookings() {
  const table = $('#bookingsTable');
  if (!table) return;
  
  table.innerHTML = '<tr><td colspan="10" class="muted">Loading bookings…</td></tr>';
  
  try {
    const params = new URLSearchParams({
      status: bookingState.status,
      search: bookingState.search,
      page: bookingState.page,
      limit: bookingState.limit
    });
    
    if (bookingState.startDate) params.append('startDate', bookingState.startDate);
    if (bookingState.endDate) params.append('endDate', bookingState.endDate);
    
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/bookings?${params}`);
    
    if (!data || !data.bookings || data.bookings.length === 0) {
      table.innerHTML = '<tr><td colspan="10" class="muted">No bookings found.</td></tr>';
      return;
    }
    
    table.innerHTML = data.bookings.map(booking => `
      <tr>
        <td><code>${escapeHtml(booking.booking_reference || '—')}</code></td>
        <td>
          <div>${escapeHtml(booking.user_name || '—')}</div>
          <small class="muted">${escapeHtml(booking.user_email || '—')}</small>
        </td>
        <td>${escapeHtml(booking.partner_name || '—')}</td>
        <td>${escapeHtml(booking.deal_title || '—')}</td>
        <td>
          <div>${formatDate(booking.booking_date)}</div>
          <small class="muted">${escapeHtml(booking.booking_time || '—')}</small>
        </td>
        <td>${booking.num_tickets || 0}</td>
        <td>₹${parseFloat(booking.total_price || 0).toFixed(2)}</td>
        <td>
          ${booking.ezt_redeemed && parseFloat(booking.ezt_redeemed) > 0 
            ? `<span class="badge bg-primary">${parseFloat(booking.ezt_redeemed).toFixed(2)} EZT</span>` 
            : '—'}
        </td>
        <td>${renderBookingStatusBadge(booking.status)}</td>
        <td>
          <button class="btn btn-sm btn-primary" onclick="showBookingDetails('${booking.id}')">
            View
          </button>
        </td>
      </tr>
    `).join('');
    
    // Update pagination
    updateBookingPagination(data.pagination);
    
  } catch (error) {
    console.error('Error loading bookings:', error);
    table.innerHTML = '<tr><td colspan="10" class="error">Failed to load bookings.</td></tr>';
    showNotification(`Failed to load bookings: ${error.message}`, 'error');
  }
}

async function loadBookingStats() {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/bookings/stats?range=30`);
    
    if (!data) return;
    
    // Update stat cards
    $('#totalBookings').textContent = data.total_bookings || 0;
    $('#confirmedBookings').textContent = data.confirmed_bookings || 0;
    $('#pendingBookings').textContent = data.pending_bookings || 0;
    $('#cancelledBookings').textContent = data.cancelled_bookings || 0;
    $('#totalBookingRevenue').textContent = `₹${parseFloat(data.total_revenue || 0).toFixed(2)}`;
    $('#avgBookingValue').textContent = `₹${parseFloat(data.avg_booking_value || 0).toFixed(2)}`;
    
  } catch (error) {
    console.error('Error loading booking stats:', error);
  }
}

async function showBookingDetails(bookingId) {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/bookings/${bookingId}`);
    
    if (!data) {
      showNotification('Booking not found.', 'error');
      return;
    }
    
    currentBookingId = bookingId;
    
    // Populate modal fields
    $('#modalBookingRef').textContent = data.booking_reference || '—';
    $('#modalUserName').textContent = data.user_name || '—';
    $('#modalUserEmail').textContent = data.user_email || '—';
    $('#modalUserPhone').textContent = data.user_phone || '—';
    $('#modalUserTier').textContent = data.user_tier || 'Aether';
    $('#modalPartnerName').textContent = data.partner_name || '—';
    $('#modalPartnerEmail').textContent = data.partner_email || '—';
    $('#modalPartnerPhone').textContent = data.partner_phone || '—';
    $('#modalPartnerAddress').textContent = data.partner_address || '—';
    $('#modalDealTitle').textContent = data.deal_title || '—';
    $('#modalBookingType').textContent = data.booking_type || '—';
    $('#modalBookingDate').textContent = formatDate(data.booking_date);
    $('#modalBookingTime').textContent = data.booking_time || '—';
    $('#modalNumTickets').textContent = data.num_tickets || 0;
    $('#modalTotalPrice').textContent = `₹${parseFloat(data.total_price || 0).toFixed(2)}`;
    $('#modalFiatAmount').textContent = `₹${parseFloat(data.fiat_amount || 0).toFixed(2)}`;
    $('#modalEztRedeemed').textContent = data.ezt_redeemed ? `${parseFloat(data.ezt_redeemed).toFixed(2)} EZT` : '0 EZT';
    $('#modalCreatedAt').textContent = formatDate(data.created_at);
    
    // Show/hide action buttons based on status
    const confirmBtn = $('#modalConfirmBooking');
    const cancelBtn = $('#modalCancelBooking');
    const completeBtn = $('#modalCompleteBooking');
    const refundBtn = $('#modalRefundBooking');
    
    confirmBtn.style.display = data.status === 'pending' ? 'inline-block' : 'none';
    cancelBtn.style.display = ['pending', 'confirmed'].includes(data.status) ? 'inline-block' : 'none';
    completeBtn.style.display = data.status === 'confirmed' ? 'inline-block' : 'none';
    refundBtn.style.display = ['confirmed', 'completed'].includes(data.status) ? 'inline-block' : 'none';
    
    // Show modal
    $('#bookingModal').classList.remove('hidden');
    
  } catch (error) {
    console.error('Error loading booking details:', error);
    showNotification(`Failed to load booking details: ${error.message}`, 'error');
  }
}

async function updateBookingStatus(status, reason = null) {
  if (!currentBookingId) return;
  
  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/bookings/${currentBookingId}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, reason })
    });
    
    showNotification(`Booking ${status} successfully.`, 'success');
    closeBookingModal();
    loadBookings();
    loadBookingStats();
    
  } catch (error) {
    console.error('Error updating booking status:', error);
    showNotification(`Failed to update booking: ${error.message}`, 'error');
  }
}

function showRefundModal() {
  closeBookingModal();
  $('#refundModal').classList.remove('hidden');
  
  // Pre-fill the refund amount with the booking's fiat amount
  const fiatAmount = $('#modalFiatAmount').textContent.replace('₹', '').trim();
  $('#refundAmount').value = parseFloat(fiatAmount || 0);
}

async function processRefund(event) {
  event.preventDefault();
  
  if (!currentBookingId) return;
  
  const amount = parseFloat($('#refundAmount').value);
  const type = $('#refundType').value;
  const reason = $('#refundReason').value;
  
  if (!amount || amount <= 0) {
    showNotification('Please enter a valid refund amount.', 'error');
    return;
  }
  
  if (!reason) {
    showNotification('Please provide a reason for the refund.', 'error');
    return;
  }
  
  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/bookings/${currentBookingId}/refund`, {
      method: 'POST',
      body: JSON.stringify({ amount, refund_type: type, reason })
    });
    
    showNotification('Refund processed successfully.', 'success');
    closeRefundModal();
    loadBookings();
    loadBookingStats();
    
  } catch (error) {
    console.error('Error processing refund:', error);
    showNotification(`Failed to process refund: ${error.message}`, 'error');
  }
}

function closeBookingModal() {
  $('#bookingModal').classList.add('hidden');
  currentBookingId = null;
}

function closeRefundModal() {
  $('#refundModal').classList.add('hidden');
  $('#refundForm').reset();
}

function renderBookingStatusBadge(status) {
  const badges = {
    pending: 'badge bg-warning text-dark',
    confirmed: 'badge bg-success',
    cancelled: 'badge bg-danger',
    completed: 'badge bg-primary',
    no_show: 'badge bg-secondary'
  };
  
  const labels = {
    pending: 'Pending',
    confirmed: 'Confirmed',
    cancelled: 'Cancelled',
    completed: 'Completed',
    no_show: 'No Show'
  };
  
  return `<span class="${badges[status] || 'badge bg-secondary'}">${labels[status] || status}</span>`;
}

function updateBookingPagination(pagination) {
  const container = $('#bookingsPagination');
  if (!container || !pagination) return;
  
  const { page, totalPages } = pagination;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '<div class="pagination-controls">';
  
  // Previous button
  if (page > 1) {
    html += `<button class="btn btn-sm btn-secondary" onclick="changeBookingPage(${page - 1})">Previous</button>`;
  }
  
  // Page info
  html += `<span class="pagination-info">Page ${page} of ${totalPages}</span>`;
  
  // Next button
  if (page < totalPages) {
    html += `<button class="btn btn-sm btn-secondary" onclick="changeBookingPage(${page + 1})">Next</button>`;
  }
  
  html += '</div>';
  container.innerHTML = html;
}

function changeBookingPage(page) {
  bookingState.page = page;
  loadBookings();
}

function applyBookingFilters() {
  bookingState.page = 1; // Reset to first page
  bookingState.status = $('#bookingStatusFilter').value || 'all';
  bookingState.search = $('#bookingSearch').value || '';
  bookingState.startDate = $('#bookingStartDate').value || '';
  bookingState.endDate = $('#bookingEndDate').value || '';
  loadBookings();
}

function exportBookings() {
  showNotification('Booking export feature coming soon.', 'info');
}

function formatDate(dateString) {
  if (!dateString) return '—';
  try {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric' 
    });
  } catch (e) {
    return dateString;
  }
}

// Make functions globally accessible
window.showBookingDetails = showBookingDetails;
window.changeBookingPage = changeBookingPage;
window.applyBookingFilters = applyBookingFilters;
window.exportBookings = exportBookings;

function init() {
  attachEventListeners();
  // Check authentication first
  checkAuth().then((isAuthenticated) => {
    if (isAuthenticated) {
      console.info('[Admin] Authentication confirmed, bootstrapping console.');
      switchSection('dashboardSection');
      
      // Check for pending partners from localStorage (if dashboard hasn't loaded yet)
      const pendingCount = localStorage.getItem('pendingPartnersCount');
      const dismissed = localStorage.getItem('pendingPartnersAlertDismissed') === 'true';
      if (pendingCount && parseInt(pendingCount) > 0 && !dismissed) {
        updatePendingPartnersAlert(parseInt(pendingCount));
      }
    } else {
      console.info('[Admin] Authentication required, waiting for login.');
    }
  });
}

document.addEventListener('DOMContentLoaded', init);

// Initialize real-time updates for admin console
function initializeAdminRealtime() {
  if (!window.realtimeService || !window.realtimeService.enabled) {
    console.log('🟡 Real-time disabled for admin console');
    return;
  }

  // Wait for real-time service to connect
  const checkConnection = setInterval(() => {
    if (window.realtimeService && window.realtimeService.isConnected) {
      clearInterval(checkConnection);
      setupAdminRealtimeListeners();
    }
  }, 500);

  // Timeout after 10 seconds
  setTimeout(() => {
    clearInterval(checkConnection);
    if (window.realtimeService && !window.realtimeService.isConnected) {
      console.warn('⚠️ Real-time service did not connect within 10 seconds');
    }
  }, 10000);
}

function setupAdminRealtimeListeners() {
  if (!window.realtimeService) return;

  // Listen for deal updates
  window.realtimeService.on('offers:updated', (data) => {
    console.log('📦 Admin: Deal updated via real-time', data);
    showNotification(`Deal "${data.title || data.offerId}" ${data.action}`, 'info');
    
    // Refresh deals list if on deals section
    const dealsSection = document.getElementById('dealsSection');
    if (dealsSection && dealsSection.classList.contains('visible')) {
      if (typeof loadDeals === 'function') {
        loadDeals();
      }
    }
    
    // Refresh dashboard if visible
    const dashboardSection = document.getElementById('dashboardSection');
    if (dashboardSection && dashboardSection.classList.contains('visible')) {
      if (typeof loadDashboard === 'function') {
        loadDashboard();
      }
    }
  });

  // Listen for trending status changes
  window.realtimeService.on('offers:trending_status_changed', (data) => {
    console.log('🔥 Admin: Trending status changed via real-time', data);
    showNotification(`Deal "${data.title || data.offerId}" ${data.isTrending ? 'marked as trending' : 'unmarked from trending'}`, 'info');
    
    // Refresh deals list
    const dealsSection = document.getElementById('dealsSection');
    if (dealsSection && dealsSection.classList.contains('visible')) {
      if (typeof loadDeals === 'function') {
        loadDeals();
      }
    }
  });

  // Listen for booking updates
  window.realtimeService.on('bookings:created', (data) => {
    console.log('📅 Admin: New booking created via real-time', data);
    showNotification(`New booking ${data.bookingReference || data.bookingId} created`, 'success');
    
    // Refresh bookings if on bookings section
    const bookingsSection = document.getElementById('bookingsSection');
    if (bookingsSection && bookingsSection.classList.contains('visible')) {
      if (typeof loadBookings === 'function') {
        loadBookings();
      }
      if (typeof loadBookingStats === 'function') {
        loadBookingStats();
      }
    }
    
    // Refresh dashboard
    const dashboardSection = document.getElementById('dashboardSection');
    if (dashboardSection && dashboardSection.classList.contains('visible')) {
      if (typeof loadDashboard === 'function') {
        loadDashboard();
      }
    }
  });

  window.realtimeService.on('bookings:status_changed', (data) => {
    console.log('📅 Admin: Booking status changed via real-time', data);
    showNotification(`Booking ${data.bookingReference || data.bookingId} status changed to ${data.status}`, 'info');
    
    // Refresh bookings
    const bookingsSection = document.getElementById('bookingsSection');
    if (bookingsSection && bookingsSection.classList.contains('visible')) {
      if (typeof loadBookings === 'function') {
        loadBookings();
      }
      if (typeof loadBookingStats === 'function') {
        loadBookingStats();
      }
    }
  });

  window.realtimeService.on('bookings:refunded', (data) => {
    console.log('💰 Admin: Booking refunded via real-time', data);
    showNotification(`Booking ${data.bookingReference || data.bookingId} refunded (₹${data.refundAmount || 0})`, 'warning');
    
    // Refresh bookings
    const bookingsSection = document.getElementById('bookingsSection');
    if (bookingsSection && bookingsSection.classList.contains('visible')) {
      if (typeof loadBookings === 'function') {
        loadBookings();
      }
      if (typeof loadBookingStats === 'function') {
        loadBookingStats();
      }
    }
  });

  // Listen for partner updates (if needed)
  window.realtimeService.on('partners:booking_update', (data) => {
    console.log('🏢 Admin: Partner booking update via real-time', data);
    // Could refresh partner stats if needed
  });

  console.log('✅ Admin console real-time listeners initialized');
}

// Initialize real-time after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(initializeAdminRealtime, 1000);
  });
} else {
  setTimeout(initializeAdminRealtime, 1000);
}

function handleQuickAction(action) {
  switch (action) {
    case 'approvePartners':
      state.filters.partners.status = 'pending';
      $('#partnerTabFilter').value = 'pending';
      switchSection('partnersSection');
      showNotification('Showing pending partners for review.', 'success');
      break;
    case 'featureDeal':
      state.filters.deals.promo = 'all';
      $('#dealPromoFilter').value = 'all';
      switchSection('dealsSection');
      showNotification('Select a deal to feature from the list.', 'success');
      break;
    case 'viewReports':
      switchSection('analyticsSection');
      break;
    case 'exportData':
      exportUsersCSV();
      break;
    default:
      showNotification('Action not implemented yet.', 'error');
  }
}

function exportUsersCSV() {
  fetchJSON(`${API_BASE}/api/v1/admin/users?limit=500`)
    .then(({ data }) => {
      const rows = (data?.items || []).map((user) => [
        user.first_name,
        user.last_name,
        user.email,
        user.phone_number,
        user.role,
        user.is_active ? 'Active' : 'Inactive',
        user.created_at
      ]);
      const header = ['First Name', 'Last Name', 'Email', 'Phone', 'Role', 'Status', 'Created'];
      const csv = [header, ...rows]
        .map((row) => row.map((value) => `"${(value ?? '').toString().replace(/"/g, '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `elizian-users-${Date.now()}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      showNotification('Users exported successfully.');
    })
    .catch((error) => {
      showNotification(`Failed to export users: ${error.message}`, 'error');
    });
}

function handlePartnerAction(event) {
  // Handle checkbox clicks
  if (event.target.classList.contains('partner-checkbox')) {
    const partnerId = event.target.dataset.id;
    const checked = event.target.checked;
    handlePartnerCheckboxChange(partnerId, checked);
    return;
  }
  
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const partnerId = button.dataset.id || button.dataset.partner;
  const action = button.dataset.action;
  if (!partnerId || !action) return;

  switch (action) {
    case 'reviewPartner':
      showPartnerReviewModal(partnerId);
      break;
    case 'approvePartner':
      updatePartnerStatus(partnerId, 'approve');
      break;
    case 'rejectPartner':
      updatePartnerStatus(partnerId, 'reject');
      break;
    case 'suspendPartner':
      updatePartnerStatus(partnerId, 'toggle');
      break;
    case 'toggleFeaturedEligibility':
      updatePartnerFeaturedEligibility(partnerId);
      break;
    case 'viewPartner':
      showPartnerDetails(partnerId);
      break;
    case 'changeTier':
      showNotification('Tier management will be available soon.', 'error');
      break;
    default:
      break;
  }
}

async function updatePartnerStatus(partnerId, action) {
  try {
    const url = `${API_BASE}/api/v1/admin/partners/${partnerId}/status`;
    console.log('Updating partner status:', { partnerId, action, url });
    
    const response = await fetch(url, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ action })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText || response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch (e) {
        // Not JSON, use text as is
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || result.message || 'Update failed');
    }

    showNotification('Partner status updated successfully.', 'success');
    loadPartners();
    
    // Refresh dashboard to update pending count and alert
    if (action === 'approve' || action === 'reject') {
      try {
        const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/dashboard`);
        updatePendingPartnersAlert(data.pending_partners || 0);
        // Update the dashboard cards if on dashboard section
        if ($('#dashboardSection')?.classList.contains('visible')) {
          renderDashboardCards(data);
        }
      } catch (err) {
        console.warn('Failed to refresh dashboard after partner approval:', err);
      }
    }
  } catch (error) {
    console.error('Partner status update error:', error);
    const errorMessage = error.message || 'Failed to update partner';
    showNotification(`Failed to update partner: ${errorMessage}`, 'error');
  }
}

async function updatePartnerFeaturedEligibility(partnerId) {
  try {
    // Get current partner data to determine new state
    const partners = state.cache.partners || [];
    let partner = partners.find(p => p.id === partnerId);
    
    if (!partner) {
      // Reload partners if not in cache
      const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/partners?status=all`);
      const foundPartner = data.find(p => p.id === partnerId);
      if (!foundPartner) {
        throw new Error('Partner not found');
      }
      partner = foundPartner;
    }
    
    const currentEligibility = partner.approved_for_featured || false;
    const newEligibility = !currentEligibility;
    
    const reason = prompt(
      newEligibility 
        ? 'Approve this partner for featured/trending content?\n\nEnter a reason (optional):'
        : 'Revoke featured eligibility from this partner?\n\nEnter a reason (optional):'
    );
    
    // If user cancels, reason will be null
    if (reason === null) {
      return;
    }
    
    const url = `${API_BASE}/api/v1/admin/partners/${partnerId}/featured-eligibility`;
    console.log('Updating partner featured eligibility:', { partnerId, approved_for_featured: newEligibility, url });
    
    const response = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ 
        approved_for_featured: newEligibility,
        reason: reason || null
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      let errorMessage = errorText || response.statusText;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch (e) {
        // Not JSON, use text as is
      }
      throw new Error(errorMessage);
    }

    const result = await response.json();
    if (!result.success) {
      throw new Error(result.error || result.message || 'Update failed');
    }

    showNotification(
      newEligibility 
        ? 'Partner approved for featured/trending content successfully.'
        : 'Partner featured eligibility revoked successfully.',
      'success'
    );
    loadPartners();
  } catch (error) {
    console.error('Partner featured eligibility update error:', error);
    const errorMessage = error.message || 'Failed to update featured eligibility';
    showNotification(`Failed to update featured eligibility: ${errorMessage}`, 'error');
  }
}

async function showPartnerDetails(partnerId) {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/partners/${partnerId}`);
    if (!data) {
      showNotification('Partner details unavailable.', 'error');
      return;
    }
    openModal(`
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <h2 style="margin:0;">${data.name}</h2>
        <div><strong>Email:</strong> ${data.email || '—'}</div>
        <div><strong>Phone:</strong> ${data.phone_number || '—'}</div>
        <div><strong>Address:</strong> ${data.address || '—'}</div>
        <div><strong>Description:</strong><br>${data.description || '—'}</div>
      </div>
    `);
  } catch (error) {
    showNotification(`Failed to load partner details: ${error.message}`, 'error');
  }
}

function handleDealAction(event) {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  if (button.disabled || button.classList.contains('disabled')) return;
  const dealId = button.dataset.id;
  const partnerId = button.dataset.partner;
  if (!dealId) return;
  const action = button.dataset.action;
  console.log('[Admin] Deal action clicked:', action, dealId, partnerId);

  switch (action) {
    case 'approveDeal':
      updateDealStatus(dealId, partnerId, 'approve');
      break;
    case 'rejectDeal':
      updateDealStatus(dealId, partnerId, 'reject');
      break;
    case 'pauseDeal':
      updateDealStatus(dealId, partnerId, 'toggle');
      break;
    case 'promoteDeal':
      toggleDealPromotion(dealId, true);
      break;
    case 'unpromoteDeal':
      toggleDealPromotion(dealId, false);
      break;
    case 'approveTrending':
      handleTrendingRequest(dealId, true);
      break;
    case 'rejectTrending':
      handleTrendingRequest(dealId, false);
      break;
    case 'viewDeal':
      showDealDetails(dealId);
      break;
    default:
      break;
  }
}

async function updateDealStatus(dealId, partnerId, action) {
  // Check if deal is already in target state (prevent unnecessary API calls)
  const deal = state.cache.deals?.find(d => d.id === dealId);
  if (deal) {
    if (action === 'approve' && deal.status === 'active') {
      showNotification('Deal is already active.', 'warning');
      return;
    }
    if (action === 'reject' && deal.status === 'rejected') {
      showNotification('Deal is already rejected.', 'warning');
      return;
    }
    // Active deals cannot be rejected - they can only be paused
    if (action === 'reject' && deal.status === 'active') {
      showNotification('Active deals cannot be rejected. Use Pause instead.', 'warning');
      return;
    }
    if (action === 'toggle' && deal.status === 'paused' && deal.status === 'active') {
      // This is handled by the backend, but we can add a check here too
    }
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/admin/deals/${dealId}/status`, {
      method: 'PATCH',
      headers: getHeaders(),
      body: JSON.stringify({ action, partner_id: partnerId })
    });
    if (!response.ok) {
      const errorBody = await response.text();
      console.error('[Admin] Deal status update failed', {
        dealId,
        partnerId,
        action,
        status: response.status,
        body: errorBody
      });
      let message = `HTTP ${response.status}`;
      try {
        const parsed = JSON.parse(errorBody);
        message = parsed?.message || parsed?.error || message;
      } catch (err) {
        message = errorBody || message;
      }
      throw new Error(message);
    }
    showNotification('Deal updated successfully.');
    loadDeals();
  } catch (error) {
    console.error('[Admin] updateDealStatus error:', error);
    // Provide user-friendly error messages
    let userMessage = error.message;
    if (error.message.includes('Invalid transition') && error.message.includes('active → active')) {
      userMessage = 'This deal is already active. No action needed.';
    } else if (error.message.includes('Active deals cannot be rejected')) {
      userMessage = 'Active deals cannot be rejected. Use Pause instead.';
    } else if (error.message.includes('Rejected deals cannot be reactivated')) {
      // This should no longer happen after backend fix, but keep for backwards compatibility
      userMessage = 'This deal was rejected. Please contact support if you need to re-approve it.';
    } else if (error.message.includes('Invalid transition')) {
      userMessage = 'This action is not allowed for deals in this status.';
    }
    showNotification(`Failed to update deal: ${userMessage}`, 'error');
  }
}

async function toggleDealPromotion(dealId, promote) {
  // Check if deal can be promoted (must be active or paused)
  const deal = state.cache.deals?.find(d => d.id === dealId);
  if (deal && promote) {
    if (deal.status !== 'active' && deal.status !== 'paused') {
      showNotification(`Cannot promote deal: Deal must be active or paused (current status: ${deal.status})`, 'error');
      return;
    }
  }

  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/offers/${dealId}/feature`, {
      method: 'PUT',
      body: JSON.stringify({ 
        is_trending: promote,
        force: true // Admin can override partner eligibility
      })
    });
    showNotification(promote ? 'Deal promoted successfully.' : 'Deal unpromoted.');
    loadDeals();
  } catch (error) {
    let userMessage = error.message;
    if (error.message.includes('Cannot promote an inactive or expired deal')) {
      userMessage = 'Only active or paused deals can be promoted.';
    } else if (error.message.includes('not eligible')) {
      // If still not eligible even with force, show a more helpful message
      userMessage = 'Unable to promote deal. Please check deal status and partner eligibility.';
    }
    showNotification(`Failed to update promotion: ${userMessage}`, 'error');
  }
}

async function handleTrendingRequest(dealId, approve) {
  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/offers/${dealId}/feature`, {
      method: 'PUT',
      body: JSON.stringify({ 
        is_trending: approve, 
        featured_request_pending: false,
        force: true // Admin can override partner eligibility
      })
    });
    showNotification(
      approve ? 'Trending request approved. Deal is now promoted.' : 'Trending request rejected.',
      approve ? 'success' : 'info'
    );
    loadDeals();
    if ($('#dashboardSection')?.classList.contains('visible')) {
      loadDashboard();
    }
  } catch (error) {
    showNotification(`Failed to process trending request: ${error.message}`, 'error');
  }
}

async function showDealDetails(dealId) {
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/offers?admin=true&limit=1&search=${encodeURIComponent(dealId)}`);
    const deal = Array.isArray(data) ? data.find((item) => item.id === dealId) : null;
    if (!deal) {
      showNotification('Deal details unavailable.', 'error');
      return;
    }

    openModal(`
      <div style="display:flex;flex-direction:column;gap:0.75rem;">
        <h2 style="margin:0;">${deal.title}</h2>
        <div><strong>Partner:</strong> ${deal.partner_name || '—'}</div>
        <div><strong>Pricing:</strong> ${deal.original_price ? `₹${deal.original_price} → ` : ''}₹${deal.discounted_price || 0}</div>
        <div><strong>Validity:</strong> ${deal.start_date || '—'} to ${deal.end_date || '—'}</div>
        <div><strong>Description:</strong><br>${deal.description || '—'}</div>
      </div>
    `);
  } catch (error) {
    showNotification(`Failed to load deal details: ${error.message}`, 'error');
  }
}

function openModal(contentHtml) {
  const modal = $('#modal');
  const modalBody = $('#modalBody');
  if (!modal || !modalBody) return;
  modalBody.innerHTML = contentHtml;
  modal.classList.remove('hidden');
}

function closeModal() {
  const modal = $('#modal');
  if (modal) {
    modal.classList.add('hidden');
  }
  resetRegistrationState();
  const modalBody = $('#modalBody');
  if (modalBody) {
    modalBody.innerHTML = '';
  }
}

function sanitizePhoneNumber(value) {
  return String(value || '').replace(/\D/g, '');
}

function resetRegistrationState() {
  if (state.registration.resendTimer) {
    clearInterval(state.registration.resendTimer);
  }
  state.registration.phone = '';
  state.registration.otpVerified = false;
  state.registration.resendSeconds = 0;
  state.registration.resendTimer = null;
}

function startRegistrationCountdown(durationSeconds, updateCallback) {
  if (state.registration.resendTimer) {
    clearInterval(state.registration.resendTimer);
  }
  state.registration.resendSeconds = durationSeconds;
  updateCallback(state.registration.resendSeconds);
  state.registration.resendTimer = setInterval(() => {
    state.registration.resendSeconds -= 1;
    updateCallback(Math.max(state.registration.resendSeconds, 0));
    if (state.registration.resendSeconds <= 0) {
      clearInterval(state.registration.resendTimer);
      state.registration.resendTimer = null;
    }
  }, 1000);
}

function getRegisterStatusEl() {
  return document.getElementById('registerOtpStatus');
}

async function sendSuperAdminOTP(phoneInput, sendBtn, otpInput) {
  const errorEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  const statusEl = getRegisterStatusEl();
  const verifyBtn = document.getElementById('verifyAdminOtpBtn');
  const registerBtn = document.getElementById('registerSubmitBtn');

  if (errorEl) errorEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  if (!phoneInput) return;
  const cleanPhone = sanitizePhoneNumber(phoneInput.value);

  if (cleanPhone.length !== 10) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid 10-digit mobile number.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (state.registration.resendSeconds > 0) {
    return;
  }

  sendBtn.disabled = true;
  sendBtn.textContent = 'Sending...';
  if (verifyBtn) {
    verifyBtn.disabled = true;
    verifyBtn.textContent = 'Verify OTP';
  }
  if (registerBtn) {
    registerBtn.disabled = true;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone_number: cleanPhone,
        country_code: state.registration.countryCode,
        purpose: 'super_admin'
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || result.message || 'Failed to send OTP');
    }

    state.registration.phone = cleanPhone;
    state.registration.otpVerified = false;

    if (otpInput) {
      otpInput.disabled = false;
      otpInput.value = '';
      otpInput.focus();
    }

    if (statusEl) {
      statusEl.style.color = '#6b7280';
      statusEl.textContent = `OTP sent to +91 ${cleanPhone}. Resend available in 60s.`;
    }

    startRegistrationCountdown(60, (seconds) => {
      if (statusEl) {
        if (seconds > 0) {
          statusEl.style.color = '#6b7280';
          statusEl.textContent = `OTP sent to +91 ${cleanPhone}. Resend available in ${seconds}s.`;
        } else {
          statusEl.style.color = '#6b7280';
          statusEl.textContent = 'You can resend the OTP if you didn\'t receive it.';
          sendBtn.disabled = false;
          sendBtn.textContent = 'Resend OTP';
        }
      }
    });
  } catch (error) {
    console.error('Send OTP error:', error);
    if (errorEl) {
      errorEl.textContent = error.message || 'Failed to send OTP';
      errorEl.style.display = 'block';
    }
    sendBtn.disabled = false;
    sendBtn.textContent = 'Send OTP';
  }
}

async function verifySuperAdminOTP(verifyBtn) {
  const errorEl = document.getElementById('registerError');
  const successEl = document.getElementById('registerSuccess');
  const statusEl = getRegisterStatusEl();
  const otpInput = document.getElementById('registerOtpInput');
  const phoneInput = document.getElementById('registerPhone');
  const registerBtn = document.getElementById('registerSubmitBtn');

  if (errorEl) errorEl.style.display = 'none';
  if (successEl) successEl.style.display = 'none';

  if (!otpInput || !phoneInput) return;

  const otpCode = sanitizePhoneNumber(otpInput.value).slice(0, 6);
  const cleanPhone = sanitizePhoneNumber(phoneInput.value);

  if (cleanPhone.length !== 10) {
    if (errorEl) {
      errorEl.textContent = 'Please enter a valid phone number before verifying OTP.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (otpCode.length !== 6) {
    if (errorEl) {
      errorEl.textContent = 'Please enter the 6-digit OTP.';
      errorEl.style.display = 'block';
    }
    return;
  }

  if (!state.registration.phone || state.registration.phone !== cleanPhone) {
    if (errorEl) {
      errorEl.textContent = 'The phone number does not match the one that received the OTP. Please resend.';
      errorEl.style.display = 'block';
    }
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = 'Verifying...';

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone_number: cleanPhone, otp_code: otpCode })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(result.error || result.message || 'Failed to verify OTP');
    }

    state.registration.otpVerified = true;
    if (state.registration.resendTimer) {
      clearInterval(state.registration.resendTimer);
      state.registration.resendTimer = null;
      state.registration.resendSeconds = 0;
    }
    if (statusEl) {
      statusEl.style.color = '#10b981';
      statusEl.textContent = 'OTP verified successfully. You can now complete registration.';
    }

    if (successEl) {
      successEl.textContent = 'OTP verified successfully!';
      successEl.style.display = 'block';
    }

    if (registerBtn) {
      registerBtn.disabled = false;
    }

    if (otpInput) {
      otpInput.disabled = true;
    }

    const sendBtn = document.getElementById('sendAdminOtpBtn');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.textContent = 'OTP Verified';
    }

    verifyBtn.textContent = 'Verified';
  } catch (error) {
    console.error('Verify OTP error:', error);
    if (errorEl) {
      errorEl.textContent = error.message || 'Failed to verify OTP';
      errorEl.style.display = 'block';
    }
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify OTP';
  }
}

function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

