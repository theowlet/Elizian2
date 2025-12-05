/**
 * Mobile Enhancements - Phase 2
 * Pull-to-Refresh, Haptic Feedback, Bottom Sheets, Touch Targets
 */

/**
 * Pull-to-Refresh Implementation
 */
class PullToRefresh {
  constructor(container, onRefresh) {
    this.container = container;
    this.onRefresh = onRefresh;
    this.startY = 0;
    this.currentY = 0;
    this.isPulling = false;
    this.isRefreshing = false;
    this.threshold = 80; // pixels to pull before triggering refresh
    
    this.init();
  }
  
  init() {
    // Create indicator
    this.indicator = document.createElement('div');
    this.indicator.className = 'pull-to-refresh-indicator';
    this.indicator.innerHTML = `
      <div class="pull-to-refresh-spinner" style="display: none;"></div>
      <div class="pull-to-refresh-text">Pull to refresh</div>
    `;
    this.container.insertBefore(this.indicator, this.container.firstChild);
    
    // Add touch event listeners
    this.container.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
    this.container.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
    this.container.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
    
    // Prevent default pull-to-refresh on mobile browsers
    this.container.style.overscrollBehaviorY = 'contain';
  }
  
  handleTouchStart(e) {
    // Only trigger if at top of scroll
    if (this.container.scrollTop !== 0 || this.isRefreshing) return;
    
    this.startY = e.touches[0].pageY;
    this.isPulling = false;
  }
  
  handleTouchMove(e) {
    if (this.container.scrollTop !== 0 || this.isRefreshing) return;
    
    this.currentY = e.touches[0].pageY;
    const deltaY = this.currentY - this.startY;
    
    if (deltaY > 0 && !this.isPulling) {
      this.isPulling = true;
      e.preventDefault();
    }
    
    if (this.isPulling && deltaY > 0) {
      e.preventDefault();
      this.updateIndicator(deltaY);
    }
  }
  
  handleTouchEnd(e) {
    if (!this.isPulling) return;
    
    const deltaY = this.currentY - this.startY;
    
    if (deltaY >= this.threshold) {
      this.triggerRefresh();
    } else {
      this.resetIndicator();
    }
    
    this.isPulling = false;
  }
  
  updateIndicator(deltaY) {
    const progress = Math.min(deltaY / this.threshold, 1);
    const translateY = Math.min(deltaY * 0.5, this.threshold);
    
    this.indicator.style.opacity = progress;
    this.indicator.style.transform = `translateX(-50%) translateY(${translateY}px)`;
    
    if (deltaY >= this.threshold) {
      this.indicator.classList.add('releasing');
      this.indicator.querySelector('.pull-to-refresh-text').textContent = 'Release to refresh';
    } else {
      this.indicator.classList.remove('releasing');
      this.indicator.querySelector('.pull-to-refresh-text').textContent = 'Pull to refresh';
    }
  }
  
  async triggerRefresh() {
    this.isRefreshing = true;
    this.indicator.classList.add('active');
    this.indicator.querySelector('.pull-to-refresh-spinner').style.display = 'block';
    this.indicator.querySelector('.pull-to-refresh-text').textContent = 'Refreshing...';
    
    // Trigger haptic feedback
    triggerHapticFeedback('medium');
    
    try {
      await this.onRefresh();
    } catch (error) {
      console.error('Refresh error:', error);
    } finally {
      this.resetIndicator();
      this.isRefreshing = false;
    }
  }
  
  resetIndicator() {
    this.indicator.style.opacity = '0';
    this.indicator.style.transform = 'translateX(-50%) translateY(0)';
    this.indicator.classList.remove('active', 'releasing');
    this.indicator.querySelector('.pull-to-refresh-spinner').style.display = 'none';
    this.indicator.querySelector('.pull-to-refresh-text').textContent = 'Pull to refresh';
  }
}

/**
 * Haptic Feedback
 */
function triggerHapticFeedback(intensity = 'light') {
  if (!window.navigator.vibrate) return;
  
  const patterns = {
    light: 10,
    medium: 20,
    heavy: 30,
    success: [10, 50, 10],
    error: [20, 50, 20, 50, 20],
    warning: [15, 50, 15]
  };
  
  const pattern = patterns[intensity] || patterns.light;
  navigator.vibrate(pattern);
}

/**
 * Bottom Sheet Modal
 */
class BottomSheet {
  constructor(options = {}) {
    this.id = options.id || `bottomsheet-${Date.now()}`;
    this.title = options.title || '';
    this.subtitle = options.subtitle || '';
    this.content = options.content || '';
    this.footer = options.footer || null;
    this.onClose = options.onClose || null;
    this.onOpen = options.onOpen || null;
    this.dismissible = options.dismissible !== false;
    
    this.create();
  }
  
