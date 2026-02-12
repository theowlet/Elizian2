const { getPool } = require("../config/db");
const { normalizeApplicableDays } = require("../utils/dealRules");
const { log, logError } = require("../../utils/logger");
const {getS3FileUrl} = require("../../utils/s3Bucket")

const pool = getPool();

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
// CRITICAL: For public access, only return offers from approved partners
// Set requireApproval=false for admin/internal use
async function getOfferById(offerId, requireApproval = true) {
  let query = `
    SELECT po.*, p.id as partner_id, p.name AS partner_name, p.is_active as partner_is_active, 
           p.status as partner_status, p.latitude AS partner_latitude, p.longitude AS partner_longitude
    FROM partner_offers po 
    JOIN partners p ON po.partner_id = p.id 
    WHERE po.id = $1 
      AND po.status = $2
      AND (po.start_date IS NULL OR po.start_date <= CURRENT_TIMESTAMP)
      AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP)
  `;

  const params = [offerId, STATUS.ACTIVE];

  // CRITICAL: Only show deals from approved partners to public users
  if (requireApproval) {
    query += ` AND p.is_active = true 
               AND (p.status IS NULL OR p.status IN ('active', 'approved'))`;
  }

  const result = await pool.query(query, params);
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
    discount_percentage,
    discount_amount,
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

  const result = await pool.query(
    `
    INSERT INTO partner_offers (
      partner_id, title, description, service_type, discount_percentage, discount_amount,
      original_price, discounted_price, offer_type, terms_conditions,
      image_url, start_date, end_date, is_trending, max_redemptions,
      applicable_days, applicable_categories, min_purchase_amount, promo_code,
      menu_item_id, applicable_menu_items, discount_applies_to,
      savings, ezt_equivalent, is_active, featured_request_pending,
      forced_by_admin, status, perk_type, perk_description
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30)
    RETURNING *
  `,
    [
      partnerId,
      title,
      description,
      service_type,
      discount_percentage,
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
      savings,
      ezt_equivalent,
      finalIsActive,
      featured_request_pending,
      forced_by_admin,
      finalStatus,
      perk_type || "discount",
      perk_description || null,
    ]
  );

  return result.rows[0];
}

// Update offer
async function updateOffer(partnerId, offerId, updates) {
  const allowedFields = [
    "title",
    "description",
    "service_type",
    "discount_percentage",
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
    "savings",
    "ezt_equivalent",
    "featured_request_pending",
    "forced_by_admin",
    "status",
    "perk_type",
    "perk_description",
  ];

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

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 1000;

let offerStatusColumnExists = null;
let partnerStatusColumnExists = null;

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

// List public offers with filters
async function listPublicOffers(filters = {}) {
  await ensureStatusMetadata();

  const {
    status = null,
    not_expired = false,
    has_started = false,
    service_type = null,
    trending = null,
    limit = DEFAULT_LIMIT,
    admin = false,
    cuisine_types = null, // Array of cuisine types
    price_min = null,
    price_max = null,
    min_rating = null,
    user_latitude = null, // For distance filtering
    user_longitude = null,
    max_distance_km = null,
    partner_ids = null, // For recommendations: restrict to these partners
  } = filters;

  const sanitizedLimit = Math.min(
    Math.max(parseInt(limit, 10) || DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const params = [];
  const conditions = [];
  let paramIndex = 1;

  // Partner must be active
  conditions.push("p.is_active = true");
  if (partnerStatusColumnExists) {
    // Use ::text and LOWER so it works for enum/varchar and any casing
    conditions.push(
      "(p.status IS NULL OR LOWER(TRIM(p.status::text)) IN ('active', 'approved'))"
    );
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

  // Filter by cuisine types (if partner has matching cuisines)
  if (
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

  // Filter by minimum rating
  if (min_rating !== null && min_rating !== undefined) {
    conditions.push(`p.rating >= $${paramIndex}`);
    params.push(min_rating);
    paramIndex += 1;
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

  const query = `
    SELECT 
      po.id,
      po.partner_id,
      po.title,
      po.description,
      po.original_price,
      po.discounted_price,
      po.discount_percentage,
      po.discount_amount,
      po.start_date,
      po.end_date,
      po.status,
      po.is_active,
      po.is_trending,
      po.max_redemptions,
      po.current_redemptions,
      po.service_type,
      po.image_url,
      po.terms_conditions,
      po.perk_type,
      po.perk_description,
      po.created_at,
      p.name AS partner_name,
      p.email AS partner_email,
      p.phone_number AS partner_phone,
      p.address AS partner_address,
      p.cuisine_types AS partner_cuisine_types,
      p.rating AS partner_rating,
      p.latitude AS partner_latitude,
      p.longitude AS partner_longitude,
      p.avg_cost_for_two AS partner_avg_cost_for_two,
      p.approved_for_featured AS partner_approved_for_featured
      ${distanceSelect}
    FROM partner_offers po
    JOIN partners p ON po.partner_id = p.id
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
      discount_percentage:
        row.discount_percentage !== null
          ? Number(row.discount_percentage)
          : null,
      discount_amount:
        row.discount_amount !== null ? Number(row.discount_amount) : null,
      start_date: row.start_date,
      end_date: row.end_date,
      status: row.status,
      is_active: row.is_active,
      is_trending: row.is_trending,
      max_redemptions: row.max_redemptions,
      current_redemptions: row.current_redemptions,
      service_type: row.service_type,
      image_url: getS3FileUrl(row.image_url),
      terms_conditions: row.terms_conditions,
      perk_type: row.perk_type || 'discount',
      perk_description: row.perk_description || null,
      created_at: row.created_at,
      partner_cuisine_types: row.partner_cuisine_types || [],
      partner_rating:
        row.partner_rating !== null ? Number(row.partner_rating) : null,
      partner_latitude:
        row.partner_latitude !== null ? Number(row.partner_latitude) : null,
      partner_longitude:
        row.partner_longitude !== null ? Number(row.partner_longitude) : null,
      partner_avg_cost_for_two:
        row.partner_avg_cost_for_two !== null
          ? Number(row.partner_avg_cost_for_two)
          : null,
      distance_km:
        row.distance_km != null && !Number.isNaN(Number(row.distance_km))
          ? Math.round(Number(row.distance_km) * 10) / 10
          : null,
      partner_approved_for_featured: Boolean(row.partner_approved_for_featured),
    }));
  } catch (error) {
    logError("[offerRepository] listPublicOffers query failed", {
      error: error.message,
    });
    throw error;
  }
}

module.exports = {
  getOfferById,
  listOffersByPartner,
  createOffer,
  updateOffer,
  deleteOffer,
  getOfferForUpdate,
  incrementOfferRedemptions,
  listPublicOffers,
};
