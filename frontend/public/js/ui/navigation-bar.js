// ============================================
// UNIVERSAL BOTTOM NAVIGATION BAR
// Dynamically loads service types from API
// ============================================

const API_BASE = window.API_BASE || 'http://localhost:5001';

/**
 * Load and render bottom navigation bar
 * Fetches service types from /api/v1/service-types
 * Adds Home and Profile buttons
 * Highlights currently active category
 */
async function loadBottomNav() {
  try {
    // Guard: only run once using global flag
    if (window.__navLoaded) {
      console.log('⚠️ Navigation already loaded globally, skipping...');
      return;
    }
    window.__navLoaded = true;
    
    // Skip entirely if React app is detected (has #root element)
    if (document.getElementById('root')) {
      return; // React app handles its own navigation
    }
    
    console.log('🔄 Loading bottom navigation...');
    
    const grid = document.getElementById('categoryGrid');
    if (!grid) {
      // Silent fail - element might not exist in this context
      window.__navLoaded = false; // Reset flag if element not found
      return;
    }

    // Determine current active category
    const currentType = getCurrentCategory();
    console.log('Current category:', currentType);

    // Define 5 core primary tabs for clean UX
    const iconMap = {
      home: '🏠',
      dining: '🍽️',
      events: '🎉',
      wellness: '🧘',
      profile: '👤'
    };

    const tabs = ['home', 'dining', 'events', 'wellness', 'profile'];

    // Render primary tabs
    grid.innerHTML = tabs.map(tab => `
      <div class="category-item ${currentType === tab ? 'active' : ''}"
           onclick="navigateToCategory('${tab}')"
           data-category="${tab}"
           role="button"
           tabindex="0"
           aria-label="Navigate to ${tab}"
           aria-current="${currentType === tab ? 'page' : 'false'}">
        <div class="category-icon" aria-hidden="true">${iconMap[tab]}</div>
        <div class="category-label">${tab.charAt(0).toUpperCase() + tab.slice(1)}</div>
      </div>
    `).join('');
    
    console.log(`✅ Rendered ${tabs.length} primary navigation tabs`);
    console.log('✅ Bottom navigation rendered successfully');
  } catch (err) {
    console.error('❌ Error loading navigation:', err);
    window.__navLoaded = false; // Reset flag on error
    renderFallbackNav();
  }
}

/**
 * Determine current active category from URL or screen state
 * @returns {String} Current category key
 */
function getCurrentCategory() {
  // Check URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const typeParam = urlParams.get('type');
  if (typeParam) return typeParam;

  // Check current screen/section in single-page app
  const screens = document.querySelectorAll('.screen');
  for (const screen of screens) {
    if (!screen.classList.contains('hidden')) {
      const screenId = screen.id;
      
      // Map screen IDs to category keys
      if (screenId === 'splashScreen' || screenId === 'homeScreen') return 'home';
      if (screenId === 'profileScreen') return 'profile';
      if (screenId === 'diningScreen') return 'dining';
      if (screenId === 'eventsScreen') return 'events';
      
      // Extract category from data attribute
      const category = screen.getAttribute('data-category');
      if (category) return category;
    }
  }

  // Default to home
  return 'home';
}

/**
 * Navigate to a specific category
 * Handles Home, Profile, and service type categories
 * @param {String} type - Category key to navigate to
 */
function navigateToCategory(type) {
  console.log('Navigating to:', type);

  // For single-page app navigation
  if (typeof navigateTo === 'function') {
    // Map category types to screen names
    const screenMap = {
      'home': 'home',
      'profile': 'profile',
      'dining': 'dining',
      'events': 'events',
      'spa-and-salon': 'spa',
      'wellness': 'wellness',
      'travel': 'travel',
      'healthcare': 'healthcare',
      'others': 'others'
    };

    const screen = screenMap[type] || type;
    
    // Use existing navigateTo function if available
    navigateTo(screen);
    
    // Update active state in navigation
    updateActiveNavItem(type);
    
    return;
  }

  // Fallback: Multi-page navigation
  if (type === 'home') {
    window.location.href = '/index.html';
    return;
  }
  
  if (type === 'profile') {
    window.location.href = '/index.html#profile';
    return;
  }

  // Service type category
  window.location.href = `/category.html?type=${type}`;
}

/**
 * Update active state of navigation items
 * @param {String} activeType - Category key to mark as active
 */
function updateActiveNavItem(activeType) {
  const items = document.querySelectorAll('.category-item');
  items.forEach(item => {
    const category = item.getAttribute('data-category');
    if (category === activeType) {
      item.classList.add('active');
      item.setAttribute('aria-current', 'page');
    } else {
      item.classList.remove('active');
      item.setAttribute('aria-current', 'false');
    }
  });
}

/**
 * Render fallback navigation with hardcoded categories
 * Used when API call fails
 */
function renderFallbackNav() {
  console.warn('⚠️ Using fallback navigation');
  
  const grid = document.getElementById('categoryGrid');
  if (!grid) return;

  const currentType = getCurrentCategory();

  const iconMap = {
    home: '🏠',
    dining: '🍽️',
    events: '🎉',
    wellness: '🧘',
    profile: '👤'
  };

  const tabs = ['home', 'dining', 'events', 'wellness', 'profile'];

  grid.innerHTML = tabs.map(tab => `
    <div class="category-item ${currentType === tab ? 'active' : ''}"
         onclick="navigateToCategory('${tab}')"
         data-category="${tab}"
         role="button"
         tabindex="0"
         aria-label="Navigate to ${tab}"
         aria-current="${currentType === tab ? 'page' : 'false'}">
      <div class="category-icon" aria-hidden="true">${iconMap[tab]}</div>
      <div class="category-label">${tab.charAt(0).toUpperCase() + tab.slice(1)}</div>
    </div>
  `).join('');
}

/**
 * Refresh navigation (useful after authentication state changes)
 */
function refreshBottomNav() {
  window.__navLoaded = false; // Reset flag to allow re-rendering
  loadBottomNav();
}

// Auto-load navigation when DOM is ready
// Skip if React app is detected (has #root element)
if (document.getElementById('root')) {
  console.log('⏭️ React app detected, skipping HTML navigation bar');
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadBottomNav);
} else {
  loadBottomNav();
}

// Export functions for external use
window.loadBottomNav = loadBottomNav;
window.refreshBottomNav = refreshBottomNav;
window.navigateToCategory = navigateToCategory;
window.updateActiveNavItem = updateActiveNavItem;

// Re-render navigation when screen changes (for single-page apps)
document.addEventListener('screenChanged', (e) => {
  console.log('Screen changed to:', e.detail);
  updateActiveNavItem(e.detail.screen || getCurrentCategory());
});

console.log('✅ Navigation bar module loaded');

