(function () {
  const state = {
    categories: [],
    filters: ['distance', 'discount', 'rating'],
  };

  document.addEventListener('DOMContentLoaded', () => {
    state.categories = collectCategories();
    renderCategoryStrip();
    renderAllCategoriesCard();
    renderFilterChips();
    const navEl = document.getElementById('bottomNav');
    if (navEl && window.UIComponents?.renderBottomNav) {
      window.UIComponents.renderBottomNav(navEl);
    }
    renderTokenWidgetUI({ balance: 0, earned: 0, spent: 0 });
    renderVoucherWalletUI([]);
    renderQRScannerShell();
  });

  /* ------------------ Category Helpers ------------------ */
  function collectCategories() {
    const tabs = document.querySelectorAll('.category-tabs .tab');
    const seen = new Set();
    const cats = [];
    tabs.forEach((tab) => {
      const slug = tab.dataset.category;
      if (!slug || seen.has(slug)) return;
      seen.add(slug);
      cats.push({
        slug,
        label: tab.querySelector('.tab-label')?.textContent?.trim() || tab.textContent.trim(),
        icon: tab.querySelector('.tab-icon')?.textContent?.trim() || '✨',
      });
    });
    return cats;
  }

  function renderCategoryStrip() {
    const strip = document.getElementById('categoryStrip');
    if (!strip || !state.categories.length) return;

    strip.innerHTML = state.categories
      .map(
        (cat) => `
        <button class="category-entry" data-category="${cat.slug}" aria-label="${cat.label}">
          <span class="entry-icon">${cat.icon}</span>
          <span class="entry-label">${cat.label}</span>
        </button>
      `,
      )
      .join('');

    strip.addEventListener('click', (event) => {
      const btn = event.target.closest('.category-entry');
      if (!btn) return;
      strip.querySelectorAll('.category-entry').forEach((node) => node.classList.remove('is-active'));
      btn.classList.add('is-active');
      const slug = btn.dataset.category;
      if (typeof window.filterByCategory === 'function') {
        window.filterByCategory(slug);
      }
    });
  }

  function renderAllCategoriesCard() {
    const container = document.getElementById('allCategoriesCard');
    if (!container) return;
    container.innerHTML = `
      <div class="card all-categories-card">
        <header style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <p class="section-subtitle">Explore</p>
            <h3>All Categories</h3>
          </div>
          <button class="btn-secondary" onclick="filterByCategory('all')">View All</button>
        </header>
        <div class="voucher-wallet-grid">
          ${state.categories
            .filter((cat) => cat.slug !== 'all')
            .map(
              (cat) => `
              <article class="voucher-card-modern" data-category="${cat.slug}">
                <span class="state-pill">${cat.label}</span>
                <p style="color:var(--text-muted); font-size:.9rem;">
                  Discover curated ${cat.label.toLowerCase()} picks around you.
                </p>
                <button class="qr-btn" onclick="filterByCategory('${cat.slug}')">
                  Explore
                </button>
              </article>
            `,
            )
            .join('')}
        </div>
      </div>
    `;
  }

  /* ------------------ Filters ------------------ */
  function renderFilterChips() {
    const bar = document.getElementById('filterChipBar');
    if (!bar) return;
    const chipMap = {
      distance: { label: 'Distance', icon: '📍' },
      discount: { label: 'Discount', icon: '💸' },
      rating: { label: 'Rating', icon: '⭐' },
    };
    bar.innerHTML = state.filters
      .map(
        (id) => `
        <button class="filter-chip" data-filter="${id}">
          <span>${chipMap[id]?.icon || '⚙️'}</span>
          <span>${chipMap[id]?.label || id}</span>
          <span class="chip-count" hidden>0</span>
        </button>
      `,
      )
      .join('');

    bar.addEventListener('click', (event) => {
      const chip = event.target.closest('.filter-chip');
      if (!chip) return;
      const type = chip.dataset.filter;
      if (typeof window.toggleFilter === 'function') {
        window.toggleFilter(type);
      }
      chip.classList.add('is-active');
    });
  }

  function refreshFilterChips() {
    const chipBar = document.getElementById('filterChipBar');
    if (!chipBar || typeof window.currentFilters === 'undefined') return;
    chipBar.querySelectorAll('.filter-chip').forEach((chip) => {
      const type = chip.dataset.filter;
      const value = window.currentFilters?.[`min${capitalize(type)}`] ?? window.currentFilters?.[type];
      chip.classList.toggle('is-active', Boolean(value));
      const pill = chip.querySelector('.chip-count');
      if (pill) {
        const shouldShow = typeof value !== 'undefined' && value !== null;
        pill.hidden = !shouldShow;
        if (shouldShow) pill.textContent = value;
      }
    });
  }

  function capitalize(value = '') {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  /* ------------------ Token & Voucher helpers ------------------ */
  window.renderTokenWidgetUI = function renderTokenWidgetUI(stats) {
    const mount = document.getElementById('tokenWidgetMount');
    if (!mount || !window.UIComponents?.TokenWidget) return;
    mount.innerHTML = window.UIComponents.TokenWidget(stats);
  };

  window.renderVoucherWalletUI = function renderVoucherWalletUI(vouchers = []) {
    const root = document.getElementById('voucherWalletGrid');
    if (!root || !window.UIComponents?.VoucherCard) return;
    if (!Array.isArray(vouchers) || vouchers.length === 0) {
      root.innerHTML = `<p style="color:var(--text-muted); text-align:center;">No vouchers yet. Complete bookings to unlock rewards.</p>`;
      return;
    }
    root.innerHTML = vouchers.map(window.UIComponents.VoucherCard).join('');
  };

  window.renderQRScannerShell = function renderQRScannerShell() {
    const mount = document.getElementById('qrScannerMount');
    if (!mount || !window.UIComponents?.QRScannerShell) return;
    mount.innerHTML = window.UIComponents.QRScannerShell();
  };

  /* ------------------ Patch existing functions ------------------ */
  const originalToggleFilter = window.toggleFilter;
  window.toggleFilter = function patchedToggleFilter(type) {
    originalToggleFilter?.(type);
    refreshFilterChips();
  };

  const originalClearFilters = window.clearFilters;
  window.clearFilters = function patchedClearFilters() {
    originalClearFilters?.();
    refreshFilterChips();
  };

  const originalLoadHome = window.loadHomeScreenData;
  window.loadHomeScreenData = async function patchedLoadHomeScreenData() {
    const result = await originalLoadHome?.();
    refreshFilterChips();
    return result;
  };
})();

