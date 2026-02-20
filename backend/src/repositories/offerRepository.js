const { getPool } = require("../config/db");
const { normalizeApplicableDays } = require("../utils/dealRules");
const { buildDynamicFilters, needsMetadataJoin } = require("../utils/dynamicFilterBuilder");
const { log, logError } = require("../../utils/logger");
const { getS3FileUrl } = require("../../utils/s3Bucket");

const pool = getPool();

/** S3 key for default offer image when offer has no image_url (same storage pattern as other deals). */
const DEFAULT_OFFER_IMAGE_S3_KEY = "uploads/default-offer.jpg";

const STATUS = {
  DRAFT: "draft",
  PENDING: "pending_approval",
  ACTIVE: "active",
  PAUSED: "paused",
  REJECTED: "rejected",
  EXPIRED: "expired",
};

function sanitizeStatus(status) {
  const normalized = (status || "").toLowerCase();
  return Object.values(STATUS).includes(normalized) ? normalized : STATUS.DRAFT;
}

function isStatusActive(status) {
  return status === STATUS.ACTIVE;
}

// Get offer by ID
// requireApproval=true: only return if partner is approved (for strict public listing).
// requireApproval=false: return if deal is active and within dates; partner filter not applied (caller checks suspended/rejected).
async function getOfferById(offerId, requireApproval = true) {
  const params = [offerId];
  // Case-insensitive status; use date-only comparison to avoid timezone issues
  let query = `
    SELECT po.*, p.id as partner_id, p.name AS partner_name, p.is_active as partner_is_active,
           p.status as partner_status, p.latitude AS partner_latitude, p.longitude AS partner_longitude,
           p.address AS partner_address, p.phone_number AS partner_phone, p.email AS partner_email
    FROM partner_offers po
    JOIN partners p ON po.partner_id = p.id
    WHERE po.id = $1
      AND (LOWER(TRIM(COALESCE(po.status::text, ''))) = 'active' OR po.is_active = true)
      AND (po.start_date IS NULL OR po.start_date::date <= CURRENT_DATE)
      AND (po.end_date IS NULL OR po.end_date::date >= CURRENT_DATE)
  `;

  if (requireApproval) {
    query += ` AND p.is_active = true
               AND (p.status IS NULL OR LOWER(TRIM(p.status::text)) IN ('active', 'approved'))`;
  }

  const result = await pool.query(query, params);
  return result.rows[0];
}

// Fetch offer by ID only (no status/date filter). For booking flow to return a specific error when offer exists but is not bookable.
async function getOfferByIdRaw(offerId) {
  const result = await pool.query(
    `SELECT po.*, p.id as partner_id, p.name AS partner_name, p.is_active as partner_is_active,
            p.status as partner_status
     FROM partner_offers po
     JOIN partners p ON po.partner_id = p.id
     WHERE po.id = $1`,
    [offerId]
  );
  return result.rows[0];
}

// List offers by partner ID
async function listOffersByPartner(partnerId) {
  const result = await pool.query(
    `SELECT * FROM partner_offers
     WHERE partner_id = $1
     ORDER BY created_at DESC`,
    [partnerId]
  );
  return result.rows;
}

