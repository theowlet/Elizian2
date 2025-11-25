/**
 * =============================================================================
 * ELIZIAN - NOTIFICATION CENTER COMPONENT
 * =============================================================================
 * 
 * Features:
 * - Toast notifications (success, error, warning, info)
 * - In-app notification bell with dropdown
 * - Persistent storage in localStorage
 * - Real-time updates
 * - Mark as read/unread
 * - Delete notifications
 * - Sound notifications (optional)
 * - Auto-dismiss for toasts
 * 
 * Usage:
 * ```javascript
 * import NotificationCenter from './components/NotificationCenter.js';
 * const notifications = new NotificationCenter();
 * 
 * // Show toast
 * notifications.showToast('Booking confirmed!', 'success');
 * 
 * // Add in-app notification
 * notifications.addNotification({
 *   title: 'Tier Upgraded',
 *   message: 'You are now in Valiant tier!',
 *   type: 'success',
 *   actionUrl: '/profile'
 * });
 * ```
 */

class NotificationCenter {
  constructor(options = {}) {
    this.options = {
      maxNotifications: 50,
      toastDuration: 5000,
      soundEnabled: false,
      autoMarkAsRead: true,
      ...options
    };

    this.notifications = this.loadNotifications();
    this.toastContainer = null;
    this.bellIcon = null;
    this.dropdown = null;
    
    this.init();
  }

  /**
   * Initialize notification center
   */
  init() {
    this.createToastContainer();
    this.createBellIcon();
    this.createDropdown();
    this.updateBadge();
    this.attachEventListeners();
  }

  /**
   * Create toast container
   */
  createToastContainer() {
    if (document.getElementById('toast-container')) return;

    const container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
    this.toastContainer = container;

    // Add styles
    this.injectStyles();
  }

  /**
   * Create notification bell icon
   */
  createBellIcon() {
    // Check if bell already exists
    let bellContainer = document.getElementById('notification-bell');
    
    if (!bellContainer) {
      bellContainer = document.createElement('div');
      bellContainer.id = 'notification-bell';
      bellContainer.className = 'notification-bell-container';
      bellContainer.innerHTML = `
        <button class="notification-bell-btn" aria-label="Notifications">
          <svg class="bell-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
          <span class="notification-badge hidden">0</span>
        </button>
      `;

      // Inject into header/topbar
      const header = document.querySelector('.header, .topbar, header');
      if (header) {
        header.appendChild(bellContainer);
      } else {
        document.body.appendChild(bellContainer);
      }
    }

    this.bellIcon = bellContainer.querySelector('.notification-bell-btn');
  }

  /**
   * Create notification dropdown
   */
  createDropdown() {
    let dropdown = document.getElementById('notification-dropdown');
    
    if (!dropdown) {
      dropdown = document.createElement('div');
      dropdown.id = 'notification-dropdown';
      dropdown.className = 'notification-dropdown hidden';
      dropdown.innerHTML = `
        <div class="notification-dropdown-header">
          <h3>Notifications</h3>
          <div class="notification-actions">
            <button class="btn-text" id="markAllRead">Mark all read</button>
            <button class="btn-text" id="clearAll">Clear all</button>
          </div>
        </div>
        <div class="notification-list" id="notificationList">
          <div class="no-notifications">No notifications</div>
        </div>
      `;
      
      const bellContainer = document.getElementById('notification-bell');
      if (bellContainer) {
        bellContainer.appendChild(dropdown);
      }
    }

    this.dropdown = dropdown;
    this.renderNotifications();
  }

