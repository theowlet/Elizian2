# Platform Fee Audit Report — Real-Time Calculation & Ledger Integrity

**Date:** 2026-02  
**Scope:** Platform fee source of truth, tier-based percentage, ledger integrity, Admin aggregation, deterministic financial math.

---

## 1. Where platform fee was calculated (before fix)

| Location | Behavior |
|----------|----------|
| **`backend/src/services/enhancedRedemptionService.js`** | Platform fee was computed **at redemption time** (real-time), inside the same transaction as the redemption. |
| **Formula used (incorrect):** `platform_fee_total = bill * (tier.platform_fee_percent / 100)` where `bill = total_bill_amount`. |
| **Issue:** Fee was applied to **total bill** (fiat + EZT value), not to **fiat received only**. Business rule requires: **Platform Fee = (Fiat received by partner) × (Tier %)** — NOT on EZT. |

---

## 2. Real-time vs batch

- **Calculation:** Real-time. Fee was computed during `redeemVoucherEnhanced()` and written to `platform_earnings_ledger` in the **same DB transaction** as the redemption.
- **No cron/batch:** No nightly or delayed job for platform fee.
- **Admin API:** Correctly reads from the ledger: `SUM(platform_fee_total)`, `SUM(fiat_component)`, `SUM(ezt_component)` — **no recalculation** in the reporting layer.

---

## 3. Incorrect logic found and fix

### 3.1 Fee base (fixed)

- **Before:** Fee was calculated on `total_bill_amount` (full bill including EZT co-pay value).
- **After:** Fee is calculated only on **fiat received by partner** = `net_amount_from_user` (cash/card). EZT component is excluded.
- **Formula:** `platform_fee_total = round2(fiatReceived * tier.platform_fee_percent / 100)` with `fiatReceived = net_amount_from_user`.

### 3.2 Fee components (fixed)

- **Before:** `fiat_component` and `ezt_component` were derived from the full bill × tier’s fiat_fee_percent / ezt_fee_percent.
- **After:** Fee is on fiat only: `fiat_component = platform_fee_total`, `ezt_component = 0`.

### 3.3 Tier snapshot (added)

- **Before:** Ledger stored only `tier_id`. If a tier’s name or `platform_fee_percent` changed later, historical rows would show current tier name/percentage when joined to `partner_tiers`.
- **After:** Ledger stores **tier snapshot** at transaction time: `tier_name`, `tier_percentage` (migration `2026-02-platform-earnings-ledger-tier-snapshot.sql`). Historical rows are immune to tier renames or fee changes.

### 3.4 Rounding

- All amounts use `round2(v) = Math.round(Number(v) * 100) / 100`. No `toFixed` → `parseFloat` chains.

---

## 4. Files modified

| File | Change |
|------|--------|
| `backend/src/services/enhancedRedemptionService.js` | Fee base changed from `total_bill_amount` to `net_amount_from_user`; added `round2`; set `fiat_component = platform_fee_total`, `ezt_component = 0`; pass `tier_name`, `tier_percentage` into ledger insert. |
| `backend/src/repositories/partnerTierRepository.js` | `insertLedgerEntry` accepts optional `tier_name`, `tier_percentage`; inserts into ledger when columns exist; fallback insert when migration not yet run. |
| `backend/db/migrations/2026-02-platform-earnings-ledger-tier-snapshot.sql` | New migration: add `tier_name`, `tier_percentage` to `platform_earnings_ledger`; backfill from `partner_tiers`. |
| `backend/test/platformFeeCalculation.test.js` | New: unit tests for fiat-only fee, rounding, and tier-snapshot semantics. |
| `docs/PLATFORM_FEE_AUDIT_REPORT.md` | This report. |

---

## 5. Confirmation: deterministic and real-time