// Create offer
async function createOffer(partnerId, offerData) {
  const {
    title,
    description,
    service_type,
    discount_amount,
    co_pay_percentage,
    original_price,
    discounted_price,
    offer_type = "percentage",
    terms_conditions,
    image_url,
    start_date,
    end_date,
    max_redemptions,
    applicable_days,
    applicable_categories,
    min_purchase_amount,
    promo_code,
    menu_item_id,
    applicable_menu_items,
    discount_applies_to = "standalone",
    savings,
    ezt_equivalent,
    featured_request_pending = false,
    is_trending = false,
    forced_by_admin = false,
    status = STATUS.DRAFT,
    perk_type = "discount",
    perk_description,
  } = offerData;

  const processedApplicableDays = normalizeApplicableDays(applicable_days);
  const finalImageUrl = image_url !== undefined ? image_url : null;
  const applicableCategoriesJson = applicable_categories
    ? JSON.stringify(applicable_categories)
    : null;
  const applicableMenuItemsArray = Array.isArray(applicable_menu_items)
    ? applicable_menu_items
    : null;
  const finalStatus = sanitizeStatus(status);
  const finalIsActive = isStatusActive(finalStatus);

  await ensureStatusMetadata();
  await ensureOfferPerkColumns();

  const insertCols = [
    "partner_id", "title", "description", "service_type", "co_pay_percentage", "discount_amount",
    "original_price", "discounted_price", "offer_type", "terms_conditions",
    "image_url", "start_date", "end_date", "is_trending", "max_redemptions",
    "applicable_days", "applicable_categories", "min_purchase_amount", "promo_code",
    "menu_item_id", "applicable_menu_items", "discount_applies_to",
    "is_active",
  ];
  const insertVals = [
    partnerId,
    title,
    description,
    service_type,
    co_pay_percentage != null ? co_pay_percentage : null,
    discount_amount,
    original_price,
    discounted_price,
    offer_type,
    terms_conditions,
    finalImageUrl,
    start_date,
    end_date,
    is_trending,
    max_redemptions,
    processedApplicableDays,
    applicableCategoriesJson,
    min_purchase_amount,
    promo_code,
    menu_item_id || null,
    applicableMenuItemsArray,
    discount_applies_to,
    finalIsActive,
  ];
  if (offerSavingsColumnExists) {
    insertCols.push("savings");
    insertVals.push(savings != null ? savings : null);
  }
  if (offerEztEquivalentColumnExists) {
    insertCols.push("ezt_equivalent");
    insertVals.push(ezt_equivalent != null ? ezt_equivalent : null);
  }
  if (offerFeaturedRequestPendingColumnExists) {
    insertCols.push("featured_request_pending");
    insertVals.push(featured_request_pending);
  }
  if (offerForcedByAdminColumnExists) {
    insertCols.push("forced_by_admin");
    insertVals.push(forced_by_admin);
  }
  if (offerStatusColumnExists) {
    insertCols.push("status");
    insertVals.push(finalStatus);
  }
  if (offerPerkTypeColumnExists) {
    insertCols.push("perk_type");
    insertVals.push(perk_type || "discount");
  }
  if (offerPerkDescriptionColumnExists) {
    insertCols.push("perk_description");
    insertVals.push(perk_description || null);
  }

  const placeholders = insertVals.map((_, i) => `$${i + 1}`).join(", ");
  const result = await pool.query(
    `INSERT INTO partner_offers (${insertCols.join(", ")})
     VALUES (${placeholders})
     RETURNING *`,
    insertVals
  );

  return result.rows[0];
}

