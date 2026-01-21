// ==================================
// NAVIGATION MODULE
// ==================================

import { CONFIG } from '../core/config.jsx';
import { updateWelcomeText, updateProfileInfo } from '../core/auth.jsx';
import { loadEventsFromBackend, renderEventsList, loadUserTickets, renderUserTickets } from '../features/events.jsx';
import { loadRestaurantsFromBackend, renderRestaurantsList } from '../features/restaurants.jsx';
import { cleanupMap, cleanupProximityDetection } from './map.jsx';

// ==================================
// SCREEN NAVIGATION
// ==================================
// Track current screen to prevent navigation loops
let currentScreenName = null;

export function showScreen(screenName) {
  // Skip if React app is detected (has #root element)
  if (document.getElementById('root')) {
    return; // React Router handles navigation
  }
  
  // Prevent navigation loops - skip if already on this screen
  if (currentScreenName === screenName) {
    const activeScreen = document.getElementById(screenName + 'Screen');
    if (activeScreen && activeScreen.classList.contains('active')) {
      console.log('⏭️ Already on screen:', screenName, '- skipping navigation');
      return;
    }
  }
  
  // CRITICAL: Protect dashboard access - require M-PIN for home screen
  if (screenName === 'home' || screenName === 'homeScreen') {
    // Bypass check if M-PIN was just set (flag set in handleMPinSetup)
    const mpinJustSet = sessionStorage.getItem('mpinJustSet') === 'true';
    if (mpinJustSet) {
      // Clear the flag and allow navigation
      sessionStorage.removeItem('mpinJustSet');
      console.log('✅ Bypassing M-PIN check - M-PIN was just set');
      // Continue with normal navigation below
    } else {
      const token = localStorage.getItem('token') || localStorage.getItem('userToken');
      if (token) {
        // Check M-PIN status before allowing dashboard access
        const userInfoStr = localStorage.getItem('userInfo') || localStorage.getItem('user');
        if (userInfoStr) {
          try {
            const userInfo = JSON.parse(userInfoStr);
            const phone = userInfo.phone_number;
            
            if (phone) {
              // Async check - prevent navigation until verified
              const apiBase = window.API_BASE || ((typeof CONFIG !== 'undefined' && CONFIG?.API_BASE_URL) 
                ? CONFIG.API_BASE_URL.replace('/api/v1', '') 
                : (window.location.hostname === 'localhost' ? 'http://localhost:3000' : 'https://api.yourdomain.com'));
              fetch(`${apiBase}/api/v1/auth/check-mpin`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone_number: phone })
              })
              .then(res => res.json())
              .then(result => {
                if (!result.success || !result.data?.has_mpin) {
                  // M-PIN not set - redirect to M-PIN setup
                  console.warn('⚠️ Dashboard access blocked - M-PIN not set');
                  alert('Please set your M-PIN to access the dashboard.');
                  showScreen('mpin-setup');
                  return;
                }
                // M-PIN is set - allow navigation
                proceedWithScreenNavigation(screenName);
              })
              .catch(err => {
                console.error('Error checking M-PIN:', err);
                // On error, block access to be safe
                alert('Unable to verify M-PIN status. Please login again.');
                showScreen('login');
              });
              return; // Exit early - navigation will happen in callback
            }
          } catch (err) {
            console.error('Error parsing user info:', err);
          }
        } else {
          // No user info - require login
          console.warn('⚠️ Dashboard access blocked - no user info');
          alert('Please login to access the dashboard.');
          showScreen('login');
          return;
        }
      } else {
        // No token - require login
        console.warn('⚠️ Dashboard access blocked - no token');
        alert('Please login to access the dashboard.');
        showScreen('login');
        return;
      }
    }
  }
  
  // For non-home screens or after M-PIN check passes, proceed normally
  proceedWithScreenNavigation(screenName);
}

// Helper function to actually perform screen navigation
function proceedWithScreenNavigation(screenName) {
  console.log('📱 Navigating to:', screenName);
  currentScreenName = screenName;
  
  // ✅ Clean up resources before switching screens
  cleanupMap();
  cleanupProximityDetection();
  
  // Hide all screens
  document.querySelectorAll('.screen').forEach(s => {
    s.classList.remove('active');
    s.classList.add('hidden');
  });
  
  // Show target screen (handle special cases like mpin-setup)
  let screenId = screenName + 'Screen';
  if (screenName === 'mpin-setup') screenId = 'mpinSetupScreen';
  if (screenName === 'mpin-login') screenId = 'mpinLoginScreen';
  
  const screen = document.getElementById(screenId);
  if (screen) {
    screen.classList.remove('hidden');
    screen.classList.add('active');
  } else {
    console.warn('[showScreen] Screen not found:', screenName, screenId);
  }
  
  // Update navigation active state
  updateNavActiveState(screenName);
  
  // Update content based on screen
  updateScreenContent(screenName);
  
  // Show/hide bottom navigation based on screen
  toggleBottomNav(screenName);
}

