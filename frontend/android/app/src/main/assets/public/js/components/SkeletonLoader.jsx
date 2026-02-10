/**
 * =============================================================================
 * ELIZIAN - SKELETON LOADER COMPONENT
 * =============================================================================
 * 
 * Features:
 * - Multiple skeleton types (card, list, table, profile)
 * - Shimmer animation effect
 * - Responsive design
 * - Customizable sizes
 * - Easy integration
 * 
 * Usage:
 * ```javascript
 * import SkeletonLoader from './components/SkeletonLoader.jsx';
 * 
 * // Show skeleton
 * const container = document.getElementById('deals-container');
 * SkeletonLoader.showDealCards(container, 6);
 * 
 * // Hide skeleton when data loads
 * SkeletonLoader.hide(container);
 * ```
 */

class SkeletonLoader {
  /**
   * Inject skeleton CSS styles
   */
  static injectStyles() {
    if (document.getElementById('skeleton-loader-styles')) return;

    const style = document.createElement('style');
    style.id = 'skeleton-loader-styles';
    style.textContent = `
      /* Skeleton Base */
      .skeleton {
        background: linear-gradient(
          90deg,
          #f0f0f0 0%,
          #f8f8f8 50%,
          #f0f0f0 100%
        );
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
        border-radius: 4px;
        display: inline-block;
        position: relative;
        overflow: hidden;
      }

      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }

      .skeleton-text {
        height: 16px;
        margin-bottom: 8px;
      }

      .skeleton-text.title {
        height: 24px;
        margin-bottom: 12px;
      }

      .skeleton-text.small {
        height: 12px;
      }

      .skeleton-circle {
        border-radius: 50%;
      }

      .skeleton-rect {
        border-radius: 8px;
      }

      /* Deal Card Skeleton */
      .skeleton-deal-card {
        background: white;
        border-radius: 12px;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
      }

      .skeleton-deal-image {
        width: 100%;
        height: 200px;
      }

      .skeleton-deal-content {
        padding: 16px;
      }

      .skeleton-deal-title {
        height: 20px;
        margin-bottom: 12px;
        width: 80%;
      }

      .skeleton-deal-text {
        height: 14px;
        margin-bottom: 8px;
      }

      .skeleton-deal-price {
        height: 24px;
        width: 40%;
        margin-top: 12px;
      }

      /* List Item Skeleton */
      .skeleton-list-item {
        display: flex;
        gap: 16px;
        padding: 16px;
        background: white;
        border-bottom: 1px solid #f0f0f0;
      }

      .skeleton-list-avatar {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        flex-shrink: 0;
      }

      .skeleton-list-content {
        flex: 1;
      }

      /* Table Row Skeleton */
      .skeleton-table-row {
        display: flex;
        gap: 16px;
        padding: 12px 16px;
        border-bottom: 1px solid #f0f0f0;
      }

      .skeleton-table-cell {
        flex: 1;
        height: 16px;
      }

      /* Profile Skeleton */
      .skeleton-profile {
        padding: 24px;
        background: white;
        border-radius: 12px;
      }

      .skeleton-profile-header {
        display: flex;
        gap: 16px;
        margin-bottom: 24px;
      }

      .skeleton-profile-avatar {
        width: 80px;
        height: 80px;
        border-radius: 50%;
      }

      .skeleton-profile-info {
        flex: 1;
      }

      /* Grid */
      .skeleton-grid {
        display: grid;
        gap: 24px;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      }

      /* Utility classes */
      .skeleton-container {
        width: 100%;
      }

      @media (max-width: 768px) {
        .skeleton-grid {
          grid-template-columns: 1fr;
        }
      }
    `;

    document.head.appendChild(style);
  }

