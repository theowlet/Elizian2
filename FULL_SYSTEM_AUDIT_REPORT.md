# Elizian Full-System Logical Audit Report

**Date:** 2026-02-15  
**Scope:** Multi-vertical, 5-tier, no token sale, QR check-in, co-pay, booking engine, waitlist, blockchain fallback, partner console, mobile-first.

---

## 1. Logical Errors Found & Fixed

### Tier compliance (Phase 1)
| Issue | Location | Fix |
|-------|----------|-----|
| Echelon check case-sensitive | `bookingValidation.js` | Normalized: `String(user_tier).trim().toLowerCase() === 'echelon'` so DB value `echelon`/`Echelon` both work. |
| reserveSlot Echelon flag case-sensitive | `bookingService.js` | Same normalization when calling `reserveSlot(..., isEchelon, ...)`. |
| Tier gate used only legacy `tiers` table | `tierGate.js` | Prefer `users.current_tier_name`; fallback to `tiers.name` for enterprise + legacy. |
| getTierLevel case-sensitive | `tierGate.js` | `getTierLevel()` now uses case-insensitive match against `TIER_ORDER`. |
| Aether vs Ather typo | `achievementService.js` | `tierOrder` key set to `Ather` (was `Aether`). |
| Comment "default Aether" | `tokenService.js` | Comment updated to "default Ather"; code already used `Ather`. |
| Migration renames to Beacon/Crest/Ascend | `2026-02-tier-names-consistency.sql` | **Do not run as-is.** Added `TIER_SYSTEM_TRUTH.md` stating canonical tiers are Ather, Nova, Luminar, Valiant, Echelon only. |

### Booking engine (Phase 2)
| Item | Status |
|------|--------|
| Operating hours | Validated first; Echelon cannot override. |
| Slot capacity FOR UPDATE | `slotCapacityService.reserveSlot` uses `FOR UPDATE` then increment; race-safe. |
| Echelon override | Only when tier is Echelon (now case-insensitive); within `echelon_buffer` or partner `echelon_capacity_buffer_percent`. |
| releaseSlot on rollback | `releaseSlotStandalone` used in catch before ROLLBACK when slot was reserved. |
| Waitlist notifyNextInWaitlist | Uses `FOR UPDATE`; status set to `notified` with `expires_at`; one row per call. |
| runPromotionCycle | Selects slots with `booked_count < capacity`; calls `notifyNextInWaitlist` per slot; no double-promotion (notified row no longer `waiting`). |

### Reward & co-pay (Phase 3)
| Item | Status |
|------|--------|
| No token sale logic | Confirmed: no purchase/sale flows; docs and code align. |
| Co-pay validation | `enhancedRedemptionService` / `redemptionService`: net_amount_from_user = total_bill - ezt_co_pay_amount; EZT co-pay >= 0. |
| Blockchain | References are placeholder/optional; reward issuance does not depend on chain. |

### Multi-vertical (Phase 4)
| Item | Status |
|------|--------|
| Filter builder | `filterBuilder.js` uses parameterized queries; `service_type`, `cuisine_types`, `premium_only`, geo, price, rating. |
| avg_cost_for_two | Exposed as `partner_avg_cost_for_two` on partner; not forced on spa/events (metadata only). |

### Security (Phase 8)
| Item | Status |
|------|--------|
| SQL injection | List/booking/repo paths use parameterized queries (`$1`, `$2`, params array). |
| Tier spoofing | Tier read from DB (`users.current_tier_name` or `tiers` join); not from client. |
| Booking race | Slot path uses `FOR UPDATE` + increment in same transaction. |

---

## 2. Files Modified

| File | Change |
|------|--------|
| `backend/src/services/bookingValidation.js` | Echelon check case-insensitive; `isEchelon` at top of validator. |
| `backend/src/services/bookingService.js` | reserveSlot Echelon argument normalized (case-insensitive). |
| `backend/src/middleware/tierGate.js` | Prefer `current_tier_name`; fallback legacy; `getTierLevel` case-insensitive. |
| `backend/src/services/achievementService.js` | tierOrder key `Aether` → `Ather`. |
| `backend/src/services/tokenService.js` | Comment "Aether" → "Ather". |
| `backend/db/TIER_SYSTEM_TRUTH.md` | **New.** Canonical 5 tiers; do not run Beacon/Crest/Ascend migration. |
| `backend/db/scripts/data-consistency-repair.sql` | **New.** Tier normalization, negative booked_count clamp, capacity clamp. |

---

## 3. DB Fixes Applied

- **Repair script added:** `backend/db/scripts/data-consistency-repair.sql`
  - Normalize `Aether` → `Ather` in `loyalty_tiers`, `users`, `bookings`.
  - Clamp `venue_time_slots.booked_count` to `>= 0` and `<= capacity + echelon_buffer`.