// Update offer
async function updateOffer(partnerId, offerId, updates) {
  await ensureStatusMetadata();
  await ensureOfferPerkColumns();

  const allowedFields = [
    "title",
    "description",
    "service_type",
    "co_pay_percentage",
    "discount_amount",
    "original_price",
    "discounted_price",
    "offer_type",
    "terms_conditions",
    "image_url",
    "start_date",
    "end_date",
    "is_trending",
    "max_redemptions",
    "applicable_days",
    "applicable_categories",
    "min_purchase_amount",
    "promo_code",
    "menu_item_id",
    "applicable_menu_items",
    "discount_applies_to",
    ...(offerSavingsColumnExists ? ["savings"] : []),
    ...(offerEztEquivalentColumnExists ? ["ezt_equivalent"] : []),
    ...(offerFeaturedRequestPendingColumnExists ? ["featured_request_pending"] : []),
    ...(offerForcedByAdminColumnExists ? ["forced_by_admin"] : []),
    ...(offerStatusColumnExists ? ["status"] : []),
    ...(offerPerkTypeColumnExists ? ["perk_type"] : []),
    ...(offerPerkDescriptionColumnExists ? ["perk_description"] : []),
  ];

  const numericFields = new Set([
    "co_pay_percentage", "discount_amount",
    "original_price", "discounted_price", "min_purchase_amount",
    "savings", "ezt_equivalent", "max_redemptions"
  ]);

  const updateFields = [];
  const values = [];
  let paramCount = 0;
  let nextStatusValue = null;

  for (const [key, value] of Object.entries(updates)) {
    if (allowedFields.includes(key) && value !== undefined) {
      paramCount++;
      if (key === "applicable_categories" && typeof value === "object") {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(JSON.stringify(value));
      } else if (key === "applicable_menu_items" && Array.isArray(value)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      } else if (key === "applicable_days") {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(normalizeApplicableDays(value));
      } else if (key === "status") {
        const normalizedStatus = sanitizeStatus(value);
        nextStatusValue = normalizedStatus;
        updateFields.push(`${key} = $${paramCount}`);
        values.push(normalizedStatus);
      } else if (numericFields.has(key)) {
        const num = value === "" || value === null ? null : Number(value);
        updateFields.push(`${key} = $${paramCount}`);
        values.push(num === undefined || Number.isNaN(num) ? null : num);
      } else {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
      }
    }
  }

  if (updateFields.length === 0) {
    throw new Error("No valid fields to update");
  }

  if (nextStatusValue !== null) {
    paramCount++;
    updateFields.push(`is_active = $${paramCount}`);
    values.push(isStatusActive(nextStatusValue));
  }

  // Add updated_at (doesn't need a parameter)
  updateFields.push("updated_at = CURRENT_TIMESTAMP");

  // Add WHERE clause parameters
  paramCount++;
  values.push(partnerId);
  paramCount++;
  values.push(offerId);

  const result = await pool.query(
    `UPDATE partner_offers 
     SET ${updateFields.join(", ")}
     WHERE partner_id = $${paramCount - 1} AND id = $${paramCount}
     RETURNING *`,
    values
  );
  return result.rows[0];
}

// Delete offer
async function deleteOffer(partnerId, offerId) {
  const result = await pool.query(
    `DELETE FROM partner_offers WHERE id = $1 AND partner_id = $2 RETURNING *`,
    [offerId, partnerId]
  );
  return result.rows[0];
}

// Get single offer by partner and offer ID (for partner console edit)
async function getOfferByPartnerAndId(partnerId, offerId) {
  const result = await pool.query(
    "SELECT * FROM partner_offers WHERE id = $1 AND partner_id = $2",
    [offerId, partnerId]
  );
  return result.rows[0];
}

// Get offer for update (with lock)
async function getOfferForUpdate(partnerId, offerId) {
  const result = await pool.query(
    "SELECT * FROM partner_offers WHERE id = $1 AND partner_id = $2 FOR UPDATE",
    [offerId, partnerId]
  );
  return result.rows[0];
}

// Increment offer redemption count
// CRITICAL: Accept executor parameter to support transactions
// This ensures atomicity when incrementing redemptions during booking creation
async function incrementOfferRedemptions(offerId, executor = pool) {
  await executor.query(
    "UPDATE partner_offers SET current_redemptions = COALESCE(current_redemptions, 0) + 1 WHERE id = $1",
    [offerId]
  );
}

/**
 * Atomic redemption limit: increment only if under max_redemptions.
 * Returns updated row or null if limit reached (caller must throw).
 * Use inside booking transaction to prevent over-redemption under concurrency.
 */