- **When:** Platform fee is computed and written in the same transaction as the redemption (inside `redeemVoucherEnhanced`), immediately after the redemption row is inserted and before commit.
- **How:** `fiatReceived = net_amount_from_user`; `platform_fee_total = round2(fiatReceived * tier.platform_fee_percent / 100)`; one row inserted into `platform_earnings_ledger` with `tier_id`, `tier_name`, `tier_percentage`, `platform_fee_total`, `fiat_component`, `ezt_component`.
- **Visibility:** Admin → Platform Earnings reads from the ledger; after a redemption, a refresh or re-open of the section shows the new row (no cache of ledger data beyond normal HTTP).

---

## 6. SQL used for aggregation (Admin)

Admin endpoint: `GET /api/v1/admin/platform-earnings` (optional: `start_date`, `end_date`, `partner_id`, `tier_id`).

**Totals:**

```sql
SELECT
  COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
  COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
  COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
FROM platform_earnings_ledger pel
WHERE [start_date / end_date / partner_id / tier_id filters]
```

**By tier:**

```sql
SELECT pt.id AS tier_id, pt.name AS tier_name,
  COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
  COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
  COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
FROM platform_earnings_ledger pel
JOIN partner_tiers pt ON pt.id = pel.tier_id
WHERE [filters]
GROUP BY pt.id, pt.name
ORDER BY total_earnings DESC
```

**By partner:**

```sql
SELECT pel.partner_id, p.name AS partner_name,
  COALESCE(SUM(pel.platform_fee_total), 0)::DECIMAL(12,2) AS total_earnings,
  COALESCE(SUM(pel.fiat_component), 0)::DECIMAL(12,2) AS total_fiat,
  COALESCE(SUM(pel.ezt_component), 0)::DECIMAL(12,2) AS total_ezt
FROM platform_earnings_ledger pel
JOIN partners p ON p.id = pel.partner_id
WHERE [filters]
GROUP BY pel.partner_id, p.name
ORDER BY total_earnings DESC
```

All aggregations **sum stored `platform_fee_total`** (and components). No `SUM(fiat) * tier_percentage` or other recalculation.

---

## 7. Proof that tier change does not affect historical earnings

- Each ledger row stores **at insert time:** `platform_fee_total`, `tier_id`, and (after migration) `tier_name`, `tier_percentage`.
- Admin totals and breakdowns use **only** `SUM(pel.platform_fee_total)` (and sums of `fiat_component`, `ezt_component`). They do **not** multiply any amount by current tier percentage.
- If a tier’s `platform_fee_percent` or name is changed in `partner_tiers`, existing ledger rows keep their stored `platform_fee_total` and optional `tier_name`/`tier_percentage`. Historical earnings remain correct.

---

## 8. Final validation checklist

| Check | Status |
|-------|--------|
| Platform fee recorded at transaction time | Yes |
| Tier % (and name) snapshot stored in ledger | Yes (after migration) |
| Admin sums ledger, does not recalculate | Yes |
| No float drift (round2 used) | Yes |
| No tier-change corruption of history | Yes |
| Real-time visibility in Admin | Yes |
| Correct by-tier and by-partner grouping | Yes |
| Fee on fiat only, not on EZT | Yes (fixed) |

---

## 9. How to run migration and tests

**Migration (add tier snapshot columns):**

```bash
cd backend
node run-platform-earnings-ledger-tier-snapshot.js
```

Or with psql:

```bash
psql $DATABASE_URL -f backend/db/migrations/2026-02-platform-earnings-ledger-tier-snapshot.sql
```

**Unit tests:**

```bash
cd backend
node --test test/platformFeeCalculation.test.js
```

---

## 10. Optional next steps (enterprise hardening)

- ~~Add a **Refresh** button on Admin → Platform Earnings~~ — **Done:** Refresh button and refetch when date range (start/end) or section changes.
- Consider making the ledger insert **fatal** (rollback redemption if ledger insert fails) for stricter financial consistency; current design keeps redemption successful and logs ledger errors so redemption is not blocked by reporting.