  /**
   * Show deal card skeletons
   * @param {HTMLElement} container - Container element
   * @param {number} count - Number of skeletons to show
   */
  static showDealCards(container, count = 3) {
    this.injectStyles();

    const skeletonHTML = Array(count).fill(null).map(() => `
      <div class="skeleton-deal-card">
        <div class="skeleton skeleton-deal-image"></div>
        <div class="skeleton-deal-content">
          <div class="skeleton skeleton-deal-title"></div>
          <div class="skeleton skeleton-deal-text" style="width: 90%"></div>
          <div class="skeleton skeleton-deal-text" style="width: 70%"></div>
          <div class="skeleton skeleton-deal-price"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = `<div class="skeleton-grid">${skeletonHTML}</div>`;
  }

  /**
   * Show list item skeletons
   * @param {HTMLElement} container - Container element
   * @param {number} count - Number of skeletons to show
   */
  static showListItems(container, count = 5) {
    this.injectStyles();

    const skeletonHTML = Array(count).fill(null).map(() => `
      <div class="skeleton-list-item">
        <div class="skeleton skeleton-list-avatar"></div>
        <div class="skeleton-list-content">
          <div class="skeleton skeleton-text" style="width: 60%; margin-bottom: 8px;"></div>
          <div class="skeleton skeleton-text small" style="width: 80%;"></div>
          <div class="skeleton skeleton-text small" style="width: 40%;"></div>
        </div>
      </div>
    `).join('');

    container.innerHTML = skeletonHTML;
  }

  /**
   * Show table row skeletons
   * @param {HTMLElement} tbody - Table body element
   * @param {number} rows - Number of rows
   * @param {number} columns - Number of columns
   */
  static showTableRows(tbody, rows = 5, columns = 5) {
    this.injectStyles();

    const skeletonHTML = Array(rows).fill(null).map(() => `
      <tr>
        ${Array(columns).fill(null).map(() => `
          <td><div class="skeleton skeleton-table-cell"></div></td>
        `).join('')}
      </tr>
    `).join('');

    tbody.innerHTML = skeletonHTML;
  }

  /**
   * Show profile skeleton
   * @param {HTMLElement} container - Container element
   */
  static showProfile(container) {
    this.injectStyles();

    container.innerHTML = `
      <div class="skeleton-profile">
        <div class="skeleton-profile-header">
          <div class="skeleton skeleton-profile-avatar"></div>
          <div class="skeleton-profile-info">
            <div class="skeleton skeleton-text title" style="width: 40%; margin-bottom: 12px;"></div>
            <div class="skeleton skeleton-text" style="width: 60%; margin-bottom: 8px;"></div>
            <div class="skeleton skeleton-text small" style="width: 30%;"></div>
          </div>
        </div>
        <div class="skeleton skeleton-text" style="width: 100%; height: 80px; margin-bottom: 16px;"></div>
        <div class="skeleton skeleton-text" style="width: 100%; height: 40px;"></div>
      </div>
    `;
  }

  /**
   * Show custom skeleton
   * @param {HTMLElement} container - Container element
   * @param {Object} config - Configuration object
   */
  static showCustom(container, config = {}) {
    this.injectStyles();

    const {
      width = '100%',
      height = '20px',
      borderRadius = '4px',
      count = 1
    } = config;

    const skeletonHTML = Array(count).fill(null).map(() => `
      <div class="skeleton" style="width: ${width}; height: ${height}; border-radius: ${borderRadius}; margin-bottom: 8px;"></div>
    `).join('');

    container.innerHTML = skeletonHTML;
  }

  /**
   * Hide skeleton and show content
   * @param {HTMLElement} container - Container element
   * @param {string} content - HTML content to show
   */
  static hide(container, content = '') {
    if (content) {
      container.innerHTML = content;
    }
    // Add fade-in animation
    container.style.opacity = '0';
    setTimeout(() => {
      container.style.transition = 'opacity 0.3s ease-in';
      container.style.opacity = '1';
    }, 10);
  }

  /**
   * Show button loading spinner
   * @param {HTMLButtonElement} button - Button element
   */
  static showButtonSpinner(button) {
    if (!button) return;

    // Save original content
    button.dataset.originalContent = button.innerHTML;
    button.disabled = true;

    button.innerHTML = `
      <span style="display: inline-flex; align-items: center; gap: 8px;">
        <svg width="16" height="16" viewBox="0 0 50 50" style="animation: spin 1s linear infinite;">
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="80" stroke-dashoffset="60"/>
        </svg>
        Loading...
      </span>
    `;

    // Inject spin animation if not already present
    if (!document.getElementById('button-spinner-animation')) {
      const style = document.createElement('style');
      style.id = 'button-spinner-animation';
      style.textContent = `
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
    }
  }

  /**
   * Hide button loading spinner
   * @param {HTMLButtonElement} button - Button element
   */
  static hideButtonSpinner(button) {
    if (!button) return;

    button.disabled = false;
    button.innerHTML = button.dataset.originalContent || 'Submit';
    delete button.dataset.originalContent;
  }
}

// Export for use
export default SkeletonLoader;

// Also expose globally
if (typeof window !== 'undefined') {
  window.SkeletonLoader = SkeletonLoader;
}

