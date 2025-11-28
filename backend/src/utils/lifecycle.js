// Helper functions for menu item lifecycle status

function enrichWithLifecycleStatus(items) {
  return items.map(item => {
    const now = new Date();
    const computedStatus = computeLifecycleStatus(item, now);
    return {
      ...item,
      computed_status: computedStatus
    };
  });
}

function separateByLifecycle(items) {
  const now = new Date();
  const active = [];
  const archived = [];
  const scheduled = [];

  items.forEach(item => {
    const status = computeLifecycleStatus(item, now);
    if (status === 'active') {
      active.push(item);
    } else if (status === 'archived') {
      archived.push(item);
    } else if (status === 'scheduled') {
      scheduled.push(item);
    }
  });

  return { active, archived, scheduled };
}

function computeLifecycleStatus(item, now = new Date()) {
  // If status is explicitly set to 'archived', respect it
  if (item.status === 'archived') {
    return 'archived';
  }

  // Check if it's time-bound
  if (item.is_time_bound && item.start_time && item.end_time) {
    const start = new Date(item.start_time);
    const end = new Date(item.end_time);
    
    if (now < start) {
      return 'scheduled';
    } else if (now >= start && now <= end) {
      return 'active';
    } else {
      return 'archived';
    }
  }

  // Check event_date and event_time for event-type items
  if (item.service_type === 'events' && item.event_date && item.event_time) {
    const eventDate = new Date(`${item.event_date}T${item.event_time}`);
    if (now < eventDate) {
      return 'scheduled';
    } else {
      return 'archived';
    }
  }

  // Default: use is_available flag
  return item.is_available ? 'active' : 'archived';
}

module.exports = {
  enrichWithLifecycleStatus,
  separateByLifecycle,
  computeLifecycleStatus
};
