/**
 * Navigation Utility
 * Unified navigation system to prevent conflicts
 */

/**
 * Screen name to element ID mapping
 */
const SCREEN_MAP = {
  onboarding: 'onboardingScreen',
  home: 'homeScreen',
  login: 'loginScreen',
  otp: 'otpScreen',
  signup: 'signupScreen',
  profile: 'profileScreen',
  events: 'eventsScreen',
  restaurants: 'restaurantsScreen'
};

/**
 * Navigate to a screen
 * @param {string} screenName - Screen name (e.g., 'home', 'login')
 * @param {Object} options - Navigation options
 */
export function navigateTo(screenName, options = {}) {
  try {
    // Hide all screens
    const screens = document.querySelectorAll('.screen');
    screens.forEach(el => {
      el.classList.add('hidden');
      el.classList.remove('active');
    });

    // Get target screen ID
    const targetId = SCREEN_MAP[screenName] || `${screenName}Screen`;
    const target = document.getElementById(targetId);

    if (!target) {
      console.warn('[navigateTo] Screen not found:', screenName, targetId);
      return false;
    }

    // Show target screen
    target.classList.remove('hidden');
    target.classList.add('active');

    // Handle auth modals
    if (['login', 'otp', 'signup'].includes(screenName)) {
      const container = target.querySelector('.auth-modal-container');
      if (container) {
        container.style.display = 'flex';
      }

      // Handle signup screen special logic
      if (screenName === 'signup') {
        handleSignupScreenInit();
      }
    }

    // Call custom callback if provided
    if (options.onNavigate) {
      options.onNavigate(screenName, target);
    }

    // Dispatch custom event
    window.dispatchEvent(new CustomEvent('screenNavigate', {
      detail: { screenName, targetId, target }
    }));

    return true;
  } catch (error) {
    console.error('[navigateTo] Error navigating to', screenName, error);
    return false;
  }
}

/**
 * Handle signup screen initialization
 */
function handleSignupScreenInit() {
  try {
    const emailEl = document.getElementById('signupEmailInput');
    const passEl = document.getElementById('signupPasswordInput');
    const phoneEl = document.getElementById('signupPhoneInput');

    // Clear email and password
    if (emailEl) emailEl.value = '';
    if (passEl) passEl.value = '';

    // Prefill phone with verified phone if present
    const regPhone = localStorage.getItem('registrationPhone') || '';
    const otpVerified = localStorage.getItem('otpVerified');
    const isVerified = otpVerified === 'true' || otpVerified === '"true"';

    if (phoneEl) {
      if (isVerified && regPhone) {
        phoneEl.value = regPhone;
        phoneEl.readOnly = true;
      } else {
        phoneEl.readOnly = false;
      }
    }
  } catch (error) {
    console.error('[navigateTo] Error initializing signup screen:', error);
  }
}

/**
 * Get current active screen
 * @returns {string|null} Current screen name or null
 */
export function getCurrentScreen() {
  const activeScreen = document.querySelector('.screen.active:not(.hidden)');
  if (!activeScreen) return null;

  const screenId = activeScreen.id;
  // Reverse lookup in SCREEN_MAP
  for (const [name, id] of Object.entries(SCREEN_MAP)) {
    if (id === screenId) {
      return name;
    }
  }

  // Fallback: extract from ID
  return screenId.replace('Screen', '');
}

/**
 * Check if a screen exists
 * @param {string} screenName - Screen name
 * @returns {boolean}
 */
export function screenExists(screenName) {
  const targetId = SCREEN_MAP[screenName] || `${screenName}Screen`;
  return !!document.getElementById(targetId);
}

/**
 * Initialize navigation system
 */
export function initNavigation() {
  // Make navigateTo globally available
  window.navigateTo = navigateTo;
  window.getCurrentScreen = getCurrentScreen;
  window.screenExists = screenExists;

  console.log('✅ Navigation system initialized');
}

