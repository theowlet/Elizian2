const API_BASE = window.API_BASE || 'http://localhost:5001';

const state = {
  sections: [
    'dashboardSection',
    'usersSection',
    'partnersSection',
    'dealsSection',
    'analyticsSection',
    'activitySection',
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
  if (!state.isAuthenticated) {
    console.warn('[Admin] Section change blocked until authentication completes.');
    showLoginModal();
    return;
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
  if (targetId === 'analyticsSection') loadAdminAnalytics();
  if (targetId === 'activitySection') loadActivity();
  if (targetId === 'settingsSection') loadSettings();
}

async function fetchJSON(url, options = {}) {
  try {
    const response = await fetch(url, { headers: getHeaders(), ...options });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || response.statusText);
    }
    return await response.json();
  } catch (error) {
    console.error('Fetch error:', error);
    throw error;
  }
}

async function loadDashboard() {
  const dashboardCards = document.getElementById('dashboardCards');
  dashboardCards.innerHTML = '<div class="card muted">Loading dashboard…</div>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/dashboard`);
    renderDashboardCards(data);
    renderRecentActivity(data.recent_activity || []);
    renderRevenueChart(data.revenue_chart || []);
    if (data.last_login) $('#adminLastLogin').textContent = `Last login: ${new Date(data.last_login).toLocaleString()}`;
    
    // Show/hide pending partners alert
    updatePendingPartnersAlert(data.pending_partners || 0);
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

function renderDashboardCards(data) {
  const cards = [
    { label: 'Users', icon: '👥', primary: data.total_users, meta: `+${data.new_users_today || 0} today` },
    { label: 'Partners', icon: '🏢', primary: data.total_partners, meta: `${data.pending_partners || 0} pending` },
    { label: 'Deals', icon: '🎫', primary: data.total_deals, meta: `${data.active_deals || 0} active` },
    { label: 'Revenue', icon: '💰', primary: `₹${Number(data.total_revenue || 0).toLocaleString('en-IN')}`, meta: 'This period' },
    { label: 'Featured Deals', icon: '⭐', primary: data.promoted_deals || 0, meta: 'Live now' },
    { label: 'Sessions', icon: '📊', primary: data.active_sessions || 0, meta: 'Active now' },
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
        const keys = ['is_promoted', 'featured_request_pending', 'status'];
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
  const { search, role, status } = state.filters.users;
  const params = new URLSearchParams({
    search,
    role,
    status,
    limit,
    offset: page * limit,
  });
  const table = $('#usersTable');
  table.innerHTML = '<tr><td colspan="7" class="muted">Loading users…</td></tr>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/users?${params.toString()}`);
    renderUsersTable(data.items || []);
    renderUsersPagination(data.total || 0);
  } catch (error) {
    table.innerHTML = `<tr><td colspan="7" class="error">Failed to load users: ${error.message}</td></tr>`;
  }
}

function renderUsersTable(users = []) {
  if (!users.length) {
    $('#usersTable').innerHTML = '<tr><td colspan="7" class="muted">No users found.</td></tr>';
    return;
  }
  $('#usersTable').innerHTML = users.map((user) => `
    <tr>
      <td>${user.first_name || ''} ${user.last_name || ''}</td>
      <td>${user.email || '—'}</td>
      <td>${user.phone_number || '—'}</td>
      <td>${user.role || 'user'}</td>
      <td>${user.is_active ? '<span class="badge badge-success">Active</span>' : '<span class="badge badge-error">Inactive</span>'}</td>
      <td>${user.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</td>
      <td>
        <button class="btn btn-secondary btn-xs" data-user="${user.id}" data-action="viewUser">View</button>
        <button class="btn btn-secondary btn-xs" data-user="${user.id}" data-action="suspendUser">${user.is_active ? 'Suspend' : 'Activate'}</button>
      </td>
    </tr>`).join('');
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

async function loadPartners() {
  const status = state.filters.partners.status;
  const list = $('#partnersList');
  list.innerHTML = '<div class="card muted">Loading partners…</div>';
  try {
    const { data } = await fetchJSON(`${API_BASE}/api/v1/admin/partners?status=${status}`);
    if (!data.length) {
      list.innerHTML = '<div class="card muted">No partners found.</div>';
      return;
    }
    state.cache.partners = data;
    list.innerHTML = data.map((partner) => `
      <div class="card partner-card" data-partner="${partner.id}">
        <div class="partner-header">
          <h3>${partner.name}</h3>
          <div style="display: flex; gap: 0.5rem; align-items: center;">
            <span class="badge ${partner.status === 'approved' ? 'badge-success' : partner.status === 'pending' ? 'badge-warning' : 'badge-error'}">
              ${partner.status.toUpperCase()}
            </span>
            ${partner.approved_for_featured 
              ? `<span class="badge badge-success" title="Approved for Featured/Trending content">⭐ Featured</span>`
              : `<span class="badge badge-secondary" title="Not approved for Featured/Trending content">Featured</span>`}
          </div>
        </div>
        <div class="partner-meta">
          <div>📧 ${partner.email || '—'}</div>
          <div>📞 ${partner.phone_number || '—'}</div>
          <div>📍 ${partner.address || '—'}</div>
        </div>
        <div class="partner-stats">
          <span>Tier: ${partner.tier || '—'}</span>
          <span>Active Deals: ${partner.active_deals || 0}</span>
          <span>Total Bookings: ${partner.total_bookings || 0}</span>
        </div>
        <div class="partner-actions">
          ${partner.status === 'pending'
            ? `<button class="btn btn-primary btn-xs" data-action="approvePartner" data-id="${partner.id}">Approve</button>
               <button class="btn btn-secondary btn-xs" data-action="rejectPartner" data-id="${partner.id}">Reject</button>`
            : `<button class="btn btn-secondary btn-xs" data-action="changeTier" data-id="${partner.id}">Change Tier</button>
               <button class="btn btn-secondary btn-xs" data-action="suspendPartner" data-id="${partner.id}">${partner.status === 'suspended' ? 'Activate' : 'Suspend'}</button>
               <button class="btn ${partner.approved_for_featured ? 'btn-warning' : 'btn-success'} btn-xs" data-action="toggleFeaturedEligibility" data-id="${partner.id}" title="${partner.approved_for_featured ? 'Revoke featured eligibility' : 'Approve for featured/trending content'}">
                 ${partner.approved_for_featured ? '⭐ Revoke Featured' : '⭐ Approve Featured'}
               </button>
               <button class="btn btn-secondary btn-xs" data-action="viewPartner" data-id="${partner.id}">View Dashboard</button>`}
        </div>
      </div>`).join('');
  } catch (error) {
    list.innerHTML = `<div class="card error">Failed to load partners: ${error.message}</div>`;
  }
}

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
  const statusLabel = DEAL_STATUS_LABELS[deal.status] || (deal.status || 'Unknown').toUpperCase();
  const statusClass = DEAL_STATUS_BADGES[deal.status] || DEAL_STATUS_BADGES.default;
  const scheduleLabel = DEAL_SCHEDULE_LABELS[deal.schedule_status] || (deal.schedule_status || 'Unknown');
  const scheduleClass = DEAL_SCHEDULE_BADGES[deal.schedule_status] || DEAL_SCHEDULE_BADGES.default;
  const trendingBadge = deal.is_promoted ? '<span class="badge badge-accent">Trending</span>' : '';
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
    : `<button class="btn btn-secondary btn-xs ${disableTrendingActions ? 'disabled' : ''}" data-action="${deal.is_promoted ? 'unpromoteDeal' : 'promoteDeal'}" data-id="${deal.id}" data-partner="${deal.partner_id}" ${disableTrendingActions ? 'disabled' : ''}>
         ${deal.is_promoted ? 'Unpromote' : 'Promote'}
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
  } catch (error) {
    overview.innerHTML = `<div class="card error">Failed to load analytics: ${error.message}</div>`;
  }
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
            // Check is_promoted changes
            if (meta.next.is_promoted !== undefined && meta.previous.is_promoted !== undefined) {
              if (meta.next.is_promoted !== meta.previous.is_promoted) {
                metaParts.push(`Promoted: ${meta.previous.is_promoted ? 'Yes' : 'No'} → ${meta.next.is_promoted ? 'Yes' : 'No'}`);
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
            if (meta.next?.is_promoted === false && meta.previous?.is_promoted === false) {
              metaParts.push('Removed from trending');
            } else if (meta.next?.is_promoted === true) {
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
  $('#partnerTabFilter').addEventListener('change', (event) => {
    state.filters.partners.status = event.target.value;
    loadPartners();
  });
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
    }
  });
  
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
  state.isAuthenticated = false;
  const token = localStorage.getItem('token') || localStorage.getItem('adminToken');
  if (!token) {
    console.warn('[Admin] No token found, showing login modal.');
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
        localStorage.removeItem('token');
        localStorage.removeItem('adminToken');
        showLoginModal();
        return false;
      }
      throw new Error('Auth check failed');
    }
    
    const result = await response.json();
    const userRole = result.data?.role_name || result.data?.role || 'user';
    
    if (userRole !== 'super_admin') {
      console.error('[Admin] Auth check failed: user is not super_admin', userRole);
      showNotification('Access denied. Super admin privileges required.', 'error');
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
    console.error('Auth check error:', error);
    localStorage.removeItem('token');
    localStorage.removeItem('adminToken');
    showLoginModal();
    return false;
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
    window.location.reload();
  }, 500);
}

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
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const partnerId = button.dataset.id || button.dataset.partner;
  const action = button.dataset.action;
  if (!partnerId || !action) return;

  switch (action) {
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
      body: JSON.stringify({ is_promoted: promote })
    });
    showNotification(promote ? 'Deal promoted successfully.' : 'Deal unpromoted.');
    loadDeals();
  } catch (error) {
    let userMessage = error.message;
    if (error.message.includes('Cannot promote an inactive or expired deal')) {
      userMessage = 'Only active or paused deals can be promoted.';
    }
    showNotification(`Failed to update promotion: ${userMessage}`, 'error');
  }
}

async function handleTrendingRequest(dealId, approve) {
  try {
    await fetchJSON(`${API_BASE}/api/v1/admin/offers/${dealId}/feature`, {
      method: 'PUT',
      body: JSON.stringify({ is_promoted: approve, featured_request_pending: false })
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