// Toggle bottom navigation visibility based on screen
function toggleBottomNav(screenName) {
  const bottomNav = document.querySelector('.bottom-nav-new');
  if (!bottomNav) return;
  
  // Hide bottom nav on authentication screens
  const authScreens = ['onboarding', 'login', 'otp', 'register'];
  const shouldHide = authScreens.includes(screenName);
  
  if (shouldHide) {
    bottomNav.style.display = 'none';
  } else {
    // Show bottom nav on authenticated screens
    bottomNav.style.display = 'flex';
    
    // Refresh nav items to update active state
    if (typeof window.loadBottomNav === 'function') {
      window.loadBottomNav();
    }
  }
  
  console.log(`🔽 Bottom nav ${shouldHide ? 'hidden' : 'shown'} for screen: ${screenName}`);
}

// Expose for inline HTML handlers defined in index.html
// This keeps existing markup working while we migrate fully to modules.
// eslint-disable-next-line no-undef
if (typeof window !== 'undefined') {
  // Back-compat: window.navigateTo used by index.html shim
  window.navigateTo = showScreen;
}

function updateNavActiveState(activeScreen) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
  });
  
  // Set active state based on screen
  const navMap = {
    'home': 0,
    'events': 1,
    'dining': 2,
    'profile': 3
  };
  
  const activeIndex = navMap[activeScreen];
  if (activeIndex !== undefined) {
    const navItems = document.querySelectorAll('.nav-item');
    if (navItems[activeIndex]) {
      navItems[activeIndex].classList.add('active');
    }
  }
}

async function updateScreenContent(screenName) {
  switch (screenName) {
    case 'home':
      // Load home screen data (deals) regardless of authentication
      const token = localStorage.getItem('token');
      if (token) {
      updateWelcomeText();
      }
      // Always load deals - they should be visible to everyone
      if (typeof window.loadHomeScreenData === 'function') {
        await window.loadHomeScreenData();
      }
      break;
    case 'profile':
      updateProfileInfo();
      // Load user tickets
      try {
        const tickets = await loadUserTickets();
        renderUserTickets(tickets);
      } catch (error) {
        console.error('Error loading user tickets:', error);
      }
      break;
    case 'events':
      console.log('🎪 Navigating to events screen');
      try {
        const events = await loadEventsFromBackend();
        console.log('📋 Events loaded, rendering...');
        renderEventsList(events);
      } catch (error) {
        console.error('❌ Error loading events:', error);
      }
      break;
    case 'dining':
      console.log('🍽️ Navigating to dining screen');
      try {
        const restaurants = await loadRestaurantsFromBackend();
        console.log('📋 Restaurants loaded, rendering...');
        renderRestaurantsList(restaurants);
      } catch (error) {
        console.error('❌ Error loading restaurants:', error);
      }
      break;
  }
}

// ==================================
// MODAL MANAGEMENT
// ==================================
export const ModalManager = {
  currentModal: null,
  
  show(modalId) {
    // Close current modal if open
    if (this.currentModal) {
      this.close();
    }
    
    const modal = document.getElementById(modalId);
    if (modal) {
      modal.style.display = 'flex';
      this.currentModal = modalId;
    }
  },
  
  close() {
    if (this.currentModal) {
      const modal = document.getElementById(this.currentModal);
      if (modal) {
        modal.style.display = 'none';
      }
      this.currentModal = null;
    }
  },
  
  closeAll() {
    document.querySelectorAll('.modal').forEach(modal => {
      modal.style.display = 'none';
    });
    this.currentModal = null;
  }
};

// ==================================
// EVENT HANDLERS
// ==================================
export function setupEventListeners() {
  // Navigation clicks
  document.addEventListener('click', function(event) {
    const navItem = event.target.closest('.nav-item');
    if (navItem && navItem.onclick) {
      // Let the onclick handler work
      return;
    }
    
    // Handle data-navigate attributes
    const navigateTarget = event.target.closest('[data-navigate]');
    if (navigateTarget) {
      event.preventDefault();
      const screenName = navigateTarget.getAttribute('data-navigate');
      showScreen(screenName);
    }
  });
  
  // Modal close on backdrop click
  document.addEventListener('click', function(event) {
    if (event.target.classList.contains('modal')) {
      ModalManager.close();
    }
  });
  
  // Escape key to close modals
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
      ModalManager.close();
    }
  });
}

// ==================================
// ROUTING UTILITIES
// ==================================
export function navigateTo(screenName) {
  showScreen(screenName);
}

export function goBack() {
  // Simple back navigation - could be enhanced with history
  const currentScreen = document.querySelector('.screen.active');
  if (currentScreen) {
    const screenId = currentScreen.id;
    if (screenId === 'otpScreen') {
      showScreen('login');
    } else if (screenId === 'signupScreen') {
      showScreen('login');
    } else {
      showScreen('home');
    }
  }
}

// ==================================
// SCREEN INITIALIZATION
// ==================================
export function initializeScreens() {
  // Check if user is already logged in
  const token = localStorage.getItem('token');
  if (token) {
    showScreen('home');
  } else {
    showScreen('onboarding');
  }
}

// ==================================
// EXPORTS FOR GLOBAL ACCESS
// ==================================
window.showScreen = showScreen;
window.navigateTo = navigateTo;
window.goBack = goBack;
window.ModalManager = ModalManager;
window.setupEventListeners = setupEventListeners;
window.initializeScreens = initializeScreens;