# Reputation & Intelligence System — Achievement vs Enterprise Prompt

This document maps **what you have today** against the **enterprise master prompt** (layered moderation, risk scoring, intelligence pipeline, governance). Use it to decide next steps: MVP vs full enterprise vs microservice.

---

## Summary: How Much You’ve Achieved

| Area | Status | Notes |
|------|--------|--------|
| **Part 1 – Review core** | ✅ ~95% | Additive schema, transactional rules, one per redemption, partner settings |
| **Part 2 – Layered moderation** | 🟡 ~60% | L1–L4 implemented (profanity, toxicity, sentiment, spam); L5 anomaly placeholder only |
| **Part 3 – Risk & governance** | 🟡 ~70% | Admin soft-delete/restore/audit; partner disable reviews; no dispute-review or “mark malicious” or block-user |
| **Part 4 – Data intelligence** | 🟡 ~40% | Reputation + risk formulas in job; no churn/refund/operational signals or datasets |
| **Part 5 – Analytics readiness** | ✅ ~90% | `review_analytics` table, job + event-driven update, no runtime heavy aggregation |
| **Part 6 – Performance** | ✅ Done | Indexes, pagination |
| **Part 7 – Backward compatibility** | ✅ Done | No ALTER existing; isolated `/api/v1/reviews`; legacy partner review API preserved |
| **Part 8 – Deliverables** | 🟡 Most | Migration, routes, job, formulas, audit; no formal deployment checklist in repo |

**Overall: you are roughly 70–75% of the way to the full enterprise spec**, with a solid, backward-compatible foundation and clear gaps in Layer 5 (anomaly), governance (dispute, malicious, block user), and the full intelligence pipeline (churn, refund, operational signals).

---

## Part 1 – Review Core System (Additive)

| Requirement | Done? | Where |
|-------------|-------|--------|
| Logged-in users only | ✅ | `POST /api/v1/reviews/partners/:partnerId` uses `authenticateToken` |
| redemption.status = SUCCESS | ✅ | `findRedemptionForReview` uses `redemption_status = 'redeemed'` (your schema’s success state) |
| redemption.user_id = JWT user | ✅ | Join via `bookings.user_id`; one redemption per user+partner |
| One review per redemption | ✅ | DB `UNIQUE(redemption_id)` on `reputation_reviews` |
| Partner reviews_enabled = TRUE | ✅ | `getPartnerSettings`; reject with 403 if disabled |
| New tables only (reviews, audit, settings, analytics) | ✅ | `2026-02-reputation-intelligence.sql` – additive only |
| Columns: id, redemption_id, user_id, partner_id, rating, comment, sentiment/toxic/spam, moderation_status, is_visible, created_at, updated_at | ✅ | `reputation_reviews` (table name differs; schema matches) |

**Gap:** None material. Table is `reputation_reviews` not `reviews`; prompt’s intent (additive, one-per-redemption) is met.

---

## Part 2 – Layered Content Moderation

| Layer | Requirement | Done? | Where |
|-------|-------------|-------|--------|
| **L1** | Rule-based profanity, configurable dictionary, regex, EN + HI | 🟡 | `reputationModeration.js`: dictionary + regex; **Hindi not implemented**; config not yet external (DB/config file) |
| **L2** | AI toxicity 0–1, hate/sexual/threat | 🟡 | Placeholder: derives from profanity; **no real AI/API** |
| **L3** | Sentiment -1 to +1, positive/neutral/negative | ✅ | From rating when no text; formula in place |
| **L4** | Spam: repeated content, links, similarity, velocity | 🟡 | Links, repeated chars, length; **no similarity hashing or user-velocity threshold** |
| **L5** | Velocity anomaly: X reviews/min per partner, negative spike, same IP/device | ❌ | **Not implemented**; doc mentions “placeholder; can be extended” |
| On threshold: FLAGGED, is_visible = FALSE, AUTO_FLAGGED in audit | ✅ | `runModeration` + `insertAuditLog('AUTO_FLAGGED', ...)` |

