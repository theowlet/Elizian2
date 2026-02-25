# Elizian Reputation & Intelligence System

Enterprise reputation, moderation, and analytics. **Additive-only**: no changes to existing tables (redemption_audit, venue_reviews, messaging, auth).

## Backward Compatibility

- **No ALTER TABLE** on existing schema.
- **No modification** of redemptions, messaging, or partner core.
- **Existing API shapes preserved**: `GET/POST /api/v1/partners/:id/reviews` unchanged; implementation delegates to new reputation service.
- **Venue detail** aggregate: reads from `review_analytics` → `reputation_reviews` → `venue_reviews` (fallback).
- **Isolated namespace**: new tables only; existing routes unchanged.

## New Tables (Migration: 2026-02-reputation-intelligence.sql)

| Table | Purpose |
|-------|--------|
| `reputation_reviews` | One review per redemption; rating, comment, sentiment/toxicity/spam scores; moderation_status; soft delete only |
| `review_audit_logs` | Append-only audit for every action (CREATED, AUTO_FLAGGED, dispute, restore, etc.) |
| `partner_review_settings` | Per-partner: reviews_enabled, comments_enabled, auto_moderation_enabled |
| `review_analytics` | Precomputed metrics: rolling_avg_rating, trend_30_day, sentiment_avg, flag_ratio, risk_score |

## Rules (Review Creation)

- Logged-in user only (JWT).
- Redemption must exist for user+partner with `redemption_status = 'redeemed'`.
- One review per redemption (DB UNIQUE on `redemption_id`).
- Partner must have `reviews_enabled = true` (default in settings).

## Moderation Pipeline

1. **Layer 1 – Profanity**: Configurable dictionary + regex (EN + HI minimum).
2. **Layer 2 – Toxicity**: Score 0–1; placeholder uses profanity; AI can be plugged in.
3. **Layer 3 – Sentiment**: -1 to +1; from rating when no AI.
4. **Layer 4 – Spam**: Links, repeated chars, length.
5. **Layer 5 – Anomaly**: Velocity / IP / device (placeholder; can be extended).

If threshold exceeded → `moderation_status = FLAGGED`, `is_visible = false`, audit log `AUTO_FLAGGED`.

## Risk & Reputation Formulas

- **Partner reputation score (weighted)**: avg rating 40%, recent trend 20%, sentiment 15%, flag ratio 15%, complaint 10%.
- **Merchant risk score**: flag_ratio + negative sentiment (placeholder; can add refund correlation, dispute frequency).

## Governance

- **Partner**: Disable reviews globally; request dispute; view reason codes (via settings and audit).
- **Admin**: Soft delete only; restore; mark malicious; block user if abuse (implement in admin routes; audit required).
- **No hard delete** of reviews; all actions in `review_audit_logs`.

## Performance

- Indexes on `partner_id`, `moderation_status`, `created_at`, `rating`; paginate all list endpoints.
- Analytics: computed by **scheduled job** (`reviewAnalyticsJob.runAll`) or **event-driven** after insert (`reputationReviewService.updatePartnerAnalytics`).

## Concurrency & Abuse

- One review per redemption enforced by DB UNIQUE.
- Rate limiting should be applied at API gateway or route level for submit.
- Velocity anomaly (e.g. X reviews/min per partner) can set FLAGGED in Layer 5 when implemented.

## Routes

- **Existing (unchanged)**: `GET/POST /api/v1/partners/:id/reviews` — list and submit; implementation uses reputation service.
- **Isolated namespace**: `GET /api/v1/reviews/partners/:partnerId`, `GET /api/v1/reviews/partners/:partnerId/aggregate`, `POST /api/v1/reviews/partners/:partnerId` (auth, rate-limited) — same behaviour, dedicated namespace.
- **Admin governance**: `DELETE /api/v1/admin/reviews/:reviewId` (soft-delete), `POST /api/v1/admin/reviews/:reviewId/restore`, `GET /api/v1/admin/reviews/:reviewId/audit`, `POST /api/v1/admin/reviews/:reviewId/mark-malicious`, `POST /api/v1/admin/reviews/block-user` (body: `user_id`, `reason`), `POST /api/v1/admin/reviews/unblock-user` (body: `user_id`) — require super admin.
- **Partner**: `POST /api/v1/partners/:id/reviews/:reviewId/request-dispute` (body: `reason`), `GET /api/v1/partners/:id/reviews/:reviewId/moderation-reason` — require partner ownership.

## Scripts

- **Run analytics job**: `node backend/scripts/run-review-analytics-job.js` — recomputes `review_analytics` for all partners with reviews. Schedule via cron (e.g. every 15 min) or run after bulk imports.

## Deployment Checklist

1. Run base migration: `node backend/run-reputation-migration.js` (creates reputation_reviews, review_audit_logs, partner_review_settings, review_analytics).
2. Run governance migration: `node backend/run-reputation-governance-migration.js` (adds ip_address, marked_malicious_*, dispute_*, blocked_review_users). See `docs/REPUTATION_DEPLOYMENT_RUNBOOK.md` for full steps.
3. Ensure `redemption_audit` and `bookings.partner_id` exist (FK to redemption is optional if table missing).
4. Schedule analytics: `node backend/scripts/run-review-analytics-job.js` (e.g. cron every 15 min) or rely on event-driven update after each review.
5. Optionally seed `partner_review_settings` for partners who want reviews disabled.
6. No changes to auth middleware or existing API contracts.

## Regression Safety

- Existing `venue_reviews` data and table unchanged; venue detail falls back to it if new tables empty.
- GET/POST `/partners/:id/reviews` response shape unchanged (list array, submit returns created review).
- Frontend continues to work; rating/aggregate come from API (no hardcoded 4.5).
