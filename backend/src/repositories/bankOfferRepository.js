const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Get all active bank offers
async function getAllActiveBankOffers() {
  try {
    const result = await pool.query(
      `SELECT 
         bo.*,
         json_agg(
           json_build_object(
             'id', bor.id,
             'offer_type', bor.offer_type,
             'offer_value', bor.offer_value,
             'max_discount', bor.max_discount,
             'min_order_amount', bor.min_order_amount,
             'description', bor.description,
             'valid_from', bor.valid_from,
             'valid_until', bor.valid_until
           )
         ) FILTER (WHERE bor.is_active = true 
           AND (bor.valid_from IS NULL OR bor.valid_from <= CURRENT_TIMESTAMP)
           AND (bor.valid_until IS NULL OR bor.valid_until >= CURRENT_TIMESTAMP)
         ) as offers
       FROM bank_offers bo
       LEFT JOIN bank_offer_rules bor ON bo.id = bor.bank_offer_id
       WHERE bo.is_active = true
       GROUP BY bo.id
       ORDER BY bo.priority DESC, bo.bank_name ASC`
    );
    return result.rows;
  } catch (error) {
    logError('Error getting bank offers:', error);
    throw error;
  }
}

// Get applicable bank offers for a booking
async function getApplicableBankOffers(orderAmount, userId = null, partnerId = null, categoryId = null) {
  try {
    // Get user tier if userId provided
    let userTier = null;
    if (userId) {
      const userResult = await pool.query(
        `SELECT current_tier_name FROM users WHERE id = $1`,
        [userId]
      );
      userTier = userResult.rows[0]?.current_tier_name;
    }

    const result = await pool.query(
      `SELECT 
         bo.id as bank_offer_id,
         bo.bank_name,
         bo.bank_code,
         bo.logo_url,
         bor.id as rule_id,
         bor.offer_type,
         bor.offer_value,
         bor.max_discount,
         bor.min_order_amount,
         bor.description,
         bor.applicable_categories,
         bor.applicable_partners,
         bor.applicable_tiers
       FROM bank_offers bo
       INNER JOIN bank_offer_rules bor ON bo.id = bor.bank_offer_id
       WHERE bo.is_active = true
         AND bor.is_active = true
         AND bor.min_order_amount <= $1
         AND (bor.valid_from IS NULL OR bor.valid_from <= CURRENT_TIMESTAMP)
         AND (bor.valid_until IS NULL OR bor.valid_until >= CURRENT_TIMESTAMP)
         AND (
           bor.applicable_categories IS NULL 
           OR $2::text = ANY(SELECT jsonb_array_elements_text(bor.applicable_categories))
         )
         AND (
           bor.applicable_partners IS NULL 
           OR $3::text = ANY(SELECT jsonb_array_elements_text(bor.applicable_partners))
         )
         AND (
           bor.applicable_tiers IS NULL 
           OR $4::text = ANY(SELECT jsonb_array_elements_text(bor.applicable_tiers))
         )
       ORDER BY bo.priority DESC, bor.max_discount DESC`,
      [orderAmount, categoryId, partnerId, userTier]
    );
    return result.rows;
  } catch (error) {
    logError('Error getting applicable bank offers:', error);
    throw error;
  }
}