**Gaps:**  
- L1: Externalize config; add Hindi word list.  
- L2: Integrate real toxicity API (e.g. Perspective, or internal model).  
- L4: Add similarity hashing and per-user/per-partner velocity.  
- L5: Implement velocity and anomaly checks (reviews/min, negative spike, IP/device) and set FLAGGED + not visible when exceeded.

---

## Part 3 – Risk Control & Governance

| Requirement | Done? | Where |
|-------------|-------|--------|
| Partner: disable reviews globally | ✅ | `partner_review_settings.reviews_enabled` |
| Partner: request dispute review | ❌ | **Not implemented** (no “dispute this review” flow or status) |
| Partner: view moderation reason codes | 🟡 | Reason codes in audit; **no dedicated partner-facing “reason code” API** |
| Admin: override delete (soft only) | ✅ | `DELETE /api/v1/admin/reviews/:reviewId` → soft delete |
| Admin: restore review | ✅ | `POST .../restore` |
| Admin: mark review as malicious | ❌ | **Not implemented** (no flag or status) |
| Admin: block user if abuse threshold | ❌ | **Not implemented** |
| No hard delete | ✅ | `deleted_at` only; no physical delete |
| All actions in audit log | ✅ | CREATED, AUTO_FLAGGED, SOFT_DELETED, RESTORED |

**Gaps:**  
- Partner: “Request dispute” workflow and optional dispute status/reason.  
- Partner: Explicit API or field for “moderation reason code” for the partner.  
- Admin: “Mark as malicious” (e.g. status or flag) and “block user” when abuse threshold crossed (plus audit).

---

## Part 4 – Data Intelligence Pipeline

| Metric / Signal | Done? | Where |
|-----------------|-------|--------|
| Partner reputation score (weighted: avg 40%, trend 20%, sentiment 15%, complaint 15%, flag 10%) | ✅ | `reviewAnalyticsJob.computeReputationScore` (weights align) |
| Merchant risk score (negative velocity, refund, dispute, toxic clustering) | 🟡 | `computeRiskScore`: flag_ratio + negative sentiment only; **no refund correlation, dispute frequency, or toxic clustering** |
| Churn prediction signals (rating drop, negative sentiment, inactivity) | ❌ | **Not implemented** |
| Refund likelihood (rating ≤2 + negative sentiment, complaint keywords) | ❌ | **Not implemented** |
| Operational inefficiency (complaint categories, late/hygiene/price keywords) | ❌ | **Not implemented** |

**Gaps:**  
- Risk: Wire in refund/dispute data and toxic-clustering (e.g. partner-level toxic review rate).  
- Add datasets or jobs for: churn signals, refund-likelihood, operational keywords/categories (can start as keyword-based, then ML later).

---

## Part 5 – Analytics Readiness

| Requirement | Done? | Where |
|-------------|-------|--------|
| review_analytics table (partner_id, rolling_avg_rating, 30_day_trend, sentiment_avg, flag_ratio, risk_score, updated_at) | ✅ | Migration + `review_analytics`; column is `trend_30_day` |
| Computed via scheduled job or event-driven | ✅ | `reviewAnalyticsJob.runAll` + `reputationReviewService.updatePartnerAnalytics` after insert |
| No heavy aggregation in runtime endpoints | ✅ | List/aggregate read from precomputed or simple counts |

**Gap:** None. Optional: expose `review_analytics` (or a subset) via a read-only admin/partner API if needed.

---

## Part 6 – Performance & Scalability

| Requirement | Done? | Where |
|-------------|-------|--------|
| Indexes: partner_id, moderation_status, created_at, rating | ✅ | Migration: `idx_reputation_reviews_*` |
| Avoid full table scans | ✅ | Queries filter by partner_id / status / deleted_at |
| Paginate all review queries | ✅ | `listByPartner(partnerId, limit, offset)` |

**Gap:** None.

---

## Part 7 – Backward Compatibility Validation

