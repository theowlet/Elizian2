(function () {
  const NAV_ITEMS = [
    { id: 'home', label: 'Home', icon: '🏠', action: () => showScreen?.('home') },
    { id: 'discover', label: 'Discover', icon: '🧭', action: () => navigateTo?.('home') },
    { id: 'scan', label: 'Scan', icon: '📷', action: () => showScreen?.('scanner') },
    { id: 'wallet', label: 'Wallet', icon: '💳', action: () => showScreen?.('profile') },
    { id: 'profile', label: 'Profile', icon: '👤', action: () => showScreen?.('profile') },
  ];

  function renderBottomNav(target = document.getElementById('bottomNav')) {
    if (!target) return;
    target.innerHTML = NAV_ITEMS.map(
      (item) => `
        <button type="button" data-nav="${item.id}" aria-label="${item.label}">
          <span>${item.icon}</span>
          <span>${item.label}</span>
        </button>
      `,
    ).join('');

    target.addEventListener('click', (event) => {
      const btn = event.target.closest('button[data-nav]');
      if (!btn) return;
      const navId = btn.dataset.nav;
      target.querySelectorAll('button').forEach((b) => b.classList.toggle('is-active', b === btn));
      const navItem = NAV_ITEMS.find((item) => item.id === navId);
      navItem?.action();
    });
  }

  window.UIComponents = window.UIComponents || {};
  window.UIComponents.renderBottomNav = renderBottomNav;
})();

