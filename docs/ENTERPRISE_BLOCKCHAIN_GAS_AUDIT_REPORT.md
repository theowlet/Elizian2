# Enterprise + Blockchain + Gas Optimization Audit Report

**Scope:** Elizian Web2 backend (Node/Express/PostgreSQL), voucher/redemption flow, platform earnings, token (EZT) ledger, and hybrid Web2 + future L2/L3 readiness.  
**Date:** 2026-02-24.  
**Method:** Business flow trace, DB consistency, API security, refund/redemption invariants, cross-layer risks.  
**Note:** No on-chain smart contracts present; ethers.js used for wallet creation and token transfer only. Sections 4 (Smart Contract), 5 (Gas), 6 (L2/L3), 7 (Tokenomics) are abbreviated with forward-looking and cross-layer notes.

---

## SECTION 1 – WEB2 BUSINESS FLOW TRACE

**Mapped flows:** User creation → Tier assignment → Booking (voucher) creation → Voucher state (created→booked→active) → Redemption → Platform fee ledger → Wallet (EZT) debit/credit → Refund.

**Invariants checked:** Double redemption (prevented), concurrent redemption (FOR UPDATE + redemption_audit unique), rollback on state-machine failure (booking creation), ledger vs computed (platform fee from tier % on fiat only).

---

## SECTION 2 – DATABASE CONSISTENCY AUDIT

**Findings:** redemption_audit has FK and unique index (booking_id WHERE redemption_status = 'redeemed'). Platform fee uses DECIMAL(12,2). Financial logic uses parseFloat + round to 2 decimals; DB casts to DECIMAL in INSERTs. Refund path writes token_ledger without balance_before/balance_after (see Issue 4).

---

## SECTION 3 – API CONTRACT & SECURITY VALIDATION

**Findings:** Redemption endpoint is rate-limited (redemptionRateLimiter). Auth and role checks present. No idempotency key (X-Idempotency-Key) on POST /redemptions/redeem; idempotency is by business logic (existing redemption check). Commission/tiers are server-side (partner_tiers table).

---

## SECTION 4 – SMART CONTRACT AUDIT

**Status:** No Solidity or on-chain contracts in repo. Ethers.js used for: (1) creating user/partner wallets, (2) storing public_key and **private_key** in `accounts` table, (3) optional token transfer from master wallet. No on-chain redemption or voucher logic to audit.

---

## SECTION 5 – GAS OPTIMIZATION AUDIT

**Status:** N/A for current codebase (no on-chain execution). For future L2/L3: settlement and high-frequency operations should be designed for batch/off-chain proof where possible.

---

## SECTION 6 – L2 / L3 ARCHITECTURE REVIEW

**Current:** Web2-only settlement. EZT balance and token_ledger are in PostgreSQL. No bridge or sequencer.  
**Recommendation:** When adding L2/L3, define which operations are on-chain (e.g. final settlement, proof of redemption) vs off-chain (ledger, reporting). Ensure event listeners and retries are idempotent to avoid duplicate financial effects on reorg or replay.

---

## SECTION 7 – TOKENOMICS AUDIT

**Current:** EZT is in-app (users.available_tokens + token_ledger). Signup bonus and loyalty at redemption. No inflation schedule or public token contract in repo.  
**Risks for future:** Align reward emission with platform margin; guard against farming (e.g. tier upgrade cost vs margin).

---

## SECTION 8 – CROSS-LAYER CONSISTENCY

**Web2 DB ↔ external (Ethereum):** Token transfer on signup is best-effort (registration does not roll back on transfer failure). DB is source of truth for balances; no automatic sync from chain.  
**Refund vs redemption:** processRefund does not check redemption_audit; see Issue 2.

---

# ISSUES (Structured Output)

---

### Issue 1 – Platform earnings ledger insert failure is non-fatal; redemption still commits