| Check | Done? |
|-------|--------|
| No ALTER TABLE on existing schema | ✅ |
| No modification of redemptions table structure | ✅ (only read) |
| No modification of messaging | ✅ |
| No change to auth middleware | ✅ |
| No change to existing API response shapes | ✅ (legacy partner review API preserved) |
| Isolated route namespace | ✅ `/api/v1/reviews` (+ admin under `/api/v1/admin/reviews`) |

**Gap:** None.

---

## Part 8 – Deliverables (from prompt)

| Deliverable | Done? | Where |
|------------|-------|--------|
| Additive SQL migration | ✅ | `2026-02-reputation-intelligence.sql` |
| Moderation pipeline pseudocode | ✅ | Implemented in `reputationModeration.js` (L1–L4) |
| Express route implementations | ✅ | `reviewRoutes.js`, admin review routes |
| Analytics job logic | ✅ | `reviewAnalyticsJob.js` + run script |
| Risk scoring algorithm formula | ✅ | `computeRiskScore` (simple; extendable) |
| Concurrency safeguards | 🟡 | DB UNIQUE(redemption_id); **no rate limit on submit** in code (may be at gateway) |
| Abuse prevention logic | 🟡 | Moderation + soft delete; **no velocity/L5, no block-user** |
| Regression safety explanation | ✅ | `REPUTATION_INTELLIGENCE_SYSTEM.md` |
| Production deployment checklist | 🟡 | In doc; **no single “runbook” file** in repo |

**Gaps:**  
- Rate limiting on review submit (if not at gateway).  
- Abuse: L5 velocity + anomaly and “block user” when threshold crossed.  
- Optional: one runbook file (e.g. `REPUTATION_DEPLOYMENT_RUNBOOK.md`) with ordered steps.

---

## What You Have vs “Trust Engine” Vision

You already have:

- **Trust engine:** One review per redemption, moderation, visibility, and analytics-backed rating.
- **Moderation control:** Layers 1–4, FLAGGED + audit; partner can disable reviews.
- **Risk scoring:** Basic reputation + merchant risk in `review_analytics`.
- **Partner quality signal:** `rolling_avg_rating` (and trend) used in offer/venue flows.
- **Governance:** Soft delete, restore, full audit trail; no hard delete.

You are missing or partial on:

- **Full moderation intelligence:** Real AI toxicity (L2), L5 velocity/anomaly, IP/device.
- **Full governance:** Partner “dispute review,” admin “mark malicious,” “block user.”
- **Predictive intelligence:** Churn, refund likelihood, operational inefficiency signals.
- **Hardening:** Rate limit on submit, optional runbook.

---

## Recommended Next Steps (by stage)

**MVP / pre-revenue (keep cost low):**  
- Add **L5 velocity only** (e.g. max N reviews per partner per minute; FLAGGED if exceeded).  
- Add **rate limit** on `POST .../reviews/partners/:partnerId`.  
- Optionally: partner-facing **moderation reason** (e.g. return `reason_codes` in a dispute-info endpoint).  
- Leave AI toxicity, refund/churn, and “block user” for later.

**Scaling / post-revenue:**  
- Integrate **toxicity API** (e.g. Perspective) for L2.  
- Implement **dispute review** (status + audit) and **mark as malicious**.  
- Add **refund correlation** and **dispute frequency** into risk score.  
- Add **block user** when abuse threshold crossed (with audit).

**Enterprise / litigation-defensible:**  
- Full **L5** (IP/device, negative spike, velocity).  
- **Churn and refund-likelihood** datasets or jobs.  
- **Operational keywords** (late, hygiene, price) and categories.  
- **Runbook** and, if needed, **microservice** boundary for reputation (same schema, separate deploy).

---

## Conclusion

You are roughly **70–75%** of the way to the full enterprise prompt: core review system, moderation pipeline (L1–L4), analytics, governance (soft delete, restore, audit), and backward compatibility are in place. The main gaps are **L5 anomaly**, **partner dispute + admin malicious/block-user**, and the **predictive/operational intelligence** pieces. Prioritizing L5 velocity + rate limit and a small set of governance features will get you to a robust “trust engine” without full AI or predictive stack.
