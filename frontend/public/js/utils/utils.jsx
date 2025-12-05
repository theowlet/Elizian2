// ==================================
// UTILS MODULE - Helper Functions
// ==================================

// ==================================
// HTML & Text Utilities
// ==================================
export function escapeHtml(text) {
  if (typeof text !== 'string') return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function sanitizeInput(input) {
  if (typeof input !== 'string') return '';
  return input.trim().replace(/[<>]/g, '');
}

export function formatCurrency(amount, currency = '₹') {
  return `${currency}${parseFloat(amount || 0).toFixed(2)}`;
}

export function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

export function formatDateTime(dateString) {
  const date = new Date(dateString);
  return date.toLocaleString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// ==================================
// Phone Number Utilities
// ==================================
export function cleanPhoneNumber(phone) {
  return phone.replace(/\D/g, '');
}

export function validatePhoneNumber(phone) {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned.length === 10;
}

export function formatPhoneNumber(phone) {
  const cleaned = cleanPhoneNumber(phone);
  if (cleaned.length === 10) {
    return `+91 ${cleaned.slice(0, 5)} ${cleaned.slice(5)}`;
  }
  return phone;
}

// ==================================
// UI Utilities
// ==================================
export function disableButton(btnId) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.disabled = true;
    btn.style.opacity = '0.6';
  }
}

export function enableButton(btnId) {
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

export function showLoading(elementId, message = 'Loading...') {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        ${message}
      </div>
    `;
  }
}

export function hideLoading(elementId, content = '') {
  const element = document.getElementById(elementId);
  if (element) {
    element.innerHTML = content;
  }
}

// ==================================
// Validation Utilities
// ==================================
export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function validatePassword(password) {
  return password && password.length >= 6;
}

export function validateOTP(otp) {
  return otp && otp.length === 6 && /^\d{6}$/.test(otp);
}

// ==================================
// Distance & Location Utilities
// ==================================
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
}

export function formatDistance(distance) {
  if (distance < 1) {
    return `${(distance * 1000).toFixed(0)} m`;
  }
  return `${distance.toFixed(1)} km`;
}

// ==================================
// Storage Utilities
// ==================================
export function setStorageItem(key, value) {
  try {
    // Store strings as-is, objects as JSON
    const toStore = typeof value === 'string' ? value : JSON.stringify(value);
    localStorage.setItem(key, toStore);
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}

export function getStorageItem(key, defaultValue = null) {
  try {
    const item = localStorage.getItem(key);
    if (!item) return defaultValue;
    
    // Try to parse as JSON first
    try {
      return JSON.parse(item);
    } catch (parseError) {
      // If parsing fails, it might be a plain string (like a JWT token)
      // Check if it looks like a JWT token (starts with "eyJ")
      if (item.startsWith('eyJ')) {
        return item; // Return as-is for JWT tokens
      }
      // Otherwise, return the raw string
      return item;
    }
  } catch (error) {
    console.error('Storage error:', error);
    return defaultValue;
  }
}

export function removeStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error('Storage error:', error);
    return false;
  }
}

// ==================================
// Debounce & Throttle
// ==================================
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ==================================
// Error Handling
// ==================================
export function handleError(error, context = '') {
  console.error(`Error in ${context}:`, error);
  
  // You can add error reporting service here
  if (window.errorReporting) {
    window.errorReporting.report(error, context);
  }
  
  return {
    success: false,
    error: error.message || 'An unexpected error occurred',
    context
  };
}

// ==================================
// Export for global access
// ==================================
window.escapeHtml = escapeHtml;
window.sanitizeInput = sanitizeInput;
window.formatCurrency = formatCurrency;
window.formatDate = formatDate;
window.formatDateTime = formatDateTime;
window.cleanPhoneNumber = cleanPhoneNumber;
window.validatePhoneNumber = validatePhoneNumber;
window.formatPhoneNumber = formatPhoneNumber;
window.disableButton = disableButton;
window.enableButton = enableButton;
window.showLoading = showLoading;
window.hideLoading = hideLoading;
window.validateEmail = validateEmail;
window.validatePassword = validatePassword;
window.validateOTP = validateOTP;
window.calculateDistance = calculateDistance;
window.formatDistance = formatDistance;
window.setStorageItem = setStorageItem;
window.getStorageItem = getStorageItem;
window.removeStorageItem = removeStorageItem;
window.debounce = debounce;
window.throttle = throttle;
window.handleError = handleError;
