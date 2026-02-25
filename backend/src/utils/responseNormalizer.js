/**
 * Response Normalizer Utility
 * Ensures all API responses have consistent, safe shapes with fallbacks
 */
const { FALLBACK_IMAGE_URL } = require('./offerImageUrl');

/**
 * Normalizes an offer/deal object to ensure all fields are present with safe defaults
 * @param {Object} offer - Raw offer from database
 * @returns {Object} Normalized offer with guaranteed fields
 */
function normalizeOffer(offer) {
  if (!offer || typeof offer !== 'object') {
    return getEmptyOffer();
  }

  const trendingFlag = Boolean(offer.is_trending || offer.is_promoted);
  const originalPrice = parseFloat(offer.original_price) || null;
  const discountedPrice = parseFloat(offer.discounted_price) || null;
  // Single source of truth: co_pay_percentage from DB only; never derive from prices or ezt_equivalent
  const rawCoPay = offer.co_pay_percentage != null ? Number(offer.co_pay_percentage) : NaN;
  const coPayPercentage = Number.isFinite(rawCoPay) ? Math.round(rawCoPay * 100) / 100 : null;
  const discountAmount = parseFloat(offer.discount_amount) || null;

  // Calculate discount summary
  let calculatedDiscounted = discountedPrice;
  if (!calculatedDiscounted && originalPrice) {
    if (coPayPercentage) {
      calculatedDiscounted = originalPrice - (originalPrice * coPayPercentage / 100);
    } else if (discountAmount) {
      calculatedDiscounted = originalPrice - discountAmount;
    } else {
      calculatedDiscounted = originalPrice;
    }
  }

  // Ensure calculatedDiscounted is valid
  if (!calculatedDiscounted || calculatedDiscounted < 0 || isNaN(calculatedDiscounted)) {
    calculatedDiscounted = originalPrice || null;
  }

  const savings = (originalPrice && calculatedDiscounted) 
    ? Math.max(0, originalPrice - calculatedDiscounted)
    : 0;

  const hasDiscount = originalPrice > 0 && calculatedDiscounted < originalPrice;

  // Normalize image URL — keep full URLs; only prefix relative keys; never use a path that 404s on the frontend
  let imageUrl = offer.image_url || null;
  if (imageUrl && typeof imageUrl === 'string') {
    const t = imageUrl.trim();
    if (t.startsWith('http://') || t.startsWith('https://') || t.startsWith('data:')) {
      imageUrl = t;
    } else if (t.startsWith('/')) {
      imageUrl = t;
    } else {
      imageUrl = `/${t}`;
    }
  }

  return {
    id: offer.id || null,
    title: offer.title || 'Untitled Offer',
    description: offer.description || '',
    partner_id: offer.partner_id || null,
    partner_name: offer.partner_name || offer.name || 'Unknown Partner',
    service_type: offer.service_type || 'others',
    category_name: offer.category_name || null,

    // Image: preserve repo URL or use shared fallback (single source: offerImageUrl.FALLBACK_IMAGE_URL)
    image_url: imageUrl || FALLBACK_IMAGE_URL,
    
    // Discount object with all fields
    discount: {
      original: originalPrice,
      discounted: calculatedDiscounted,
      percentage: coPayPercentage,
      amount: discountAmount,
      savings: parseFloat(savings.toFixed(2)),
      hasDiscount: hasDiscount
    },
    
    // Legacy fields for backward compatibility
    original_price: originalPrice,
    discounted_price: calculatedDiscounted,
    co_pay_percentage: coPayPercentage,
    discount_amount: discountAmount,
    savings: parseFloat(savings.toFixed(2)),
    
    // Status and flags
    status: offer.status || 'draft',
    is_active: offer.is_active !== undefined ? Boolean(offer.is_active) : true,
    is_trending: trendingFlag,
    is_promoted: trendingFlag,
    
    // Dates
    start_date: offer.start_date || null,
    end_date: offer.end_date || null,
    created_at: offer.created_at || null,
    updated_at: offer.updated_at || null,
    
    // Additional fields
    terms_conditions: offer.terms_conditions || null,
    max_redemptions: offer.max_redemptions || null,
    applicable_days: offer.applicable_days || null,
    min_purchase_amount: parseFloat(offer.min_purchase_amount) || null,
    promo_code: offer.promo_code || null,
    ezt_equivalent: parseFloat(offer.ezt_equivalent) || null,

    // Geo & discovery (Phase 1 Rich Venue Feed)
    distance_km: offer.distance_km != null ? Number(offer.distance_km) : null,
    partner_approved_for_featured: Boolean(offer.partner_approved_for_featured),
    perk_type: offer.perk_type || 'discount',
    perk_description: offer.perk_description || null,
    partner_rating: offer.partner_rating != null ? Number(offer.partner_rating) : null,
    partner_latitude: offer.partner_latitude != null ? Number(offer.partner_latitude) : null,
    partner_longitude: offer.partner_longitude != null ? Number(offer.partner_longitude) : null,
    partner_cuisine_types: offer.partner_cuisine_types || null,
    partner_avg_cost_for_two: offer.partner_avg_cost_for_two != null ? Number(offer.partner_avg_cost_for_two) : null,
    min_tier_name: offer.min_tier_name || null,
    experience_metadata: offer.experience_metadata || undefined,
  };
}

