# Go-Live Hardening Report (Non-Breaking, DB-Safe)

This document reports status, fixes, and backward compatibility for each of the five hardening areas.

---

## SECTION 1 – REDEMPTION IDEMPOTENCY

- **Current status:** Safe (hardened)
- **Exact issue found:** Optional idempotency key support was missing; double-click or retry could be handled by existing UNIQUE constraint but clients had no way to safely retry with a key.
- **Schema change required:** Yes (additive only).
- **Migration plan:** Add table `redemption_idempotency_keys` (idempotency_key UNIQUE, redemption_id FK to redemption_audit). Created only if `redemption_audit` exists. No changes to `redemption_audit` or existing unique index `idx_redemption_audit_unique_booking`.
- **Code-level fix:**
  - Controller: Read `X-Idempotency-Key` or `Idempotency-Key` header; if present, look up in `redemption_idempotency_keys`; if found, return 200 with existing redemption via `getRedemptionResponseById(redemption_id)`; else proceed. After successful redemption, insert (idempotency_key, redemption_id) with ON CONFLICT DO NOTHING. Lookup/insert wrapped in try/catch so missing table (42P01) does not break the API.
  - Service: Added `getRedemptionResponseById(redemptionId)` to return the same response shape as `redeemVoucherEnhanced` for idempotency replay.
- **Backward compatibility:** Preserved. No header required. Existing clients unchanged. Table is optional; if migration not run, idempotency is simply not used.

---

## SECTION 2 – ATOMIC FINANCIAL WRITES

- **Current status:** Safe (hardened)
- **Exact issue found:** Platform earnings ledger insert was inside a try/catch that did not rethrow; on failure the transaction still committed, so ledger could be missing while redemption and wallet updates were committed.
- **Schema change required:** Yes (additive only).
- **Migration plan:** Add UNIQUE partial index on `platform_earnings_ledger(redemption_id) WHERE redemption_id IS NOT NULL` so each redemption can have at most one ledger row. Created only if table `platform_earnings_ledger` exists.
- **Code-level fix:** In `enhancedRedemptionService.js`, on platform ledger insert failure, rethrow the error after logging so the outer transaction rolls back. Redemption insert, token redeem (wallet + ledger), tier processing, and platform ledger are already in the same transaction; making ledger failure fatal restores atomicity.
- **Backward compatibility:** Preserved. Method signatures and return payloads unchanged. Existing queries unaffected.

---

## SECTION 3 – CLAIM REPLAY PROTECTION

- **Current status:** Safe (hardened)
- **Exact issue found:** Subscription pass claim (`user_subscription_passes`) had no UNIQUE on `code`; same code could be claimed twice. No idempotent behaviour on duplicate claim.
- **Schema change required:** Yes (additive only).
- **Migration plan:** Add UNIQUE index `idx_user_subscription_passes_code_unique` on `user_subscription_passes(code)`. Created only if table `user_subscription_passes` exists.
- **Code-level fix:** In `subscriptionPassRepository.claimPass`: INSERT with `ON CONFLICT (code) DO NOTHING RETURNING *`; if no row returned, SELECT by code and return existing row. Same code claimed again returns the existing row (idempotent). No change to contract or other modules.
- **Backward compatibility:** Preserved. API response shape unchanged. Existing callers get same return; duplicate claims now return existing row instead of throwing.

---

## SECTION 4 – LEDGER ↔ WALLET DETERMINISM

- **Current status:** Safe (hardened)
- **Exact issue found:** Wallet balance (`users.available_tokens`) is a cached column; it is not derived from SUM(ledger). No reconciliation check existed.
- **Schema change required:** No change to existing tables or columns. Additive only.
- **Migration plan:** Add DB function `verify_token_ledger_integrity(p_user_id UUID DEFAULT NULL)` returning (user_id, stored_balance, ledger_balance_after, discrepancy, ok). Function created only when both `users` and `token_ledger` exist. No removal of balance column; no change to balance reads.
- **Code-level fix:** No application code change required for consistency; balance and ledger continue to be updated together in existing tokenService flows. Optional: admin or job can call `SELECT * FROM verify_token_ledger_integrity(NULL)` to list all users with discrepancies, or pass a user_id to check one user.
- **Backward compatibility:** Preserved. Balance column and all existing reads unchanged. New function is read-only and optional.

---

## SECTION 5 – IMMUTABLE OVERRIDE LOGGING

- **Current status:** Safe (hardened)
- **Exact issue found:** `admin_overrides` was used append-only in code, but the schema did not enforce it; UPDATE/DELETE could theoretically be issued.
- **Schema change required:** No new tables or columns. Additive triggers only.
- **Migration plan:** Create trigger function `prevent_admin_overrides_modify()` that raises on UPDATE or DELETE. Attach BEFORE UPDATE and BEFORE DELETE triggers on `admin_overrides`. Created only if table `admin_overrides` exists. No change to existing override INSERT logic.
- **Code-level fix:** None required in application code. Override logging remains as in `settlementService.js` (INSERT with previous_value, new_value, admin_id, reason, etc.). Triggers ensure append-only at DB level.
- **Backward compatibility:** Preserved. All existing override writes are INSERTs; no behaviour change. Override records cannot be edited or deleted via application or direct SQL (except by dropping the trigger).

---

## Summary

| Section | Status   | Schema change      | Breaking? |
|---------|----------|--------------------|-----------|
| 1       | Hardened | Additive table     | No        |
| 2       | Hardened | Additive index     | No        |
| 3       | Hardened | Additive index     | No        |
| 4       | Hardened | Additive function  | No        |
| 5       | Hardened | Additive triggers  | No        |

Migration file: `backend/db/migrations/2026-02-go-live-hardening.sql`. Run once against the target database; all steps are idempotent (IF NOT EXISTS / DO blocks).
