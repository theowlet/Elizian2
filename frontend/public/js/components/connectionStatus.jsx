/**
 * Connection Status Component
 * Shows real-time connection status in the UI
 * 
 * Only renders if real-time is enabled
 */

(function() {
  'use strict';

  const CONFIG = window.CONFIG || {};
  const FEATURES = CONFIG.FEATURES || {};
  const ENABLE_REALTIME = FEATURES.ENABLE_REALTIME === true;

  if (!ENABLE_REALTIME) {
    // Don't render if disabled
    return;
  }

  let statusElement = null;
  let isVisible = false;

  /**
   * Create status element
   */
  function createStatusElement() {
    const element = document.createElement('div');
    element.id = 'realtime-status';
    element.className = 'realtime-status';
    element.setAttribute('aria-live', 'polite');
    element.setAttribute('aria-label', 'Real-time connection status');
    
    // Initial state
    updateStatus('disconnected', 'Real-time disabled');
    
    return element;
  }

  /**
   * Update status display
   */
  function updateStatus(status, message) {
    if (!statusElement) {
      return;
    }

    statusElement.className = `realtime-status realtime-status-${status}`;
    statusElement.setAttribute('data-status', status);
    
    const icons = {
      connected: '🟢',
      connecting: '🟡',
      disconnected: '🔴',
      error: '❌'
    };

    const icon = icons[status] || '⚪';
    statusElement.innerHTML = `
      <span class="realtime-status-icon">${icon}</span>
      <span class="realtime-status-text">${message || status}</span>
    `;
  }

  /**
   * Show status element
   */
  function show() {
    if (isVisible || !statusElement) {
      return;
    }

    // Try to find header or create container
    const header = document.querySelector('.global-header, .landing-header, header');
    if (header) {
      header.appendChild(statusElement);
      isVisible = true;
    } else {
      // Fallback: add to body
      document.body.appendChild(statusElement);
      isVisible = true;
    }
  }

  /**
   * Hide status element
   */
  function hide() {
    if (statusElement && statusElement.parentNode) {
      statusElement.parentNode.removeChild(statusElement);
      isVisible = false;
    }
  }

  /**
   * Initialize component
   */
  function init() {
    if (!ENABLE_REALTIME) {
      return;
    }

    statusElement = createStatusElement();
    
    // Wait for real-time service to be available
    const checkService = setInterval(() => {
      if (window.realtimeService) {
        clearInterval(checkService);
        setupEventListeners();
        show();
      }
    }, 100);

    // Timeout after 5 seconds
    setTimeout(() => {
      clearInterval(checkService);
      if (!window.realtimeService) {
        console.warn('Real-time service not available');
        hide();
      }
    }, 5000);
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    if (!window.realtimeService) {
      return;
    }

    // Listen to connection events
    window.realtimeService.on('connected', () => {
      updateStatus('connected', 'Real-time active');
    });

    window.realtimeService.on('disconnected', () => {
      updateStatus('disconnected', 'Real-time disconnected');
    });

    window.realtimeService.on('error', () => {
      updateStatus('error', 'Connection error');
    });

    // Check status periodically
    setInterval(() => {
      if (window.realtimeService) {
        const status = window.realtimeService.getStatus();
        if (status.connected) {
          updateStatus('connected', 'Real-time active');
        } else if (status.pollingActive) {
          updateStatus('connecting', 'Using polling fallback');
        } else {
          updateStatus('disconnected', 'Real-time offline');
        }
      }
    }, 5000);
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Export API
  window.connectionStatus = {
    show,
    hide,
    updateStatus
  };

})();

