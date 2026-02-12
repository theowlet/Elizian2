# 🚀 CURSOR MASTER PROMPT – ELIZIAN

**Gap Implementation + Geo Enablement**  
**Mode:** Controlled Enhancement (NO BREAKING CHANGES)

You are acting as a Principal Product Architect + Senior Full Stack Engineer.

You have access to:
- Full Elizian codebase
- Feature Gap Analysis (Elizian vs Blackbird – Feb 2026): [GAP_ANALYSIS_ELIZIAN_VS_BLACKBIRD.md](GAP_ANALYSIS_ELIZIAN_VS_BLACKBIRD.md)
- Implementation status: [GAP_ANALYSIS_IMPLEMENTATION.md](../GAP_ANALYSIS_IMPLEMENTATION.md)

This is a **surgical enhancement**, NOT a rewrite.

---

## 🔒 NON-NEGOTIABLE CONSTRAINTS

**You MUST preserve:**
- Existing tech stack
- Existing folder structure
- PostgreSQL schema integrity
- Field names
- API contracts
- Authentication flow
- QR check-in flow
- Voucher lifecycle
- $EZT co-pay logic
- Tier system (Nova, Aether)
- Partner Console (EZNet)
- Admin dashboard logic

**You are NOT allowed to:**
- Rename tables
- Rename fields
- Modify enum values
- Break existing API payloads
- Change auth architecture
- Introduce payment gateway infra
- Introduce token sale logic
- Refactor working modules unnecessarily

**If schema changes are required:**
- Add columns only (backward compatible)
- Add new tables only
- Provide SQL migrations
- Do NOT modify existing constraints destructively

---

## 🧠 STEP 1 – SYSTEM AUDIT (MANDATORY BEFORE CODING)

Before implementing anything:

1. **Map full entity relationships:** users, partners, venues (if separate), orders, offers, tiers, QR validation logic, token distribution logic.
2. **Identify geo fields** (if any).
3. **Identify how address is stored.**
4. **Identify API update endpoints.**
5. **Confirm how frontend consumes venue data.**

**Only after mapping — begin implementation.**

→ Current-state audit: [SYSTEM_AUDIT_FOR_GAP_AND_GEO.md](SYSTEM_AUDIT_FOR_GAP_AND_GEO.md)

---

## 📍 PART A – GEO-ENABLED PARTNER ADDRESS (FOUNDATIONAL LAYER)

Implement first. Supports: map-based discovery, geo-verified check-ins, distance sorting, venue detail pages.

### 1️⃣ Database Enhancement (Backward Compatible)

If not present, add:

```sql
ALTER TABLE partners
ADD COLUMN IF NOT EXISTS latitude DECIMAL(10,8),
ADD COLUMN IF NOT EXISTS longitude DECIMAL(11,8),
ADD COLUMN IF NOT EXISTS place_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS geo_verified BOOLEAN DEFAULT FALSE;
```

If venues are separate from partners, apply to venue table. Do NOT modify existing address field.

### 2️⃣ Auto Geocoding on Address Save

When partner creates profile or edits address:

1. Detect address change
2. Call **Google Geocoding API (server-side only)**
3. Extract: `formatted_address`, `latitude`, `longitude`, `place_id`
4. Store values; set `geo_verified = true`
5. If API fails: do NOT block save; set `geo_verified = false`; log error

Prevent: repeated API calls if address unchanged; API key exposure to frontend.

### 3️⃣ Map Visibility

- **Partner Console:** Embedded map preview, marker at saved coordinates, “Open in Google Maps” button
- **Admin Panel:** Address + geo status badge, map preview, Google Maps link
- **Consumer (Venue Page):** Static map preview, distance from user (if permitted), Open in Maps CTA

Google Maps link: `https://www.google.com/maps/search/?api=1&query=LAT,LNG`

### 4️⃣ Geo Ready for Future

Design for: 100m geo-fenced QR check-in, nearby venue sorting, map-based discovery, distance ranking.

---

## 🚀 PART B – PHASED FEATURE GAP IMPLEMENTATION

Implement in order.

### 🔹 PHASE 1 – PRE-LAUNCH ESSENTIALS

| # | Feature | Notes |
|---|---------|------|
| 1 | **Rich Venue Discovery Feed** | Venue cards (cover, name, category, distance, perks preview, rating, tier); map/list toggle; geo-sorting. No schema breakage. |
| 2 | **Venue Detail Page** | Dynamic route: gallery, services/menu, offers, perks, reviews (future), hours, map embed, check-in CTA. Reuse Offers engine. |
| 3 | **Guest CRM** | New “Guests” tab: sortable table (name, tier, visits, spend, last visit, value score); clickable profile. New tables: `guest_preferences`, `merchant_guest_notes`. Do NOT modify `users`. |
| 4 | **Per-Venue Experiential Perks** | New: `perks`, `perk_conditions`, `perk_redemptions`. Visit/tier/manual/event triggers. Do NOT modify `offers` table. |
| 5 | **Guest Value Score** | Algorithm: (frequency×visits) + (spend×avg spend) + (referral×referrals) + (cross venue×engagement). Backend computed, cached, recalc on new order. Do NOT modify tier logic. |
| 6 | **Geo-Verified Check-In** | GPS from frontend; backend 100m validation; admin override. No double redemption; no geo spoofing. Must not break current QR validation. |

### 🔹 PHASE 2 – RETENTION ENGINE

| # | Feature | Notes |
|---|---------|------|
| 7 | **In-App Messaging** | `conversations`, `messages`; consumer ↔ venue; read receipts; push-ready. |
| 8 | **In-App Tipping** | No bill payment / token sale. `tips`, `tip_transactions`. Post check-in tip via $EZT or UPI link. Do not modify order schema. |
| 9 | **Reviews & Ratings** | `reviews`, `review_votes`. Verified check-in only; 1 per visit; editable 24h. Aggregate on discovery cards. |
| 10 | **Subscription Passes** | `passes`, `pass_memberships`, `pass_redemptions`. Integrate with QR redemption. |
| 11 | **EZ Club** | `network_status`; cross-venue check-in status. Do NOT modify Nova/Aether. |

### 🔹 PHASE 3 – DEFENSIBILITY

Modular: Staff rewards, recommendation engine (service layer), NFT membership metadata, governance voting table, public read-only API endpoints.

---

## 🔐 SECURITY REVIEW (MANDATORY)

Audit: double redemption, QR race conditions, token manipulation, privilege escalation, geo spoofing, review spam, messaging abuse.

Use: DB transactions, row-level locks, rate limiting.

---

## 📦 AFTER EACH FEATURE

Provide:
1. Files modified
2. SQL migration (if any)
3. Regression risk analysis
4. Performance impact
5. Manual testing checklist
6. Rollback plan

---

## 🚨 DO NOT

- Rewrite app
- Re-architect to microservices
- Replace QR system
- Modify token core logic
- Introduce payment infra or token sale flow
- Change Base integration

---

## 🎯 FINAL OUTCOME

Elizian must have: geo-enabled venues on maps, map-based discovery, rich venue pages, merchant CRM, experiential perks, value scoring, geo-secured check-in, messaging, tipping, reviews, subscription mechanics, network club tier — **without breaking** orders, offers, QR validation, EZT co-pay, existing dashboards, or DB integrity.

If any step risks breaking production logic, add a section: **“Minimal Safe Refactor Required – Justification”**.