// Calculate bank offer discount
async function calculateBankOfferDiscount(ruleId, orderAmount) {
  try {
    const result = await pool.query(
      `SELECT offer_type, offer_value, max_discount, min_order_amount
       FROM bank_offer_rules
       WHERE id = $1 AND is_active = true
         AND (valid_from IS NULL OR valid_from <= CURRENT_TIMESTAMP)
         AND (valid_until IS NULL OR valid_until >= CURRENT_TIMESTAMP)`,
      [ruleId]
    );

    if (result.rows.length === 0) {
      return { discount: 0, error: 'Offer rule not found or expired' };
    }

    const rule = result.rows[0];

    if (orderAmount < parseFloat(rule.min_order_amount)) {
      return { 
        discount: 0, 
        error: `Minimum order amount ₹${rule.min_order_amount} required` 
      };
    }

    let discount = 0;

    switch (rule.offer_type) {
      case 'discount':
        discount = (orderAmount * parseFloat(rule.offer_value)) / 100;
        if (rule.max_discount) {
          discount = Math.min(discount, parseFloat(rule.max_discount));
        }
        break;
      case 'cashback':
        discount = (orderAmount * parseFloat(rule.offer_value)) / 100;
        if (rule.max_discount) {
          discount = Math.min(discount, parseFloat(rule.max_discount));
        }
        // Cashback is credited later, not as instant discount
        break;
      case 'flat_off':
        discount = parseFloat(rule.offer_value);
        break;
      case 'bogo':
        // BOGO logic handled separately
        discount = 0;
        break;
      default:
        discount = 0;
    }

    return {
      discount: parseFloat(discount.toFixed(2)),
      offerType: rule.offer_type,
      maxDiscount: rule.max_discount ? parseFloat(rule.max_discount) : null
    };
  } catch (error) {
    logError('Error calculating bank offer discount:', error);
    throw error;
  }
}

// Record bank offer usage
async function recordBankOfferUsage(bookingId, bankOfferId, ruleId, userId, orderAmount, discountApplied, client = pool) {
  try {
    await client.query(
      `INSERT INTO bank_offer_usage 
       (booking_id, bank_offer_id, bank_offer_rule_id, user_id, order_amount, discount_applied)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [bookingId, bankOfferId, ruleId, userId, orderAmount, discountApplied]
    );
    log(`Bank offer ${bankOfferId} (rule ${ruleId}) used for booking ${bookingId}: ₹${discountApplied} discount`);
  } catch (error) {
    logError('Error recording bank offer usage:', error);
    throw error;
  }
}

// Admin: Create/Update bank offer
async function upsertBankOffer(bankData) {
  try {
    const { bank_code, bank_name, logo_url, is_active, priority, description, terms_and_conditions } = bankData;
    
    const result = await pool.query(
      `INSERT INTO bank_offers (bank_code, bank_name, logo_url, is_active, priority, description, terms_and_conditions)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (bank_code) 
       DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         logo_url = EXCLUDED.logo_url,
         is_active = EXCLUDED.is_active,
         priority = EXCLUDED.priority,
         description = EXCLUDED.description,
         terms_and_conditions = EXCLUDED.terms_and_conditions,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [bank_code, bank_name, logo_url, is_active ?? true, priority ?? 0, description, terms_and_conditions]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error upserting bank offer:', error);
    throw error;
  }
}

// Admin: Create/Update bank offer rule
async function upsertBankOfferRule(ruleData) {
  try {
    const {
      bank_offer_id,
      offer_type,
      offer_value,
      max_discount,
      min_order_amount,
      applicable_categories,
      applicable_partners,
      applicable_tiers,
      valid_from,
      valid_until,
      is_active,
      description
    } = ruleData;

    const result = await pool.query(
      `INSERT INTO bank_offer_rules 
       (bank_offer_id, offer_type, offer_value, max_discount, min_order_amount, 
        applicable_categories, applicable_partners, applicable_tiers,
        valid_from, valid_until, is_active, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        bank_offer_id,
        offer_type,
        offer_value,
        max_discount,
        min_order_amount ?? 0,
        applicable_categories ? JSON.stringify(applicable_categories) : null,
        applicable_partners ? JSON.stringify(applicable_partners) : null,
        applicable_tiers ? JSON.stringify(applicable_tiers) : null,
        valid_from,
        valid_until,
        is_active ?? true,
        description
      ]
    );
    return result.rows[0];
  } catch (error) {
    logError('Error upserting bank offer rule:', error);
    throw error;
  }
}

module.exports = {
  getAllActiveBankOffers,
  getApplicableBankOffers,
  calculateBankOfferDiscount,
  recordBankOfferUsage,
  upsertBankOffer,
  upsertBankOfferRule
};

