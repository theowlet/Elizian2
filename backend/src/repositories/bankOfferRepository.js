const { getPool } = require('../config/db');
const { log, logError } = require('../../utils/logger');

const pool = getPool();

// Get all active bank offers
async function getAllActiveBankOffers() {
  try {
    const result = await pool.query(
      `SELECT 
         b.id,
         b.bank_name,
         b.bank_code,
         b.logo_url,
         b.priority,
         b.is_active,
         json_agg(
           json_build_object(
             'id', bor.id,
             'rule_name', bor.rule_name,
             'discount_type', bor.discount_type,
             'discount_value', bor.discount_value,
             'max_discount', bor.max_discount,
             'min_transaction_amount', bor.min_transaction_amount,
             'description', bor.description,
             'display_text', bor.display_text,
             'terms_conditions', bor.terms_conditions,
             'valid_from', bor.valid_from,
             'valid_until', bor.valid_until
           )
         ) FILTER (WHERE bor.is_active = true 
           AND (bor.valid_from IS NULL OR bor.valid_from <= CURRENT_TIMESTAMP)
           AND (bor.valid_until IS NULL OR bor.valid_until >= CURRENT_TIMESTAMP)
         ) as offers
       FROM banks b
       LEFT JOIN bank_offer_rules bor ON b.id = bor.bank_id
       WHERE b.is_active = true
       GROUP BY b.id
       ORDER BY b.priority DESC, b.bank_name ASC`
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
         b.id as bank_offer_id,
         b.bank_name,
         b.bank_code,
         b.logo_url,
         bor.id as rule_id,
         bor.discount_type as offer_type,
         bor.discount_value as offer_value,
         bor.max_discount,
         bor.min_transaction_amount as min_order_amount,
         bor.description,
         bor.display_text,
         bor.applicable_categories,
         bor.applicable_partners
       FROM banks b
       INNER JOIN bank_offer_rules bor ON b.id = bor.bank_id
       WHERE b.is_active = true
         AND bor.is_active = true
         AND bor.min_transaction_amount <= $1
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
       ORDER BY b.priority DESC, bor.max_discount DESC`,
      [orderAmount, categoryId, partnerId]
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
      `SELECT discount_type, discount_value, max_discount, min_transaction_amount
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

    if (orderAmount < parseFloat(rule.min_transaction_amount)) {
      return { 
        discount: 0, 
        error: `Minimum order amount ₹${rule.min_transaction_amount} required` 
      };
    }

    let discount = 0;

    switch (rule.discount_type) {
      case 'percentage':
        discount = (orderAmount * parseFloat(rule.discount_value)) / 100;
        if (rule.max_discount) {
          discount = Math.min(discount, parseFloat(rule.max_discount));
        }
        break;
      case 'cashback':
        discount = (orderAmount * parseFloat(rule.discount_value)) / 100;
        if (rule.max_discount) {
          discount = Math.min(discount, parseFloat(rule.max_discount));
        }
        // Cashback is credited later, not as instant discount
        break;
      case 'flat':
        discount = parseFloat(rule.discount_value);
        break;
      default:
        discount = 0;
    }

    return {
      discount: parseFloat(discount.toFixed(2)),
      offerType: rule.discount_type,
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
      `INSERT INTO user_bank_offer_usage 
       (user_id, bank_offer_rule_id, booking_id, discount_applied)
       VALUES ($1, $2, $3, $4)`,
      [userId, ruleId, bookingId, discountApplied]
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
    const { bank_code, bank_name, logo_url, is_active, priority } = bankData;
    
    const result = await pool.query(
      `INSERT INTO banks (bank_code, bank_name, logo_url, is_active, priority)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (bank_code) 
       DO UPDATE SET
         bank_name = EXCLUDED.bank_name,
         logo_url = EXCLUDED.logo_url,
         is_active = EXCLUDED.is_active,
         priority = EXCLUDED.priority,
         updated_at = CURRENT_TIMESTAMP
       RETURNING *`,
      [bank_code, bank_name, logo_url, is_active ?? true, priority ?? 0]
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
      bank_id,
      rule_name,
      discount_type,
      discount_value,
      max_discount,
      min_transaction_amount,
      applicable_categories,
      applicable_partners,
      valid_from,
      valid_until,
      is_active,
      description,
      display_text,
      terms_conditions
    } = ruleData;

    const result = await pool.query(
      `INSERT INTO bank_offer_rules 
       (bank_id, rule_name, discount_type, discount_value, max_discount, min_transaction_amount, 
        applicable_categories, applicable_partners,
        valid_from, valid_until, is_active, description, display_text, terms_conditions)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        bank_id,
        rule_name,
        discount_type,
        discount_value,
        max_discount,
        min_transaction_amount ?? 0,
        applicable_categories ? JSON.stringify(applicable_categories) : null,
        applicable_partners ? JSON.stringify(applicable_partners) : null,
        valid_from,
        valid_until,
        is_active ?? true,
        description,
        display_text,
        terms_conditions
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