async function incrementOfferRedemptionsAtomic(offerId, executor = pool) {
  const result = await executor.query(
    `UPDATE partner_offers
     SET current_redemptions = COALESCE(current_redemptions, 0) + 1
     WHERE id = $1
       AND (max_redemptions IS NULL OR (COALESCE(current_redemptions, 0) + 1) <= max_redemptions)
     RETURNING *`,
    [offerId]
  );
  return result.rows[0] || null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

let offerStatusColumnExists = null;
let partnerStatusColumnExists = null;
let partnerRatingColumnExists = null;
let partnerCuisineTypesColumnExists = null;
let partnerAvgCostForTwoColumnExists = null;
let partnerApprovedForFeaturedColumnExists = null;
let offerPerkTypeColumnExists = null;
let offerPerkDescriptionColumnExists = null;
let offerCoPayPercentageColumnExists = null;
let offerFeaturedRequestPendingColumnExists = null;
let offerForcedByAdminColumnExists = null;
let offerSavingsColumnExists = null;
let offerEztEquivalentColumnExists = null;

async function checkColumnExists(tableName, columnName) {
  try {
    const result = await pool.query(
      `
      SELECT 1 
      FROM information_schema.columns 
      WHERE table_schema = 'public'
        AND table_name = $1
        AND column_name = $2
      LIMIT 1
      `,
      [tableName, columnName]
    );
    return result.rowCount > 0;
  } catch (error) {
    logError(
      `[offerRepository] Failed to check column ${columnName} on ${tableName}`,
      error
    );
    return false;
  }
}

async function ensureStatusMetadata() {
  if (offerStatusColumnExists === null) {
    offerStatusColumnExists = await checkColumnExists(
      "partner_offers",
      "status"
    );
    log(
      `[offerRepository] partner_offers.status column present: ${offerStatusColumnExists}`
    );
  }
  if (partnerStatusColumnExists === null) {
    partnerStatusColumnExists = await checkColumnExists("partners", "status");
    log(
      `[offerRepository] partners.status column present: ${partnerStatusColumnExists}`
    );
  }
}

async function ensurePartnerOptionalColumns() {
  if (partnerRatingColumnExists === null) {
    partnerRatingColumnExists = await checkColumnExists("partners", "rating");
  }
  if (partnerCuisineTypesColumnExists === null) {
    partnerCuisineTypesColumnExists = await checkColumnExists("partners", "cuisine_types");
  }
  if (partnerAvgCostForTwoColumnExists === null) {
    partnerAvgCostForTwoColumnExists = await checkColumnExists("partners", "avg_cost_for_two");
  }
  if (partnerApprovedForFeaturedColumnExists === null) {
    partnerApprovedForFeaturedColumnExists = await checkColumnExists("partners", "approved_for_featured");
  }
}

async function ensureOfferPerkColumns() {
  if (offerPerkTypeColumnExists === null) {
    offerPerkTypeColumnExists = await checkColumnExists("partner_offers", "perk_type");
  }
  if (offerPerkDescriptionColumnExists === null) {
    offerPerkDescriptionColumnExists = await checkColumnExists("partner_offers", "perk_description");
  }
  if (offerCoPayPercentageColumnExists === null) {
    offerCoPayPercentageColumnExists = await checkColumnExists("partner_offers", "co_pay_percentage");
  }
  if (offerFeaturedRequestPendingColumnExists === null) {
    offerFeaturedRequestPendingColumnExists = await checkColumnExists("partner_offers", "featured_request_pending");
  }
  if (offerForcedByAdminColumnExists === null) {
    offerForcedByAdminColumnExists = await checkColumnExists("partner_offers", "forced_by_admin");
  }
  if (offerSavingsColumnExists === null) {
    offerSavingsColumnExists = await checkColumnExists("partner_offers", "savings");
  }
  if (offerEztEquivalentColumnExists === null) {
    offerEztEquivalentColumnExists = await checkColumnExists("partner_offers", "ezt_equivalent");
  }
}

// List public offers with filters
async function listPublicOffers(filters = {}) {
  await ensureStatusMetadata();
  await ensurePartnerOptionalColumns();
  await ensureOfferPerkColumns();

  const {
    status = null,
    not_expired = false,
    has_started = false,
    service_type = null,
    trending = null,
    limit = DEFAULT_LIMIT,
    admin = false,
    cuisine_types = null,
    price_min = null,
    price_max = null,
    min_rating = null,
    user_latitude = null,
    user_longitude = null,
    max_distance_km = null,
    partner_ids = null,
    // Dynamic (experience_metadata) filters — optional, backward compatible
    meal_type = null,
    therapy_type = null,
    duration_min = null,
    duration_max = null,
    event_type = null,
    event_date = null,
    star_rating = null,
    refundable = null,
    specialization = null,
  } = filters;

  const sanitizedLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const params = [];
  const conditions = [];
  let paramIndex = 1;

  // Partner must not be suspended or rejected (allow pending/active/approved so listing matches booking eligibility)
  if (partnerStatusColumnExists) {
    conditions.push(
      "(p.status IS NULL OR LOWER(TRIM(p.status::text)) NOT IN ('suspended', 'rejected'))"
    );
  } else {
    conditions.push("p.is_active = true");
  }

  const shouldEnforceActive = !admin && offerStatusColumnExists;
  if (offerStatusColumnExists && (status || shouldEnforceActive)) {
    const enforcedStatus = (status || STATUS.ACTIVE).toString().toLowerCase().trim();
    // Use ::text and LOWER so it works for enum/varchar and any casing
    conditions.push(`(LOWER(TRIM(po.status::text)) = $${paramIndex} OR po.is_active = true)`);
    params.push(enforcedStatus);
    paramIndex += 1;
  } else if (!offerStatusColumnExists && !admin) {
    conditions.push("po.is_active = true");
  } else if (!offerStatusColumnExists && status) {
    const expectActive = status === STATUS.ACTIVE;
    conditions.push(`po.is_active = $${paramIndex}`);
    params.push(expectActive);
    paramIndex += 1;
  }

  if (not_expired) {
    conditions.push(
      "(po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)"
    );
  }

  if (has_started) {
    conditions.push(
      "(po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)"
    );
  }

  if (partner_ids && Array.isArray(partner_ids) && partner_ids.length > 0) {
    conditions.push(`po.partner_id = ANY($${paramIndex}::uuid[])`);
    params.push(partner_ids);
    paramIndex += 1;
  }

  if (service_type) {
    conditions.push(`po.service_type = $${paramIndex}`);
    params.push(service_type);
    paramIndex += 1;
  }

  if (trending !== null && trending !== undefined) {
    conditions.push(`po.is_trending = $${paramIndex}`);
    params.push(trending);
    paramIndex += 1;
  }

  // Filter by cuisine types (if partner has matching cuisines; only when column exists)
  if (
    partnerCuisineTypesColumnExists &&
    cuisine_types &&
    Array.isArray(cuisine_types) &&
    cuisine_types.length > 0
  ) {
    conditions.push(`p.cuisine_types && $${paramIndex}::text[]`);
    params.push(cuisine_types);
    paramIndex += 1;
  }

  // Filter by price range
  if (price_min !== null && price_min !== undefined) {
    conditions.push(
      `(po.discounted_price >= $${paramIndex} OR (po.discounted_price IS NULL AND po.original_price >= $${paramIndex}))`
    );
    params.push(price_min);
    paramIndex += 1;
  }
  if (price_max !== null && price_max !== undefined) {
    conditions.push(
      `(po.discounted_price <= $${paramIndex} OR (po.discounted_price IS NULL AND po.original_price <= $${paramIndex}))`
    );
    params.push(price_max);
    paramIndex += 1;
  }

  // Filter by minimum rating (only when column exists)
  if (
    partnerRatingColumnExists &&
    min_rating !== null &&
    min_rating !== undefined
  ) {
    conditions.push(`p.rating >= $${paramIndex}`);
    params.push(min_rating);
    paramIndex += 1;
  }

  // Dynamic category-specific filters (experience_metadata); LEFT JOIN added below when needed
  const useMetadataJoin = needsMetadataJoin({
    service_type,
    cuisine: cuisine_types,
    mealType: meal_type,
    therapyType: therapy_type,
    durationMin: duration_min,
    durationMax: duration_max,
    eventType: event_type,
    eventDate: event_date,
    starRating: star_rating,
    refundable,
    specialization,
  });
  let metadataJoin = "";
  let metadataSelect = "";
  if (useMetadataJoin) {
    const dyn = buildDynamicFilters(
      {
        service_type,
        cuisine: cuisine_types,
        mealType: meal_type,
        therapyType: therapy_type,
        durationMin: duration_min,
        durationMax: duration_max,
        eventType: event_type,
        eventDate: event_date,
        starRating: star_rating,
        refundable,
        specialization,
      },
      paramIndex
    );
    dyn.conditions.forEach((c) => conditions.push(c));
    dyn.values.forEach((v) => params.push(v));
    paramIndex = dyn.paramOffset;
    metadataJoin = " LEFT JOIN experience_metadata em ON em.offer_id = po.id ";
    metadataSelect = `,
      em.cuisine AS em_cuisine, em.meal_type AS em_meal_type, em.therapy_type AS em_therapy_type,
      em.duration_minutes AS em_duration_minutes, em.event_type AS em_event_type, em.event_date AS em_event_date,
      em.seats_left AS em_seats_left, em.star_rating AS em_star_rating, em.refundable AS em_refundable,
      em.breakfast_included AS em_breakfast_included, em.specialization AS em_specialization,
      em.consultation_fee AS em_consultation_fee, em.verified AS em_verified, em.tags AS em_tags`;
  }

  const hasUserLocation =
    user_latitude !== null &&
    user_longitude !== null &&
    !Number.isNaN(user_latitude) &&
    !Number.isNaN(user_longitude);

  // Filter by max distance when user location + max_distance_km provided
  if (hasUserLocation && max_distance_km != null && max_distance_km > 0) {
    conditions.push(`
      (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians($${paramIndex})) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($${paramIndex + 1})) +
        sin(radians($${paramIndex})) * sin(radians(p.latitude))
      )))) <= $${paramIndex + 2}
    `);
    params.push(user_latitude, user_longitude, max_distance_km);
    paramIndex += 3;
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  // When user location provided: compute distance_km for sorting and display (geo-sorting)
  const distanceSelect = hasUserLocation
    ? `, (6371 * acos(LEAST(1, GREATEST(-1,
        cos(radians($${paramIndex})) * cos(radians(p.latitude)) * cos(radians(p.longitude) - radians($${paramIndex + 1})) +
        sin(radians($${paramIndex})) * sin(radians(p.latitude))
      )))) AS distance_km`
    : "";
  if (hasUserLocation) {
    params.push(user_latitude, user_longitude);
    paramIndex += 2;
  }

  const orderByClause = hasUserLocation
    ? `ORDER BY distance_km ASC NULLS LAST, CASE WHEN po.is_trending = true THEN 1 ELSE 0 END DESC, po.created_at DESC`
    : `ORDER BY CASE WHEN po.is_trending = true THEN 1 ELSE 0 END DESC, po.created_at DESC`;

  const partnerSelectParts = [
    "p.name AS partner_name",
    "p.email AS partner_email",
    "p.phone_number AS partner_phone",
    "p.address AS partner_address",
  ];
  if (partnerCuisineTypesColumnExists) partnerSelectParts.push("p.cuisine_types AS partner_cuisine_types");
  if (partnerRatingColumnExists) partnerSelectParts.push("p.rating AS partner_rating");
  partnerSelectParts.push("p.latitude AS partner_latitude", "p.longitude AS partner_longitude");
  if (partnerAvgCostForTwoColumnExists) partnerSelectParts.push("p.avg_cost_for_two AS partner_avg_cost_for_two");
  if (partnerApprovedForFeaturedColumnExists) partnerSelectParts.push("p.approved_for_featured AS partner_approved_for_featured");
  const partnerSelect = partnerSelectParts.join(",\n      ");

  const poStatusSelect = offerStatusColumnExists ? "po.status," : "";
  const poPerkSelect = [
    offerPerkTypeColumnExists && "po.perk_type",
    offerPerkDescriptionColumnExists && "po.perk_description",
  ].filter(Boolean).join(",\n      ");
  const query = `
    SELECT 
      po.id,
      po.partner_id,
      po.title,
      po.description,
      po.original_price,
      po.discounted_price,
      po.co_pay_percentage,
      po.discount_amount,
      po.start_date,
      po.end_date,
      ${poStatusSelect}
      po.is_active,
      po.is_trending,
      po.max_redemptions,
      po.current_redemptions,
      po.service_type,
      po.image_url,
      po.terms_conditions,
      ${poPerkSelect ? poPerkSelect + "," : ""}
      po.created_at,
      ${partnerSelect}
      ${distanceSelect}
      ${metadataSelect}
    FROM partner_offers po
    JOIN partners p ON po.partner_id = p.id
    ${metadataJoin}
    ${whereClause}
    ${orderByClause}
    LIMIT $${paramIndex}
  `;

  params.push(sanitizedLimit);

  log("[offerRepository] listPublicOffers query", {
    admin,
    status,
    not_expired,
    has_started,
    service_type,
    trending,
    limit: sanitizedLimit,
    whereClause,
  });

  try {
    const result = await pool.query(query, params);
    log("[offerRepository] listPublicOffers result", {
      count: result.rows.length,
    });

    return result.rows.map((row) => ({
      id: row.id,
      partner_id: row.partner_id,
      partner_name: row.partner_name,
      partner_email: row.partner_email,
      partner_phone: row.partner_phone,
      partner_address: row.partner_address,
      title: row.title,
      description: row.description,
      original_price:
        row.original_price !== null ? Number(row.original_price) : null,
      discounted_price:
        row.discounted_price !== null ? Number(row.discounted_price) : null,
      co_pay_percentage:
        row.co_pay_percentage !== null
          ? Number(row.co_pay_percentage)
          : null,
      discount_amount:
        row.discount_amount !== null ? Number(row.discount_amount) : null,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status != null ? row.status : (row.is_active ? STATUS.ACTIVE : STATUS.DRAFT),
      is_active: row.is_active,
      is_trending: row.is_trending,
      max_redemptions: row.max_redemptions,
      current_redemptions: row.current_redemptions,
      service_type: row.service_type,
      image_url: (row.image_url ? getS3FileUrl(row.image_url) : null) || getS3FileUrl(DEFAULT_OFFER_IMAGE_S3_KEY),
      terms_conditions: row.terms_conditions,
      perk_type: row.perk_type || 'discount',
      perk_description: row.perk_description || null,
      min_tier_name: row.min_tier_name ?? null,
      created_at: row.created_at,
      partner_cuisine_types: row.partner_cuisine_types || [],
      partner_rating:
        row.partner_rating != null && !Number.isNaN(Number(row.partner_rating)) ? Number(row.partner_rating) : null,
      partner_latitude:
        row.partner_latitude != null ? Number(row.partner_latitude) : null,
      partner_longitude:
        row.partner_longitude != null ? Number(row.partner_longitude) : null,
      partner_avg_cost_for_two:
        row.partner_avg_cost_for_two != null && !Number.isNaN(Number(row.partner_avg_cost_for_two))
          ? Number(row.partner_avg_cost_for_two)
          : null,
      distance_km:
        row.distance_km != null && !Number.isNaN(Number(row.distance_km))
          ? Math.round(Number(row.distance_km) * 10) / 10
          : null,
      partner_approved_for_featured: row.partner_approved_for_featured == null ? false : Boolean(row.partner_approved_for_featured),
      // Experience metadata (optional; null when no row in experience_metadata)
      experience_metadata: useMetadataJoin ? {
        cuisine: row.em_cuisine || null,
        meal_type: row.em_meal_type || null,
        therapy_type: row.em_therapy_type || null,
        duration_minutes: row.em_duration_minutes != null ? Number(row.em_duration_minutes) : null,
        event_type: row.em_event_type || null,
        event_date: row.em_event_date || null,
        seats_left: row.em_seats_left != null ? Number(row.em_seats_left) : null,
        star_rating: row.em_star_rating != null ? Number(row.em_star_rating) : null,
        refundable: row.em_refundable != null ? Boolean(row.em_refundable) : null,
        breakfast_included: row.em_breakfast_included != null ? Boolean(row.em_breakfast_included) : null,
        specialization: row.em_specialization || null,
        consultation_fee: row.em_consultation_fee != null ? Number(row.em_consultation_fee) : null,
        verified: row.em_verified != null ? Boolean(row.em_verified) : null,
        tags: row.em_tags || null,
      } : undefined,
    }));
  } catch (error) {
    if (useMetadataJoin && (error.message || "").includes("experience_metadata")) {
      log("[offerRepository] experience_metadata table missing; retrying without dynamic filters");
      const fallbackFilters = { ...filters, meal_type: null, therapy_type: null, duration_min: null, duration_max: null, event_type: null, event_date: null, star_rating: null, refundable: null, specialization: null };
      return listPublicOffers(fallbackFilters);
    }
    logError("[offerRepository] listPublicOffers query failed", { error: error.message });
    throw error;
  }
}

/**
 * Get public offers by exact IDs (for curated collections). Returns same shape as listPublicOffers.
 */
async function getPublicOffersByIds(offerIds) {
  if (!Array.isArray(offerIds) || offerIds.length === 0) return [];
  const validIds = offerIds.filter((id) => typeof id === "string" && id.length > 0);
  if (validIds.length === 0) return [];

  await ensureOfferPerkColumns();
  const poPerkCols = [
    offerPerkTypeColumnExists && "po.perk_type",
    offerPerkDescriptionColumnExists && "po.perk_description",
  ].filter(Boolean).join(", ");

  const query = `
    SELECT 
      po.id, po.partner_id, po.title, po.description, po.original_price, po.discounted_price,
      po.co_pay_percentage, po.discount_amount, po.start_date, po.end_date, po.status, po.is_active,
      po.is_trending, po.max_redemptions, po.current_redemptions, po.service_type, po.image_url,
      po.terms_conditions${poPerkCols ? ", " + poPerkCols : ""}, po.created_at,
      p.name AS partner_name, p.email AS partner_email, p.phone_number AS partner_phone,
      p.address AS partner_address, p.cuisine_types AS partner_cuisine_types, p.rating AS partner_rating,
      p.latitude AS partner_latitude, p.longitude AS partner_longitude, p.avg_cost_for_two AS partner_avg_cost_for_two,
      p.approved_for_featured AS partner_approved_for_featured
    FROM partner_offers po
    JOIN partners p ON po.partner_id = p.id
    WHERE po.id = ANY($1::uuid[])
      AND po.status = $2
      AND (p.status IS NULL OR p.status IN ('active', 'approved'))
      AND (po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)
      AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)
    ORDER BY po.created_at DESC
  `;
  const result = await pool.query(query, [validIds, STATUS.ACTIVE]);
  return result.rows.map((row) => ({
    id: row.id,
    partner_id: row.partner_id,
    partner_name: row.partner_name,
    title: row.title,
    description: row.description,
    original_price: row.original_price != null ? Number(row.original_price) : null,
    discounted_price: row.discounted_price != null ? Number(row.discounted_price) : null,
    co_pay_percentage: row.co_pay_percentage != null ? Number(row.co_pay_percentage) : null,
    discount_amount: row.discount_amount != null ? Number(row.discount_amount) : null,
    start_date: row.start_date,
    end_date: row.end_date,
    status: row.status,
    is_active: row.is_active,
    is_trending: row.is_trending,
    service_type: row.service_type,
    image_url: (row.image_url ? getS3FileUrl(row.image_url) : null) || getS3FileUrl(DEFAULT_OFFER_IMAGE_S3_KEY),
    terms_conditions: row.terms_conditions,
    perk_type: row.perk_type || "discount",
    perk_description: row.perk_description || null,
    min_tier_name: row.min_tier_name ?? null,
    created_at: row.created_at,
    partner_cuisine_types: row.partner_cuisine_types || [],
    partner_rating: row.partner_rating != null ? Number(row.partner_rating) : null,
    partner_latitude: row.partner_latitude != null ? Number(row.partner_latitude) : null,
    partner_longitude: row.partner_longitude != null ? Number(row.partner_longitude) : null,
    partner_avg_cost_for_two: row.partner_avg_cost_for_two != null ? Number(row.partner_avg_cost_for_two) : null,
    partner_approved_for_featured: Boolean(row.partner_approved_for_featured),
  }));
}

module.exports = {
  getOfferById,
  getOfferByIdRaw,
  getOfferByPartnerAndId,
  listOffersByPartner,
  createOffer,
  updateOffer,
  deleteOffer,
  getOfferForUpdate,
  incrementOfferRedemptions,
  incrementOfferRedemptionsAtomic,
  listPublicOffers,
  getPublicOffersByIds,
};