| Field | Content |
|-------|--------|
| **Severity** | High |
| **Affected Layer** | API / DB |
| **Root cause** | In `enhancedRedemptionService.js`, platform_earnings_ledger insert is inside try/catch. On failure, error is logged and flow continues; COMMIT runs. Redemption and EZT debit are persisted; ledger row may be missing. |
| **Risk scenario** | Admin platform earnings report undercounts; reconciliation (ledger sum vs actual fees) fails. |
| **Exploit scenario** | Not directly exploitable; operational/reporting integrity. |
| **Financial impact** | Understated platform revenue in reports; possible dispute with partners or auditors. |
| **Suggested fix** | Either (a) make ledger insert mandatory and rollback the whole redemption on failure, or (b) implement a reconciliation job that detects missing ledger rows for redemption_id and inserts them (with idempotency). Prefer (a) for single source of truth. |
| **DB migration required** | No. |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | No. |

---

### Issue 2 – Refund allowed after redemption without checking redemption_audit; wrong EZT credit

| Field | Content |
|-------|--------|
| **Severity** | Critical |
| **Affected Layer** | API / DB |
| **Root cause** | `adminService.processRefund` does not check if the booking has a completed redemption in `redemption_audit`. It uses `booking.ezt_redeemed` (from booking record) to credit EZT back. At redemption, EZT co-pay is stored in `redemption_audit.ezt_co_pay_amount`; `bookings.ezt_redeemed` is not updated. So refund can (1) credit zero or wrong EZT, or (2) allow refund of an already-redeemed voucher (double benefit: user consumed service and gets refund). |
| **Risk scenario** | Admin refunds a booking that was already redeemed at venue. User gets refund (and possibly EZT credit if booking had some ezt_redeemed). Platform and partner have already recognized revenue and platform fee. |
| **Exploit scenario** | Collusion or admin error: refund after redemption to grant unjustified refund + EZT. |
| **Financial impact** | Revenue leakage; incorrect EZT supply; partner/platform dispute. |
| **Suggested fix** | (1) In processRefund, query redemption_audit for booking_id WHERE redemption_status = 'redeemed'. If a row exists, either block refund or implement a separate “refund-after-redemption” flow with explicit approval and reversal of platform fee. (2) When crediting EZT on refund, use redemption_audit.ezt_co_pay_amount (converted to EZT) if redemption exists, else booking.ezt_redeemed. (3) Ensure token_ledger refund row includes balance_before and balance_after. |
| **DB migration required** | No (schema sufficient). |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | No; process and validation change. |

---

### Issue 3 – User registration not wrapped in a single transaction; orphan records and private key exposure

| Field | Content |
|-------|--------|
| **Severity** | Critical (private key storage); High (orphan records) |
| **Affected Layer** | DB / API |
| **Root cause** | In `authService.registerUser` (and similar paths), multiple operations run sequentially without BEGIN/COMMIT: INSERT users, INSERT tier_progress, INSERT user_auth_credentials, INSERT accounts (including **private_key**), optional Ethereum transfer, UPDATE otp_sessions, grantSignupBonus. If any step after user insert fails, user row can exist without tier_progress or credentials. Private keys are stored in plaintext in `accounts.private_key`. |
| **Risk scenario** | DB compromise or SQL injection exposes all user/partner private keys. Partial failure leaves inconsistent state (e.g. user without tier_progress). |
| **Exploit scenario** | Attacker with DB read access exfiltrates private keys and drains wallets. |
| **Financial impact** | Total loss of custody for in-chain tokens linked to those keys. |
| **Suggested fix** | (1) Wrap all registration steps in a single transaction; rollback on any failure. (2) Do not store raw private keys. Use HSM, KMS, or at minimum encrypted-at-rest with a key not in the same DB. Prefer wallet-per-user via secure enclave or user-held keys; backend only holds public key or delegate. |
| **DB migration required** | Yes if moving to encrypted key storage (new columns or key vault). |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | Yes for key custody (architecture change). |

---

### Issue 4 – Refund token_ledger insert missing balance_before / balance_after

| Field | Content |
|-------|--------|
| **Severity** | Medium |
| **Affected Layer** | DB |
| **Root cause** | In `adminService.processRefund`, the INSERT into token_ledger for refund_credit does not set balance_before or balance_after. Other token_ledger writes (e.g. in tokenService.redeemTokens and creditEarned) set both. |
| **Risk scenario** | Reconciliation or debugging of user balance history is incomplete; balance reconstruction from ledger rows fails for refunds. |
| **Exploit scenario** | N/A. |
| **Financial impact** | Audit trail gap; harder to prove correct EZT balance after refunds. |
| **Suggested fix** | Before updating users.available_tokens, read current balance; after update, compute new balance; INSERT token_ledger with balance_before, balance_after, amount (positive for credit), ledger_type 'refund_credit'. |
| **DB migration required** | No. |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | No. |

