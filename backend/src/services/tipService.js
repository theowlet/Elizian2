const tipRepository = require('../repositories/tipRepository');
const partnerRepository = require('../repositories/partnerRepository');
const tokenService = require('./tokenService');
const { getPool } = require('../config/db');
const { AppError } = require('../../utils/response');
const { log } = require('../../utils/logger');

async function createTip(userId, partnerId, { amount_decimal, currency, payment_method, notes, booking_id }) {
  const amount = parseFloat(amount_decimal);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new AppError(400, 'Tip amount must be a positive number');
  }

  const partner = await partnerRepository.getPartnerById(partnerId);
  if (!partner) {
    throw new AppError(404, 'Venue not found');
  }

  const method = payment_method || 'fiat';

  if (method === 'ezt') {
    // 1 EZT = ₹100 → convert INR tip to EZT
    const eztAmount = amount / 100;

    // Fast-fail balance check (authoritative check is inside redeemTokens with FOR UPDATE). Allow overdraft up to -10 EZT.
    const balance = await tokenService.getBalance(userId);
    const overdraftLimit = tokenService.getOverdraftLimit();
    if (balance - eztAmount < -overdraftLimit) {
      throw new AppError(400, `Insufficient EZT balance. Available: ${balance.toFixed(5)} EZT (balance can go down to -${overdraftLimit} EZT), Required: ${eztAmount.toFixed(5)} EZT (₹${amount.toFixed(0)})`);
    }

    // Atomic transaction: deduct EZT + record tip
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      await tokenService.redeemTokens(
        userId,
        eztAmount,
        null,
        `Tip to ${partner.name} (₹${amount})`,
        client
      );

      const tip = await tipRepository.createWithClient(client, {
        from_user_id: userId,
        partner_id: partnerId,
        booking_id: booking_id || null,
        amount_decimal: amount,
        currency: currency || 'INR',
        payment_method: 'ezt',
        notes: notes || null,
      });

      await client.query('COMMIT');
      log(`✅ EZT tip: user ${userId} tipped ₹${amount} (${eztAmount} EZT) to ${partner.name}`);
      return tip;
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }

  // Fiat: record only (offline/UPI payment tracked)
  const tip = await tipRepository.create({
    from_user_id: userId,
    partner_id: partnerId,
    booking_id: booking_id || null,
    amount_decimal: amount,
    currency: currency || 'INR',
    payment_method: 'fiat',
    notes: notes || null,
  });
  log(`✅ Fiat tip: user ${userId} tipped ₹${amount} to ${partner.name}`);
  return tip;
}

async function listByPartner(partnerId, limit, offset) {
  return await tipRepository.listByPartner(partnerId, limit, offset);
}

async function listByUser(userId, limit) {
  return await tipRepository.listByUser(userId, limit);
}

module.exports = {
  createTip,
  listByPartner,
  listByUser,
};
