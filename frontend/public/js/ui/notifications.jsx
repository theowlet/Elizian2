/**
 * @module notifications
 * @description Centralized notification system
 * @author Elizian Team
 * @version 1.0.0
 */

import { CONFIG } from '../core/config.jsx';

// ==========================================
// NOTIFICATION TYPES
// ==========================================
const NOTIFICATION_TYPES = {
  SUCCESS: 'success',
  ERROR: 'error',
  WARNING: 'warning',
  INFO: 'info'
};

// ==========================================
// NOTIFICATION QUEUE
// ==========================================
let notificationQueue = [];
let isShowing = false;

// ==========================================
// PUBLIC FUNCTIONS
// ==========================================

/**
 * Show notification with specified type and duration
 * @param {string} message - Notification message
 * @param {string} type - Notification type (success, error, warning, info)
 * @param {number} duration - Duration in milliseconds (optional)
 * @returns {void}
 */
export function showNotification(message, type = NOTIFICATION_TYPES.INFO, duration = CONFIG.UI.notificationDuration) {
  const notification = {
    id: Date.now() + Math.random(),
    message,
    type,
    duration
  };
  
  notificationQueue.push(notification);
  processQueue();
}

/**
 * Show success notification
 * @param {string} message - Success message
 * @param {number} duration - Duration in milliseconds (optional)
 * @returns {void}
 */
export function showSuccess(message, duration) {
  showNotification(message, NOTIFICATION_TYPES.SUCCESS, duration);
}

/**
 * Show error notification
 * @param {string} message - Error message
 * @param {number} duration - Duration in milliseconds (optional)
 * @returns {void}
 */
export function showError(message, duration) {
  showNotification(message, NOTIFICATION_TYPES.ERROR, duration);
}

/**
 * Show warning notification
 * @param {string} message - Warning message
 * @param {number} duration - Duration in milliseconds (optional)
 * @returns {void}
 */
export function showWarning(message, duration) {
  showNotification(message, NOTIFICATION_TYPES.WARNING, duration);
}

/**
 * Show info notification
 * @param {string} message - Info message
 * @param {number} duration - Duration in milliseconds (optional)
 * @returns {void}
 */
export function showInfo(message, duration) {
  showNotification(message, NOTIFICATION_TYPES.INFO, duration);
}

// ==========================================
// PRIVATE FUNCTIONS
// ==========================================

/**
 * Process notification queue
 * @private
 */
function processQueue() {
  if (isShowing || notificationQueue.length === 0) {
    return;
  }
  
  const notification = notificationQueue.shift();
  displayNotification(notification);
}

/**
 * Display notification element
 * @param {Object} notification - Notification object
 * @private
 */
function displayNotification(notification) {
  isShowing = true;
  
  // Create notification element
  const element = createNotificationElement(notification);
  
  // Add to DOM
  const container = getNotificationContainer();
  container.appendChild(element);
  
  // Animate in
  setTimeout(() => {
    element.classList.add('show');
  }, 10);
  
  // Auto remove
  setTimeout(() => {
    removeNotification(element);
  }, notification.duration);
}

/**
 * Create notification DOM element
 * @param {Object} notification - Notification object
 * @returns {HTMLElement} Notification element
 * @private
 */
function createNotificationElement(notification) {
  const element = document.createElement('div');
  element.className = `notification notification-${notification.type}`;
  element.setAttribute('data-id', notification.id);
  
  const icon = getNotificationIcon(notification.type);
  
  element.innerHTML = `
    <div class="notification-content">
      <span class="notification-icon">${icon}</span>
      <span class="notification-message">${notification.message}</span>
      <button class="notification-close" onclick="removeNotification(this.parentElement.parentElement)">×</button>
    </div>
  `;
  
  return element;
}

/**
 * Get notification icon for type
 * @param {string} type - Notification type
 * @returns {string} Icon character
 * @private
 */
function getNotificationIcon(type) {
  const icons = {
    [NOTIFICATION_TYPES.SUCCESS]: '✅',
    [NOTIFICATION_TYPES.ERROR]: '❌',
    [NOTIFICATION_TYPES.WARNING]: '⚠️',
    [NOTIFICATION_TYPES.INFO]: 'ℹ️'
  };
  
  return icons[type] || icons[NOTIFICATION_TYPES.INFO];
}

/**
 * Get or create notification container
 * @returns {HTMLElement} Container element
 * @private
 */
function getNotificationContainer() {
  let container = document.getElementById('notification-container');
  
  if (!container) {
    container = document.createElement('div');
    container.id = 'notification-container';
    container.className = 'notification-container';
    document.body.appendChild(container);
  }
  
  return container;
}

/**
 * Remove notification element
 * @param {HTMLElement} element - Notification element
 * @private
 */
function removeNotification(element) {
  if (!element || !element.parentElement) return;
  
  element.classList.add('hide');
  
  setTimeout(() => {
    if (element.parentElement) {
      element.parentElement.removeChild(element);
    }
    isShowing = false;
    processQueue();
  }, 300);
}

// ==========================================
// EXPORTS
// ==========================================
export { NOTIFICATION_TYPES };




