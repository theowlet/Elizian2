# Reputation & Intelligence System — Production Deployment Runbook

Use this checklist for a consistent, safe deployment. Order matters.

---

## Pre-requisites

- [ ] PostgreSQL database accessible; `redemption_audit` and `bookings` exist (existing schema).
- [ ] No pending ALTER on existing tables from this system (additive only).

---

## Step 1: Run base reputation migration (if not already run)

```bash
cd backend
node run-reputation-migration.js
```

**Creates:** `reputation_reviews`, `review_audit_logs`, `partner_review_settings`, `review_analytics`.

**Verify:** All four tables exist; no errors in logs.

---

## Step 2: Run governance + Layer 5 migration

```bash
node run-reputation-governance-migration.js
```

**Adds:**  
- On `reputation_reviews`: `ip_address`, `marked_malicious_at`, `marked_malicious_by`, `dispute_requested_at`, `dispute_requested_by`, `dispute_reason`.  
- New table: `blocked_review_users`.

**Verify:** `blocked_review_users` exists; `reputation_reviews` has new columns (optional: `SELECT column_name FROM information_schema.columns WHERE table_name = 'reputation_reviews'`).

---

## Step 3: Schedule analytics job (optional but recommended)

Run the review analytics job on a schedule so `review_analytics` stays up to date:

```bash
node scripts/run-review-analytics-job.js
```

**Suggested cron:** Every 15 minutes, e.g.:

```cron
*/15 * * * * cd /path/to/backend && node scripts/run-review-analytics-job.js
```

Alternatively, rely on event-driven update after each review (already implemented in `reputationReviewService.submitReview`).

---

## Step 4: Seed partner review settings (optional)

If any partners should have reviews disabled by default:

```sql
INSERT INTO partner_review_settings (partner_id, reviews_enabled, comments_enabled, auto_moderation_enabled)
VALUES ('<partner-uuid>', false, true, true)
ON CONFLICT (partner_id) DO UPDATE SET reviews_enabled = false;
```

---

## Step 5: Confirm routes and env

- [ ] **Routes mounted:** `/api/v1/reviews` (list, submit, aggregate); `/api/v1/admin/reviews/*` (soft-delete, restore, audit, mark-malicious, block-user, unblock-user); partner routes `/:id/reviews/:reviewId/request-dispute`, `/:id/reviews/:reviewId/moderation-reason`.
- [ ] **Auth:** Review submit uses `authenticateToken`; admin routes use `requireSuperAdmin`; partner dispute/reason use `checkPartnerOwnership`.
- [ ] **Rate limit:** Review submit has `reviewSubmitRateLimiter` (e.g. 5 per minute per IP).

---

## Step 6: Backward compatibility check

- [ ] **No ALTER** on existing tables (redemption_audit, venue_reviews, messaging, users).
- [ ] **Legacy API:** `GET/POST /api/v1/partners/:id/reviews` still work and delegate to reputation service.
- [ ] **Venue detail:** Aggregate rating still resolves (review_analytics → reputation_reviews → fallback).

---

## Step 7: Post-deploy smoke test

1. **Submit a review** (logged-in user, after a successful redemption): `POST /api/v1/reviews/partners/:partnerId` with `{ "rating": 5, "comment": "Great" }`. Expect 201.
2. **List reviews:** `GET /api/v1/reviews/partners/:partnerId`. Expect array.
3. **Admin soft-delete:** `DELETE /api/v1/admin/reviews/:reviewId`. Expect 200.
4. **Admin restore:** `POST /api/v1/admin/reviews/:reviewId/restore`. Expect 200.
5. **Admin audit:** `GET /api/v1/admin/reviews/:reviewId/audit`. Expect audit entries.
6. **(After governance migration)** Admin mark malicious: `POST /api/v1/admin/reviews/:reviewId/mark-malicious`. Expect 200.
7. **(After governance migration)** Admin block user: `POST /api/v1/admin/reviews/block-user` with `{ "user_id": "<uuid>", "reason": "Abuse" }`. Expect 200. Then submit review as that user; expect 403.
8. **(After governance migration)** Partner request dispute: `POST /api/v1/partners/:partnerId/reviews/:reviewId/request-dispute` (partner auth) with `{ "reason": "Not my visit" }`. Expect 200.
9. **(After governance migration)** Partner moderation reason: `GET /api/v1/partners/:partnerId/reviews/:reviewId/moderation-reason` (partner auth). Expect 200 with `reason_codes` when review was auto-flagged.

---

## Rollback (if needed)

- **Do not** drop tables if production data exists. Soft-delete and audit are the rollback for bad reviews.
- To disable the system: set `reviews_enabled = false` for all partners in `partner_review_settings` (or per partner). No code rollback required for “pause.”

---

## Reference

- **Gap analysis:** `docs/REPUTATION_INTELLIGENCE_GAP_ANALYSIS.md`
- **System overview:** `docs/REPUTATION_INTELLIGENCE_SYSTEM.md`