  create() {
    // Overlay
    this.overlay = document.createElement('div');
    this.overlay.className = 'bottom-sheet-overlay';
    this.overlay.setAttribute('aria-hidden', 'true');
    this.overlay.setAttribute('role', 'dialog');
    this.overlay.setAttribute('aria-modal', 'true');
    this.overlay.setAttribute('aria-labelledby', `${this.id}-title`);
    
    // Bottom Sheet
    this.sheet = document.createElement('div');
    this.sheet.className = 'bottom-sheet';
    this.sheet.id = this.id;
    
    // Handle
    const handle = document.createElement('div');
    handle.className = 'bottom-sheet-handle';
    handle.setAttribute('aria-hidden', 'true');
    
    // Header
    const header = document.createElement('div');
    header.className = 'bottom-sheet-header';
    if (this.title) {
      const titleEl = document.createElement('h2');
      titleEl.className = 'bottom-sheet-title';
      titleEl.id = `${this.id}-title`;
      titleEl.textContent = this.title;
      header.appendChild(titleEl);
    }
    if (this.subtitle) {
      const subtitleEl = document.createElement('p');
      subtitleEl.className = 'bottom-sheet-subtitle';
      subtitleEl.textContent = this.subtitle;
      header.appendChild(subtitleEl);
    }
    
    // Content
    const content = document.createElement('div');
    content.className = 'bottom-sheet-content';
    if (typeof this.content === 'string') {
      content.innerHTML = this.content;
    } else if (this.content instanceof HTMLElement) {
      content.appendChild(this.content);
    }
    
    // Footer
    let footer = null;
    if (this.footer) {
      footer = document.createElement('div');
      footer.className = 'bottom-sheet-footer';
      if (typeof this.footer === 'string') {
        footer.innerHTML = this.footer;
      } else if (this.footer instanceof HTMLElement) {
        footer.appendChild(this.footer);
      }
    }
    
    // Assemble
    this.sheet.appendChild(handle);
    if (this.title || this.subtitle) {
      this.sheet.appendChild(header);
    }
    this.sheet.appendChild(content);
    if (footer) {
      this.sheet.appendChild(footer);
    }
    
    this.overlay.appendChild(this.sheet);
    
    // Event listeners
    if (this.dismissible) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
      
      // Swipe down to close
      let startY = 0;
      let currentY = 0;
      
      this.sheet.addEventListener('touchstart', (e) => {
        startY = e.touches[0].pageY;
      }, { passive: true });
      
      this.sheet.addEventListener('touchmove', (e) => {
        currentY = e.touches[0].pageY;
        const deltaY = currentY - startY;
        
        if (deltaY > 0 && this.sheet.scrollTop === 0) {
          e.preventDefault();
          this.sheet.style.transform = `translateY(${deltaY}px)`;
        }
      }, { passive: false });
      
      this.sheet.addEventListener('touchend', () => {
        const deltaY = currentY - startY;
        if (deltaY > 100) {
          this.close();
        } else {
          this.sheet.style.transform = '';
        }
        startY = 0;
        currentY = 0;
      }, { passive: true });
    }
  }
  
  open() {
    document.body.appendChild(this.overlay);
    document.body.style.overflow = 'hidden';
    
    // Trigger animation
    requestAnimationFrame(() => {
      this.overlay.classList.add('active');
      this.sheet.classList.add('active');
      this.overlay.setAttribute('aria-hidden', 'false');
    });
    
    // Focus management
    const firstFocusable = this.sheet.querySelector('button, a, input, textarea, select, [tabindex]:not([tabindex="-1"])');
    if (firstFocusable) {
      firstFocusable.focus();
    }
    
    // Trap focus
    if (window.trapFocus) {
      window.trapFocus(this.sheet);
    }
    
    // Trigger haptic feedback
    triggerHapticFeedback('light');
    
    if (this.onOpen) {
      this.onOpen();
    }
  }
  
  close() {
    this.overlay.classList.remove('active');
    this.sheet.classList.remove('active');
    this.overlay.setAttribute('aria-hidden', 'true');
    
    setTimeout(() => {
      if (this.overlay.parentNode) {
        this.overlay.parentNode.removeChild(this.overlay);
      }
      document.body.style.overflow = '';
    }, 300);
    
    if (this.onClose) {
      this.onClose();
    }
  }
  
  updateContent(content) {
    const contentEl = this.sheet.querySelector('.bottom-sheet-content');
    if (contentEl) {
      if (typeof content === 'string') {
        contentEl.innerHTML = content;
      } else if (content instanceof HTMLElement) {
        contentEl.innerHTML = '';
        contentEl.appendChild(content);
      }
    }
  }
}

/**
 * Initialize Mobile Enhancements
 */
function initMobileEnhancements() {
  // Add haptic feedback to buttons
  document.querySelectorAll('button, .btn, [role="button"]').forEach(btn => {
    if (!btn.classList.contains('no-haptic')) {
      btn.classList.add('haptic-feedback', 'btn-ripple');
      btn.addEventListener('click', () => {
        triggerHapticFeedback('light');
      });
    }
  });
  
  // Initialize pull-to-refresh on main container
  const mainContainer = document.getElementById('main-content') || document.querySelector('.mobile-container');
  if (mainContainer && window.loadHomeScreenData) {
    new PullToRefresh(mainContainer, async () => {
      await window.loadHomeScreenData();
      if (window.announceToScreenReader) {
        window.announceToScreenReader('Content refreshed', 'polite');
      }
    });
  }
  
  // Ensure all interactive elements meet touch target size
  document.querySelectorAll('button, a, input[type="button"], input[type="submit"]').forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 44 || rect.height < 44) {
      el.style.minWidth = '44px';
      el.style.minHeight = '44px';
      el.style.padding = el.style.padding || 'var(--space-2, 8px) var(--space-3, 12px)';
    }
  });
}

// Export for global use
if (typeof window !== 'undefined') {
  window.PullToRefresh = PullToRefresh;
  window.BottomSheet = BottomSheet;
  window.triggerHapticFeedback = triggerHapticFeedback;
  window.initMobileEnhancements = initMobileEnhancements;
}

