-- ============================================
-- FIELD CONSISTENCY FIXES MIGRATION
-- Date: 2025-01-21
-- Purpose: Fix field naming inconsistencies and redundant fields
-- ============================================

BEGIN;

-- ============================================
-- 1. BACKFILL is_active FROM status (Partners)
-- ============================================
-- Ensure is_active matches status for partners
UPDATE partners 
SET is_active = (status IN ('active', 'approved'))
WHERE status IS NOT NULL 
  AND (is_active IS NULL OR is_active != (status IN ('active', 'approved')));

-- ============================================
-- 2. BACKFILL is_active FROM status (Offers)
-- ============================================
-- Ensure is_active matches status for offers
UPDATE partner_offers 
SET is_active = (status = 'active')
WHERE status IS NOT NULL 
  AND (is_active IS NULL OR is_active != (status = 'active'));

-- ============================================
-- 3. COPY offer_id TO deal_id (Bookings)
-- ============================================
-- Ensure deal_id is populated from offer_id where missing
UPDATE bookings 
SET deal_id = offer_id 
WHERE deal_id IS NULL AND offer_id IS NOT NULL;

-- ============================================
-- 4. ENSURE total_price IS POPULATED (Bookings)
-- ============================================
-- Ensure total_price is always set (use fiat_amount as fallback)
UPDATE bookings 
SET total_price = COALESCE(total_price, fiat_amount, amount, 0)
WHERE total_price IS NULL OR total_price = 0;

-- ============================================
-- 5. ENSURE fiat_amount IS POPULATED (Bookings)
-- ============================================
-- Ensure fiat_amount is set (use total_price as fallback if no EZT discount)
UPDATE bookings 
SET fiat_amount = COALESCE(fiat_amount, total_price, amount, 0)
WHERE fiat_amount IS NULL OR fiat_amount = 0;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the migration:

-- Check partner is_active consistency
SELECT 
  COUNT(*) as total_partners,
  COUNT(*) FILTER (WHERE is_active = (status IN ('active', 'approved'))) as consistent_partners,
  COUNT(*) FILTER (WHERE is_active != (status IN ('active', 'approved'))) as inconsistent_partners
FROM partners
WHERE status IS NOT NULL;

-- Check offer is_active consistency
SELECT 
  COUNT(*) as total_offers,
  COUNT(*) FILTER (WHERE is_active = (status = 'active')) as consistent_offers,
  COUNT(*) FILTER (WHERE is_active != (status = 'active')) as inconsistent_offers
FROM partner_offers
WHERE status IS NOT NULL;

-- Check booking deal_id population
SELECT 
  COUNT(*) as total_bookings,
  COUNT(*) FILTER (WHERE deal_id IS NOT NULL) as has_deal_id,
  COUNT(*) FILTER (WHERE offer_id IS NOT NULL AND deal_id IS NULL) as missing_deal_id
FROM bookings;

-- Check booking amount fields
SELECT 
  COUNT(*) as total_bookings,
  COUNT(*) FILTER (WHERE total_price IS NOT NULL AND total_price > 0) as has_total_price,
  COUNT(*) FILTER (WHERE fiat_amount IS NOT NULL AND fiat_amount > 0) as has_fiat_amount,
  COUNT(*) FILTER (WHERE total_price IS NULL OR total_price = 0) as missing_total_price
FROM bookings;

