/**
 * Image URL Utilities
 * Normalizes image paths, provides fallbacks, and handles errors
 */

const API_BASE = window.API_BASE || "http://localhost:3000";
const DEFAULT_OFFER_IMAGE = '/assets/default-offer.jpg';
const DEFAULT_EVENT_IMAGE = '/assets/event-default.jpg';
const DEFAULT_PARTNER_IMAGE = '/assets/default-offer.jpg';

/**
 * Normalizes an image URL to a full path
 * @param {string|null|undefined} imageUrl - Raw image URL from API
 * @param {string} fallback - Fallback image path
 * @returns {string} Normalized image URL
 */
export function normalizeImageUrl(imageUrl, fallback = DEFAULT_OFFER_IMAGE) {
  if (!imageUrl || typeof imageUrl !== 'string') {
    return fallback;
  }

  const trimmed = imageUrl.trim();
  if (!trimmed || trimmed === '{}' || trimmed === 'null' || trimmed === 'undefined') {
    return fallback;
  }

  // Already a full URL
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }

  // Relative path - ensure it starts with /
  const normalized = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  
  // If it's an upload path, prepend API_BASE
  if (normalized.startsWith('/uploads/')) {
    return `${API_BASE}${normalized}`;
  }

  // Otherwise return as-is (for assets)
  return normalized;
}

/**
 * Gets offer image URL with fallback
 * @param {Object} offer - Offer object
 * @returns {string} Image URL
 */
export function getOfferImageUrl(offer) {
  return normalizeImageUrl(offer?.image_url || offer?.imageUrl, DEFAULT_OFFER_IMAGE);
}

/**
 * Gets event image URL with fallback
 * @param {Object} event - Event object
 * @returns {string} Image URL
 */
export function getEventImageUrl(event) {
  return normalizeImageUrl(event?.image_url || event?.imageUrl, DEFAULT_EVENT_IMAGE);
}

/**
 * Gets partner image URL with fallback
 * @param {Object} partner - Partner object
 * @returns {string} Image URL
 */
export function getPartnerImageUrl(partner) {
  return normalizeImageUrl(partner?.image_url || partner?.logo_url || partner?.imageUrl, DEFAULT_PARTNER_IMAGE);
}

/**
 * Creates an image element with error handling
 * @param {string} src - Image source URL
 * @param {string} alt - Alt text
 * @param {Object} attributes - Additional attributes
 * @returns {HTMLImageElement} Image element
 */
export function createImageElement(src, alt = '', attributes = {}) {
  const img = document.createElement('img');
  img.src = normalizeImageUrl(src);
  img.alt = alt || 'Image';
  
  // Add error handler
  img.onerror = function() {
    this.src = DEFAULT_OFFER_IMAGE;
    this.onerror = null; // Prevent infinite loop
  };

  // Add loading handler
  img.loading = attributes.loading || 'lazy';
  
  // Apply additional attributes
  Object.entries(attributes).forEach(([key, value]) => {
    if (key !== 'loading') {
      img.setAttribute(key, value);
    }
  });

  return img;
}

/**
 * Gets image HTML string with error handling
 * @param {string} src - Image source URL
 * @param {string} alt - Alt text
 * @param {string} className - CSS class
 * @param {Object} style - Inline styles
 * @returns {string} Image HTML
 */
export function getImageHtml(src, alt = '', className = '', style = {}) {
  const normalizedSrc = normalizeImageUrl(src);
  const styleStr = Object.entries(style)
    .map(([key, value]) => `${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${value}`)
    .join('; ');

  return `<img 
    src="${normalizedSrc}" 
    alt="${escapeHtml(alt || 'Image')}" 
    class="${className}"
    style="${styleStr}"
    loading="lazy"
    onerror="this.src='${DEFAULT_OFFER_IMAGE}'; this.onerror=null;"
  />`;
}

/**
 * Escapes HTML to prevent XSS
 * @param {string} text - Text to escape
 * @returns {string} Escaped text
 */
function escapeHtml(text) {
  if (typeof text !== 'string') {
    return '';
  }
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Preloads an image
 * @param {string} src - Image source URL
 * @returns {Promise<HTMLImageElement>} Promise that resolves when image loads
 */
export function preloadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => {
      // Try fallback
      const fallbackImg = new Image();
      fallbackImg.src = DEFAULT_OFFER_IMAGE;
      fallbackImg.onload = () => resolve(fallbackImg);
      fallbackImg.onerror = () => reject(new Error('Failed to load image and fallback'));
    };
    img.src = normalizeImageUrl(src);
  });
}

