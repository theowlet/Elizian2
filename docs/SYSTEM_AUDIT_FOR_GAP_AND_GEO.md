# System Audit for Gap Implementation + Geo Enablement

**Mandatory Step 1 before implementing Part A or Part B.**  
Last updated: February 2026.

---

## 1. Entity Relationships

| Entity | Purpose | Key relations |
|--------|---------|----------------|
| **users** | Consumers; auth via OTP/M-PIN; tier (Nova, Aether), tokens | `current_tier_id` → tiers; user_auth_credentials 1:1 |
| **partners** | Venues (no separate `venues` table). One partner = one venue. | category_id → categories; partner_offers, partner_hours, bookings (partner_id) |
| **bookings** | Consumer bookings (orders). Has voucher_code, partner_id, user_id | redemption_audit 1:1 per redemption; bookings.voucher_code used at QR redeem |
| **partner_offers** | Deals/offers per partner. Discounts, $EZT co-pay, perk_type, perk_description | partner_id → partners; redemption via voucher + redemption_audit |
| **tiers** | Platform tiers (Nova, Aether, etc.). Platform-level only. | users.current_tier_id; partner_venue_tiers for per-venue custom tiers (gap) |
| **redemption_audit** | Immutable record of each voucher redemption at a partner | booking_id, redeemed_by_partner_id, total_bill_amount, ezt_co_pay_amount, net_amount_from_user; geo columns present |
| **check_ins** | Legacy check-in table (latitude, longitude, check_in_method) | user_id, partner_id |
| **transactions** | Token-earn/spend records | user_id, partner_id, check_in_id |

**QR / voucher flow:** Consumer has booking with voucher_code → Partner scans QR → Backend validates booking, creates redemption_audit (with optional redemption_latitude, redemption_longitude, geo_verified). No separate “check-in” step before redemption; redemption is the check-in.

**Token distribution:** Via transactions/token_ledger; $EZT co-pay at redemption (ezt_co_pay_amount in redemption_audit). No in-app token sale.

---

## 2. Geo Fields (Current State)

| Location | Fields | Notes |
|----------|--------|--------|
| **partners** | `address` (TEXT), `latitude` (DECIMAL 10,8), `longitude` (DECIMAL 11,8) | In `elizian_schema.sql`. No `place_id` or `geo_verified`. |
| **partnerRepository** | Reads/writes latitude, longitude on create. **updatePartner does NOT allow latitude/longitude** in allowedFields — so profile edit does not update lat/lon. | Geocoding on address save not implemented. |
| **redemption_audit** | `redemption_latitude`, `redemption_longitude`, `geo_verified` | Added in `2026-02-gap-analysis-features.sql`. |
| **enhancedRedemptionService** | Uses partner lat/lon from `partners`; computes haversine; sets `geo_verified = (km <= 0.5)`. | 500 m radius. Redemption controller accepts redemption_latitude, redemption_longitude from request body. |
| **offerRepository** | Uses `p.latitude`, `p.longitude` for distance filtering (user_latitude, user_longitude, max_distance_km). | Public offers query supports geo sort/filter. |
| **partnerService** | Haversine distance for sorting partners (e.g. list by distance). | Expects partners to have latitude, longitude. |
| **responseNormalizer** | Normalizes partner `latitude`, `longitude`, `address` for API responses. | Venue detail and partner payloads expose these. |

**Gap for Part A:** Partners can have lat/lon (e.g. set at create) but there is no auto-geocoding when address is updated. No `place_id` or `geo_verified` on partners. Add these via migration; implement server-side geocoding on address save; add map preview and “Open in Google Maps” in Console and consumer venue page.

---

## 3. How Address Is Stored

- **partners:** Single field `address` (TEXT). No separate city/state/zip in base schema (city can be parsed from address in repo, e.g. `extractCity(r.address)`).
- **Partner create:** `partnerRepository` INSERT accepts `address`, `latitude`, `longitude` (and other fields). Lat/lon can be set at create but are not required.
- **Partner update:** `partnerController.updatePartner` → `partnerService.updatePartner` → `partnerRepository.updatePartner`. Allowed fields: name, description, address, phone_number, email, partner_discount_percentage, rating, is_active, website_url, partner_category_type, cuisine_types, dietary_preferences, avg_cost_for_two. **Address can be updated; latitude/longitude are not in allowedFields**, so they are never updated by the current update flow. Safe to add server-side geocoding that sets lat/lon/place_id/geo_verified when address is saved (without adding them to client-editable allowedFields if desired).