/**
 * Returns an empty offer object with all required fields
 */
function getEmptyOffer() {
  return {
    id: null,
    title: 'Untitled Offer',
    description: '',
    partner_id: null,
    partner_name: 'Unknown Partner',
    service_type: 'others',
    category_name: null,
    image_url: FALLBACK_IMAGE_URL,
    discount: {
      original: null,
      discounted: null,
      percentage: null,
      amount: null,
      savings: 0,
      hasDiscount: false
    },
    original_price: null,
    discounted_price: null,
    co_pay_percentage: null,
    discount_amount: null,
    savings: 0,
    status: 'draft',
    is_active: true,
    is_promoted: false,
    is_trending: false,
    start_date: null,
    end_date: null,
    created_at: null,
    updated_at: null,
    terms_conditions: null,
    max_redemptions: null,
    applicable_days: null,
    min_purchase_amount: null,
    promo_code: null,
    ezt_equivalent: null
  };
}

/**
 * Normalizes an array of offers
 */
function normalizeOffers(offers) {
  if (!Array.isArray(offers)) {
    return [];
  }
  return offers.map(normalizeOffer);
}

/**
 * Normalizes a partner object
 */
function normalizePartner(partner) {
  if (!partner || typeof partner !== 'object') {
    return getEmptyPartner();
  }

  let imageUrl = partner.image_url || partner.logo_url || null;
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
    imageUrl = `/${imageUrl}`;
  }

  return {
    id: partner.id || null,
    name: partner.name || 'Unknown Partner',
    email: partner.email || null,
    phone_number: partner.phone_number || partner.phone || null,
    address: partner.address || null,
    description: partner.description || '',
    category_id: partner.category_id || null,
    category_name: partner.category_name || null,
    service_type: partner.service_type || 'others',
    image_url: imageUrl || '/assets/default-offer.jpg',
    rating: parseFloat(partner.rating) || null,
    latitude: parseFloat(partner.latitude) || null,
    longitude: parseFloat(partner.longitude) || null,
    partner_discount_percentage: parseFloat(partner.partner_discount_percentage) || 0,
    is_active: partner.is_active !== undefined ? Boolean(partner.is_active) : true,
    status: partner.status || 'pending',
    menu_images: Array.isArray(partner.menu_images) ? partner.menu_images : [],
    created_at: partner.created_at || null,
    updated_at: partner.updated_at || null
  };
}

function getEmptyPartner() {
  return {
    id: null,
    name: 'Unknown Partner',
    email: null,
    phone_number: null,
    address: null,
    description: '',
    category_id: null,
    category_name: null,
    service_type: 'others',
    image_url: '/assets/default-offer.jpg',
    rating: null,
    latitude: null,
    longitude: null,
    partner_discount_percentage: 0,
    is_active: true,
    status: 'pending',
    menu_images: [],
    created_at: null,
    updated_at: null
  };
}

/**
 * Normalizes an event object
 */
function normalizeEvent(event) {
  if (!event || typeof event !== 'object') {
    return getEmptyEvent();
  }

  let imageUrl = event.image_url || null;
  if (imageUrl && !imageUrl.startsWith('http') && !imageUrl.startsWith('/')) {
    imageUrl = `/${imageUrl}`;
  }

  return {
    id: event.id || null,
    title: event.title || 'Untitled Event',
    description: event.description || '',
    partner_id: event.partner_id || null,
    partner_name: event.partner_name || 'Unknown Organizer',
    service_type: event.service_type || 'events',
    image_url: imageUrl || '/assets/event-default.jpg',
    price_per_ticket: parseFloat(event.price_per_ticket) || 0,
    start_time: event.start_time || null,
    end_time: event.end_time || null,
    venue_name: event.venue_name || null,
    organizer_name: event.organizer_name || null,
    max_capacity: parseInt(event.max_capacity, 10) || null,
    is_active: event.is_active !== undefined ? Boolean(event.is_active) : true,
    created_at: event.created_at || null,
    updated_at: event.updated_at || null
  };
}

function getEmptyEvent() {
  return {
    id: null,
    title: 'Untitled Event',
    description: '',
    partner_id: null,
    partner_name: 'Unknown Organizer',
    service_type: 'events',
    image_url: '/assets/event-default.jpg',
    price_per_ticket: 0,
    start_time: null,
    end_time: null,
    venue_name: null,
    organizer_name: null,
    max_capacity: null,
    is_active: true,
    created_at: null,
    updated_at: null
  };
}

module.exports = {
  normalizeOffer,
  normalizeOffers,
  normalizePartner,
  normalizeEvent,
  getEmptyOffer,
  getEmptyPartner,
  getEmptyEvent
};