  /**
   * Inject CSS styles
   */
  injectStyles() {
    if (document.getElementById('notification-center-styles')) return;

    const style = document.createElement('style');
    style.id = 'notification-center-styles';
    style.textContent = `
      /* Toast Container */
      .toast-container {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        display: flex;
        flex-direction: column;
        gap: 10px;
        pointer-events: none;
      }

      /* Toast */
      .toast {
        background: white;
        border-radius: 8px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
        padding: 16px 20px;
        min-width: 300px;
        max-width: 400px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
        pointer-events: all;
        animation: slideInRight 0.3s ease-out;
        border-left: 4px solid #000;
      }

      .toast.success { border-left-color: #4CAF50; }
      .toast.error { border-left-color: #f44336; }
      .toast.warning { border-left-color: #ff9800; }
      .toast.info { border-left-color: #2196F3; }

      .toast-icon {
        font-size: 24px;
        flex-shrink: 0;
      }

      .toast-content {
        flex: 1;
      }

      .toast-title {
        font-weight: 600;
        margin: 0 0 4px 0;
        font-size: 14px;
      }

      .toast-message {
        margin: 0;
        font-size: 13px;
        color: #666;
      }

      .toast-close {
        background: none;
        border: none;
        font-size: 20px;
        cursor: pointer;
        padding: 0;
        color: #999;
        flex-shrink: 0;
      }

      .toast-close:hover {
        color: #333;
      }

      @keyframes slideInRight {
        from {
          transform: translateX(400px);
          opacity: 0;
        }
        to {
          transform: translateX(0);
          opacity: 1;
        }
      }

      @keyframes slideOutRight {
        from {
          transform: translateX(0);
          opacity: 1;
        }
        to {
          transform: translateX(400px);
          opacity: 0;
        }
      }

      /* Bell Icon */
      .notification-bell-container {
        position: relative;
      }

      .notification-bell-btn {
        background: none;
        border: none;
        cursor: pointer;
        padding: 8px;
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 50%;
        transition: background 0.2s;
      }

      .notification-bell-btn:hover {
        background: rgba(0, 0, 0, 0.05);
      }

      .bell-icon {
        color: #333;
      }

      .notification-badge {
        position: absolute;
        top: 4px;
        right: 4px;
        background: #f44336;
        color: white;
        border-radius: 10px;
        padding: 2px 6px;
        font-size: 11px;
        font-weight: 600;
        min-width: 18px;
        text-align: center;
      }

      .notification-badge.hidden {
        display: none;
      }

      /* Dropdown */
      .notification-dropdown {
        position: absolute;
        top: calc(100% + 8px);
        right: 0;
        width: 380px;
        max-height: 500px;
        background: white;
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
        overflow: hidden;
        z-index: 1000;
      }

      .notification-dropdown.hidden {
        display: none;
      }

      .notification-dropdown-header {
        padding: 16px;
        border-bottom: 1px solid #e0e0e0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .notification-dropdown-header h3 {
        margin: 0;
        font-size: 16px;
        font-weight: 600;
      }

      .notification-actions {
        display: flex;
        gap: 12px;
      }

      .btn-text {
        background: none;
        border: none;
        color: #5E17EB;
        cursor: pointer;
        font-size: 13px;
        padding: 0;
      }

      .btn-text:hover {
        text-decoration: underline;
      }

      .notification-list {
        max-height: 400px;
        overflow-y: auto;
      }

      .notification-item {
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
        cursor: pointer;
        transition: background 0.2s;
        display: flex;
        gap: 12px;
      }

      .notification-item:hover {
        background: #f9f9f9;
      }

      .notification-item.unread {
        background: #f5f0ff;
      }

      .notification-item-icon {
        font-size: 20px;
        flex-shrink: 0;
      }

      .notification-item-content {
        flex: 1;
        min-width: 0;
      }

      .notification-item-title {
        font-weight: 600;
        font-size: 14px;
        margin: 0 0 4px 0;
      }

      .notification-item-message {
        font-size: 13px;
        color: #666;
        margin: 0 0 4px 0;
      }

      .notification-item-time {
        font-size: 12px;
        color: #999;
      }

      .notification-item-delete {
        background: none;
        border: none;
        color: #999;
        cursor: pointer;
        font-size: 18px;
        padding: 0;
        flex-shrink: 0;
      }

      .notification-item-delete:hover {
        color: #f44336;
      }

      .no-notifications {
        padding: 40px 20px;
        text-align: center;
        color: #999;
        font-size: 14px;
      }

      @media (max-width: 480px) {
        .toast-container {
          right: 10px;
          left: 10px;
          top: 10px;
        }

        .toast {
          min-width: unset;
          max-width: unset;
        }

        .notification-dropdown {
          width: 100vw;
          max-width: 100vw;
          right: -16px;
          left: auto;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Show toast notification
   * @param {string} message - Notification message
   * @param {string} type - Type: success, error, warning, info
   * @param {Object} options - Additional options
   */
  showToast(message, type = 'info', options = {}) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    const titles = {
      success: 'Success',
      error: 'Error',
      warning: 'Warning',
      info: 'Info'
    };

    toast.innerHTML = `
      <div class="toast-icon">${icons[type]}</div>
      <div class="toast-content">
        <div class="toast-title">${options.title || titles[type]}</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" aria-label="Close">&times;</button>
    `;

    this.toastContainer.appendChild(toast);

    // Close button
    toast.querySelector('.toast-close').addEventListener('click', () => {
      this.dismissToast(toast);
    });

    // Auto dismiss
    const duration = options.duration !== undefined ? options.duration : this.options.toastDuration;
    if (duration > 0) {
      setTimeout(() => {
        this.dismissToast(toast);
      }, duration);
    }

    // Play sound
    if (this.options.soundEnabled && type === 'success') {
      this.playSound();
    }
  }

  /**
   * Dismiss toast
   */
  dismissToast(toast) {
    toast.style.animation = 'slideOutRight 0.3s ease-in';
    setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 300);
  }

  /**
   * Add in-app notification
   * @param {Object} notification - Notification object
   */
  addNotification(notification) {
    const newNotification = {
      id: Date.now() + Math.random(),
      title: notification.title,
      message: notification.message,
      type: notification.type || 'info',
      timestamp: new Date().toISOString(),
      read: false,
      actionUrl: notification.actionUrl || null,
      ...notification
    };

    this.notifications.unshift(newNotification);

    // Limit notifications
    if (this.notifications.length > this.options.maxNotifications) {
      this.notifications = this.notifications.slice(0, this.options.maxNotifications);
    }

    this.saveNotifications();
    this.renderNotifications();
    this.updateBadge();
  }

  /**
   * Render notifications in dropdown
   */
  renderNotifications() {
    const list = document.getElementById('notificationList');
    if (!list) return;

    if (this.notifications.length === 0) {
      list.innerHTML = '<div class="no-notifications">No notifications</div>';
      return;
    }

    const icons = {
      success: '✓',
      error: '✕',
      warning: '⚠',
      info: 'ℹ'
    };

    list.innerHTML = this.notifications.map(notif => `
      <div class="notification-item ${notif.read ? '' : 'unread'}" data-id="${notif.id}">
        <div class="notification-item-icon">${icons[notif.type] || 'ℹ'}</div>
        <div class="notification-item-content">
          <div class="notification-item-title">${notif.title}</div>
          <div class="notification-item-message">${notif.message}</div>
          <div class="notification-item-time">${this.formatTime(notif.timestamp)}</div>
        </div>
        <button class="notification-item-delete" data-id="${notif.id}" aria-label="Delete">&times;</button>
      </div>
    `).join('');

    // Attach event listeners
    list.querySelectorAll('.notification-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('notification-item-delete')) return;
        this.handleNotificationClick(item.dataset.id);
      });
    });

    list.querySelectorAll('.notification-item-delete').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deleteNotification(btn.dataset.id);
      });
    });
  }

  /**
   * Handle notification click
   */
  handleNotificationClick(id) {
    const notif = this.notifications.find(n => n.id == id);
    if (!notif) return;

    // Mark as read
    notif.read = true;
    this.saveNotifications();
    this.renderNotifications();
    this.updateBadge();

    // Navigate to action URL
    if (notif.actionUrl) {
      window.location.href = notif.actionUrl;
    }
  }

  /**
   * Delete notification
   */
  deleteNotification(id) {
    this.notifications = this.notifications.filter(n => n.id != id);
    this.saveNotifications();
    this.renderNotifications();
    this.updateBadge();
  }

  /**
   * Mark all as read
   */
  markAllAsRead() {
    this.notifications.forEach(n => n.read = true);
    this.saveNotifications();
    this.renderNotifications();
    this.updateBadge();
  }

  /**
   * Clear all notifications
   */
  clearAll() {
    this.notifications = [];
    this.saveNotifications();
    this.renderNotifications();
    this.updateBadge();
  }

  /**
   * Update badge count
   */
  updateBadge() {
    const badge = document.querySelector('.notification-badge');
    if (!badge) return;

    const unreadCount = this.notifications.filter(n => !n.read).length;
    
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.classList.remove('hidden');
    } else {
      badge.classList.add('hidden');
    }
  }

  /**
   * Attach event listeners
   */
  attachEventListeners() {
    // Toggle dropdown
    if (this.bellIcon) {
      this.bellIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        this.dropdown.classList.toggle('hidden');
      });
    }

    // Close dropdown when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.dropdown.contains(e.target) && !this.bellIcon.contains(e.target)) {
        this.dropdown.classList.add('hidden');
      }
    });

    // Mark all as read
    const markAllBtn = document.getElementById('markAllRead');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', () => {
        this.markAllAsRead();
      });
    }

    // Clear all
    const clearAllBtn = document.getElementById('clearAll');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear all notifications?')) {
          this.clearAll();
        }
      });
    }
  }

  /**
   * Format timestamp
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  /**
   * Play notification sound
   */
  playSound() {
    // Simple beep sound using Web Audio API
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
      console.log('Sound notification failed:', error);
    }
  }

  /**
   * Load notifications from localStorage
   */
  loadNotifications() {
    try {
      const stored = localStorage.getItem('elizian_notifications');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      console.error('Failed to load notifications:', error);
      return [];
    }
  }

  /**
   * Save notifications to localStorage
   */
  saveNotifications() {
    try {
      localStorage.setItem('elizian_notifications', JSON.stringify(this.notifications));
    } catch (error) {
      console.error('Failed to save notifications:', error);
    }
  }

  /**
   * Get unread count
   */
  getUnreadCount() {
    return this.notifications.filter(n => !n.read).length;
  }

  /**
   * Destroy notification center
   */
  destroy() {
    if (this.toastContainer) {
      this.toastContainer.remove();
    }
    if (this.bellIcon) {
      this.bellIcon.parentElement.remove();
    }
    if (this.dropdown) {
      this.dropdown.remove();
    }
  }
}

// Export for use
export default NotificationCenter;

// Also expose globally for non-module scripts
if (typeof window !== 'undefined') {
  window.NotificationCenter = NotificationCenter;
}

