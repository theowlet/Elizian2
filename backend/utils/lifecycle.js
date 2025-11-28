// ============================================
// UNIVERSAL LIFECYCLE MANAGEMENT UTILITY
// Handles time-bound service expiry logic
// ============================================

/**
 * Compute the lifecycle status of a service item
 * @param {Object} item - Service item with lifecycle fields
 * @returns {string} - 'active', 'expired', 'scheduled', or 'archived'
 */
exports.computeLifecycleStatus = (item) => {
  if (!item) return 'active';
  
  const now = new Date();
  
  // FOR EVENTS: Use event_date and event_time if available
  if (item.service_type === 'events' && item.event_date) {
    try {
      // Parse event_date (handle timezone issues)
      let dateStr;
      if (typeof item.event_date === 'string') {
        // Extract just the date part (YYYY-MM-DD) regardless of timezone
        dateStr = item.event_date.includes('T') 
          ? item.event_date.split('T')[0] 
          : item.event_date;
      } else if (item.event_date instanceof Date) {
        // If it's a Date object, format it as YYYY-MM-DD in local time
        const year = item.event_date.getFullYear();
        const month = String(item.event_date.getMonth() + 1).padStart(2, '0');
        const day = String(item.event_date.getDate()).padStart(2, '0');
        dateStr = `${year}-${month}-${day}`;
      } else {
        dateStr = String(item.event_date);
      }
      
      // Parse event_time (remove timezone info)
      let timeStr = '00:00:00';
      if (item.event_time) {
        timeStr = typeof item.event_time === 'string'
          ? item.event_time.split('+')[0].split('Z')[0]
          : String(item.event_time);
        // Ensure HH:MM:SS format
        if (timeStr.split(':').length === 2) {
          timeStr += ':00';
        }
      }
      
      // Create event datetime in LOCAL timezone (not UTC)
      const eventDateTime = new Date(`${dateStr}T${timeStr}`);
      
      // Assume event duration (default 3 hours if not specified)
      const durationMs = (item.duration_minutes || 180) * 60 * 1000;
      const eventEndTime = new Date(eventDateTime.getTime() + durationMs);
      
      // Check if expired (event end time has passed)
      if (now > eventEndTime) {
        return 'expired';
      }
      
      // Check if scheduled for future (event hasn't started yet)
      if (now < eventDateTime) {
        return 'scheduled';
      }
      
      // Currently active (event is ongoing)
      return 'active';
    } catch (err) {
      console.error('Error computing event lifecycle status:', err, item);
      return 'active';
    }
  }
  
  // FOR TIME-BOUND SERVICES: Use lifecycle fields
  if (item.is_time_bound && item.end_time) {
    const endTime = new Date(item.end_time);
    const startTime = item.start_time ? new Date(item.start_time) : null;

    // Check if expired
    if (now > endTime) {
      return 'expired';
    }

    // Check if scheduled for future
    if (startTime && now < startTime) {
      return 'scheduled';
    }

    // Currently active
    return 'active';
  }
  
  // DEFAULT: Use is_available or status
  return item.status || 'active';
};

/**
 * Enrich items array with computed lifecycle status
 * @param {Array} items - Array of service items
 * @returns {Array} - Items with computed_status field added
 */
exports.enrichWithLifecycleStatus = (items) => {
  if (!Array.isArray(items)) return [];
  
  return items.map(item => ({
    ...item,
    computed_status: exports.computeLifecycleStatus(item)
  }));
};

/**
 * Separate items into active and archived based on lifecycle
 * @param {Array} items - Array of service items
 * @returns {Object} - { active: [], archived: [], scheduled: [] }
 */
exports.separateByLifecycle = (items) => {
  const enriched = exports.enrichWithLifecycleStatus(items);
  
  return {
    active: enriched.filter(i => i.computed_status === 'active'),
    archived: enriched.filter(i => i.computed_status === 'expired'),
    scheduled: enriched.filter(i => i.computed_status === 'scheduled')
  };
};

/**
 * Check if a service is bookable
 * @param {Object} item - Service item
 * @returns {boolean} - true if bookable, false otherwise
 */
exports.isBookable = (item) => {
  const status = exports.computeLifecycleStatus(item);
  return status === 'active' || status === 'scheduled';
};

/**
 * Get human-readable lifecycle message
 * @param {Object} item - Service item
 * @returns {string} - User-friendly message
 */
exports.getLifecycleMessage = (item) => {
  const status = exports.computeLifecycleStatus(item);
  
  switch (status) {
    case 'expired':
      return 'This service has expired and is no longer available for booking.';
    case 'scheduled':
      return `This service will be available from ${new Date(item.start_time).toLocaleString()}.`;
    case 'active':
      return 'This service is currently available for booking.';
    case 'archived':
      return 'This service has been archived.';
    default:
      return 'Service status unknown.';
  }
};

/**
 * Format time remaining until expiry
 * @param {Object} item - Service item
 * @returns {string|null} - Formatted time string or null
 */
exports.getTimeRemaining = (item) => {
  if (!item.is_time_bound || !item.end_time) return null;
  
  const now = new Date();
  const endTime = new Date(item.end_time);
  const diff = endTime - now;
  
  if (diff <= 0) return 'Expired';
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days} day${days > 1 ? 's' : ''} remaining`;
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  
  const minutes = Math.floor(diff / (1000 * 60));
  return `${minutes} minute${minutes > 1 ? 's' : ''} remaining`;
};

module.exports = exports;