---

## 4. API Endpoints Relevant to Geo + Venues

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | `/api/v1/partners/:id/venue-detail` | Public venue detail (consumer). Returns partner + menu images + hours + review stats + offers. |
| PUT | `/api/v1/partners/:id` | Partner updates profile (name, address, etc.). **Hook here for geocoding on address change.** |
| GET | `/api/v1/offers` | Public offers; supports `user_latitude`, `user_longitude`, `max_distance_km` for distance filter/sort. |
| POST | Redemption endpoint (voucher redeem) | Body can include `redemption_latitude`, `redemption_longitude`; backend writes to redemption_audit and sets geo_verified. |

Partner creation is likely admin or registration flow; ensure geocoding is also applied there when address is set.

---

## 5. How Frontend Consumes Venue Data

| Context | Source | Usage |
|---------|--------|--------|
| **Venue detail page** | `GET /api/v1/partners/:id/venue-detail` | VenueDetailPage.jsx: venue name, category, rating, review count, offers, menu, hours, tip/message/waitlist CTAs. **Map embed / distance / “Open in Maps” can be added using venue lat/lon from this API.** |
| **Home / discovery** | `GET /api/v1/offers` | HomePage: deal cards with partner_id; navigate to `/venue/${partner_id}`. Distance shown when user location + offer/partner lat/lon available. |
| **Venue map** | VenueMapPage | Map of partners; click → `/venue/:id`. Expects partner list with lat/lon. |
| **Partner Console** | Partner-specific APIs (e.g. partner profile, dashboard) | Edit venue profile (address etc.). **Add map preview and “Open in Google Maps” here; geocoding runs on save.** |

Venue = Partner. No separate venue table or venue-specific API; all venue data comes from `partners` and related (offers, hours, reviews).

---

## 6. Safe Additions for Part A (Geo-Enabled Partner Address)

- **Migration:** Add to `partners` only if not present: `place_id VARCHAR(255)`, `geo_verified BOOLEAN DEFAULT false`. (latitude, longitude already exist.)
- **Backend:** On partner create/update when `address` is set or changed:
  - Call Google Geocoding API (server-side only).
  - Set `formatted_address`, `latitude`, `longitude`, `place_id`, `geo_verified = true` on success; on failure set `geo_verified = false`, do not block save.
- **updatePartner:** Either allow backend to set latitude, longitude, place_id, geo_verified from geocoding result (recommended), or add a separate internal “applyGeocode” step that runs after update. Do not allow client to send lat/lon/place_id if you want a single source of truth (address → geocode).
- **Partner Console:** Show map preview (e.g. static map or iframe) at saved lat/lon and “Open in Google Maps” link.
- **Consumer VenueDetailPage:** Show map preview and distance (if user location permitted); “Open in Google Maps” link.

---

## 7. Regression Surface (Do Not Touch)

- **Auth:** OTP, M-PIN, JWT, check-mpin, verify-mpin, set-mpin.
- **Bookings:** Create booking, voucher_code, status flow.
- **Redemption:** enhancedRedemptionService redeem flow, redemption_audit insert, geo_verified computation (only enhance with 100m if required; currently 500 m).
- **Offers:** partner_offers, listPublicOffers, filters (status, not_expired, partner status). $EZT co-pay in offers and redemption.
- **Tiers:** Platform tiers (Nova, Aether); users.current_tier_id. Per-venue tiers are in partner_venue_tiers (gap feature).
- **Partner create:** Existing INSERT with address, latitude, longitude. Add geocoding after insert when address present, or in a single transaction.

---

## 8. Existing Gap-Implementation Artifacts

- **2026-02-gap-analysis-features.sql:** venue_reviews, partner_guest_notes, partner_venue_tiers, perk_type/perk_description on partner_offers, redemption_audit geo columns, tips, partner_notification_campaigns, partners.review_count / average_rating.
- **Guest CRM:** guestRepository; GET partners/:id/guests, GET partners/:id/guests/:userId, POST guests/:userId/notes.
- **Venue detail:** getVenueDetail (partner + menu + hours + offers + review stats).
- **Geo-verified redemption:** Already implemented (500 m); can tighten to 100 m per master prompt.

Use this audit when implementing Part A (geo-enabled partner address) and Part B (phased gap features) so changes remain backward compatible and non-breaking.