---

### Issue 5 – No idempotency key on redemption POST; replay can hit 409 but duplicates load

| Field | Content |
|-------|--------|
| **Severity** | Low |
| **Affected Layer** | API |
| **Root cause** | POST /api/v1/redemptions/redeem does not accept X-Idempotency-Key. Idempotency is enforced by business logic (existing redemption_audit row → 409). Retries or replay cause repeated validation and DB work until 409. |
| **Risk scenario** | Network retries or client bugs cause duplicate attempts; no operational abuse, but unnecessary load and log noise. |
| **Exploit scenario** | N/A. |
| **Financial impact** | Negligible. |
| **Suggested fix** | Add optional X-Idempotency-Key. Store key with redemption_id or in a short-lived idempotency table; for duplicate key return 200 with same payload (or 409 if already redeemed). Rate limiting already present. |
| **DB migration required** | Optional (idempotency table with TTL or cleanup job). |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | No. |

---

### Issue 6 – Cancellation flow has TODO for refund; no automatic refund on cancel

| Field | Content |
|-------|--------|
| **Severity** | Medium |
| **Affected Layer** | API / Business flow |
| **Root cause** | In `adminService.updateBookingStatus`, when status is set to 'cancelled', a TODO states "Trigger refund process if applicable" and only logs. No automatic refund or EZT recredit. |
| **Risk scenario** | Admin cancels booking expecting refund; user is not refunded unless processRefund is called separately. Inconsistent UX and support burden. |
| **Exploit scenario** | N/A. |
| **Financial impact** | User dissatisfaction; manual refund process. |
| **Suggested fix** | Define policy: which status transitions (e.g. confirmed → cancelled) trigger refund. Either call processRefund from updateBookingStatus when appropriate or document that cancellation and refund are separate admin actions and enforce in UI. |
| **DB migration required** | No. |
| **Contract redeploy required** | N/A. |
| **Protocol redesign required** | No. |

---

### Issue 7 – Booking creation and voucher state transition rollback; EZT debit rollback

| Field | Content |
|-------|--------|
| **Severity** | N/A (positive finding) |
| **Affected Layer** | API |
| **Root cause** | N/A. |
| **Risk scenario** | N/A. |
| **Suggested fix** | None. Verified: createBooking uses a transaction; on voucher state-machine failure it ROLLBACK. redeemTokens is called with executor (same client). Redemption uses FOR UPDATE and unique constraint on redemption_audit. Double redemption is prevented. |

---

## SUMMARY TABLE

| # | Severity   | Layer     | One-line summary |
|---|------------|-----------|-------------------|
| 1 | High       | API/DB    | Ledger insert failure does not rollback redemption → reporting mismatch. |
| 2 | Critical   | API/DB    | Refund allowed after redemption; EZT credit from wrong source; no redemption check. |
| 3 | Critical/High | DB/API | Registration not transactional; private keys stored in plaintext. |
| 4 | Medium     | DB       | Refund token_ledger row missing balance_before/balance_after. |
| 5 | Low        | API      | No X-Idempotency-Key on redemption POST. |
| 6 | Medium     | API/Flow | Cancel booking has TODO; no automatic refund. |
| 7 | —          | —        | Double redemption prevented; booking rollback on state-machine failure. |

---

## RECOMMENDATIONS (PRIORITY)

1. **Critical:** Fix refund-after-redemption (block or special flow + use redemption_audit for EZT amount).  
2. **Critical:** Remove plaintext private key storage; wrap registration in a transaction.  
3. **High:** Make platform_earnings_ledger insert part of the same atomic redemption transaction (or strict reconciliation job).  
4. **Medium:** Add balance_before/balance_after to refund token_ledger insert; clarify cancel vs refund policy and implementation.

---

*End of audit report. No stylistic refactors suggested; focus is correctness, integrity, security, and robustness.*