- **No schema changes** in this audit (additive/compliance only).

---

## 4. Security Issues Resolved

- Tier comparison normalized so tier from DB (any casing) is compared safely; no client-supplied tier used for override.
- Tier gate and offer tier access use DB-backed tier only; `getTierLevel` is case-insensitive.

---

## 5. Performance Notes

- Slot reserve uses `FOR UPDATE` (row lock) and single UPDATE; no N+1 in critical path.
- Filter builder uses parameterized conditions and existing indexes (e.g. `partner_offers.service_type`, `partners.approved_for_featured`).
- No changes to indexes in this audit.

---

## 6. Tier Compliance Confirmation

- **Canonical tiers:** Ather, Nova, Luminar, Valiant, Echelon.
- **Echelon:** Only tier that can override slot capacity (within buffer); operating hours cannot be overridden.
- **Spelling:** Ather (not Aether); Echelon (capital E).
- **Migration warning:** `2026-02-tier-names-consistency.sql` renames to Beacon/Crest/Ascend — **do not run**; see `TIER_SYSTEM_TRUTH.md`.

---

## 7. Booking Engine Validation Confirmation

- Operating hours validated first; Echelon cannot bypass.
- Slot path: `reserveSlot` with `FOR UPDATE`; `releaseSlot` / `releaseSlotStandalone` on cancel/rollback; `booked_count` guarded by `GREATEST(0, ...)`.
- Echelon override: case-insensitive tier check; buffer from slot or partner config.
- Waitlist: `notifyNextInWaitlist` locks one row, sets `notified` + `expires_at`; promotion cycle uses slots with capacity.

---

## 8. Multi-Vertical Integrity Confirmation

- Filters and list APIs are service_type-aware; no restaurant-only assumption in core booking/reward logic.
- `partner_avg_cost_for_two` is optional metadata; not used to block non-dining verticals.

---

## 9. Rollback / Risk

- **Rollback:** Revert listed file changes via git; do not re-run any migration that renames tiers to Beacon/Crest/Ascend.
- **Risk:** Low; changes are backward-compatible (case-insensitivity and tier source preference).
- **Data repair script:** Run only after backup; idempotent for tier normalization and booked_count clamps.

---

## 10. Manual Test Checklist

- [ ] Book as Echelon user when slot at capacity but within buffer → allowed, `is_priority_override` true.
- [ ] Book as non-Echelon when slot full → rejected, waitlist offered.
- [ ] Book outside operating hours (any tier) → rejected.
- [ ] Cancel booking → slot `booked_count` decremented; waitlist promotion can run.
- [ ] Tier-gated offer: user with tier below min → 403; at or above → allowed.
- [ ] Redemption with EZT co-pay: net amount = bill - ezt_co_pay; no negative reward.
- [ ] Partner console: tier badges (Echelon, Valiant, etc.) and guest tier display correct.

---

## 11. Migration SQL / Rollback

- **No new schema migrations** were added. Only a **data repair script** was added: `backend/db/scripts/data-consistency-repair.sql`.
- **Rollback:** Revert the 6 modified code files via git. Do not run `2026-02-tier-names-consistency.sql` (Beacon/Crest/Ascend). Data repair script is idempotent; re-running it after reverting code does not revert tier names—only ensures Aether→Ather and booked_count clamps.

---

## 12. Risk Matrix

| Change | Risk | Mitigation |
|--------|------|------------|
| Echelon case-insensitive | Low | More permissive; no stricter rejection. |
| Tier gate prefers current_tier_name | Low | Fallback to legacy tier; same behavior if DB aligned. |
| getTierLevel case-insensitive | Low | Correct tier order preserved. |
| achievementService Ather key | Low | Only affects tier ordering if Aether was used. |
| Data repair script | Low | Run after backup; idempotent; table existence checks. |

---

## 13. Performance Delta

- No new indexes or query changes that would regress performance.
- Tier gate runs one extra column in SELECT (`current_tier_name`); negligible.

---

## 14. Mobile-First (Phase 10)

- Not changed in this audit. Responsive breakpoints and card layout remain as-is; recommend separate UI/UX pass for overflow and filter drawer on small screens.

---

**Success criteria (from audit):**

- Tier system strictly compliant (Ather, Nova, Luminar, Valiant, Echelon; Echelon override only).
- Booking engine race-safe (FOR UPDATE + release on rollback).
- Waitlist: single notify per slot per run; FOR UPDATE.
- Co-pay math and validation in place; no token sale logic.
- Filters parameterized; multi-vertical neutral.
- No rogue tier renames applied; repair script and TIER_SYSTEM_TRUTH.md in place.
