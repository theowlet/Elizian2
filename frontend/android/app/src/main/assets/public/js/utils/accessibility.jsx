/**
 * Accessibility Utilities
 * WCAG 2.1 AA Compliance Helpers
 */

/**
 * Announce message to screen readers
 */
function announceToScreenReader(message, priority = 'polite') {
  const statusEl = document.getElementById('statusMessage');
  if (statusEl) {
    statusEl.setAttribute('aria-live', priority);
    statusEl.textContent = message;
    // Clear after announcement
    setTimeout(() => {
      statusEl.textContent = '';
    }, 1000);
  }
}

/**
 * Check if user prefers reduced motion
 */
function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Trap focus within a modal element
 */
function trapFocus(element) {
  const focusableElements = element.querySelectorAll(
    'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
  );
  
  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];
  
  element.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }
    
    if (e.key === 'Escape') {
      const closeButton = element.querySelector('[aria-label*="close" i], [aria-label*="Close" i]');
      if (closeButton) {
        closeButton.click();
      }
    }
  });
  
  // Focus first element when modal opens
  if (firstElement) {
    firstElement.focus();
  }
}

/**
 * Enhanced phone input validation with visual feedback
 */
function validatePhoneInputEnhanced(input) {
  if (!input) return false;
  
  const errorEl = input.getAttribute('aria-describedby') 
    ? document.getElementById(input.getAttribute('aria-describedby'))
    : null;
  
  // Remove non-numeric characters
  let value = input.value.replace(/\D/g, '');
  
  // Limit to 10 digits
  if (value.length > 10) {
    value = value.slice(0, 10);
  }
  
  input.value = value;
  
  const isValid = value.length === 10;
  
  // Update ARIA attributes
  input.setAttribute('aria-invalid', !isValid);
  
  // Show/hide error message
  if (errorEl) {
    if (!isValid && value.length > 0) {
      errorEl.textContent = value.length < 10 
        ? `Please enter ${10 - value.length} more digit${10 - value.length > 1 ? 's' : ''}`
        : 'Phone number must be exactly 10 digits';
    } else {
      errorEl.textContent = '';
    }
  }
  
  // Update visual state
  if (isValid) {
    input.classList.remove('error');
    input.classList.add('valid');
  } else {
    input.classList.remove('valid');
    if (value.length > 0) {
      input.classList.add('error');
    }
  }
  
  return isValid;
}

/**
 * Check online/offline status
 */
function initOfflineDetection() {
  const offlineBanner = document.getElementById('offline-indicator');
  if (!offlineBanner) return;
  
  function updateOnlineStatus() {
    if (navigator.onLine) {
      offlineBanner.style.display = 'none';
      announceToScreenReader('Connection restored', 'polite');
    } else {
      offlineBanner.style.display = 'block';
      announceToScreenReader('You are offline. Some features may be limited.', 'assertive');
    }
  }
  
  window.addEventListener('online', updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  
  // Initial check
  updateOnlineStatus();
}

/**
 * Create skeleton loader HTML
 */
function createTrendingSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-grid';
  skeleton.id = 'trendingSkeleton';
  skeleton.setAttribute('aria-label', 'Loading trending deals');
  skeleton.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text short"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text short"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text short"></div>
    </div>
  `;
  return skeleton;
}

function createDealsSkeleton() {
  const skeleton = document.createElement('div');
  skeleton.className = 'skeleton-grid';
  skeleton.id = 'dealsSkeleton';
  skeleton.setAttribute('aria-label', 'Loading deals');
  skeleton.innerHTML = `
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text medium"></div>
      <div class="skeleton-button" style="margin-top: var(--space-4, 16px);"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text medium"></div>
      <div class="skeleton-button" style="margin-top: var(--space-4, 16px);"></div>
    </div>
    <div class="skeleton-card">
      <div class="skeleton-image"></div>
      <div class="skeleton-title"></div>
      <div class="skeleton-text"></div>
      <div class="skeleton-text medium"></div>
      <div class="skeleton-button" style="margin-top: var(--space-4, 16px);"></div>
    </div>
  `;
  return skeleton;
}

// Export for use in other scripts
if (typeof window !== 'undefined') {
  window.announceToScreenReader = announceToScreenReader;
  window.prefersReducedMotion = prefersReducedMotion;
  window.trapFocus = trapFocus;
  window.validatePhoneInputEnhanced = validatePhoneInputEnhanced;
  window.initOfflineDetection = initOfflineDetection;
  window.createTrendingSkeleton = createTrendingSkeleton;
  window.createDealsSkeleton = createDealsSkeleton;
}

