# Universal Filter Engine — Audit & Implementation Report

**Date:** February 2026  
**Scope:** Elizian filter system vs Eazydiner-style depth; multi-vertical (Dining, Spa, Wellness, Events, Healthcare, Travel, Others).  
**Constraints:** Backward compatibility; no restaurant-only bias; filters must adapt to category context.

---

## 1. Current Filter Coverage

### 1.1 Frontend (HomePage / LandingPage)

| Filter | UI Exists | Sends to API | Notes |
|--------|-----------|--------------|--------|
| **Category (service_type)** | ✅ Chips (All, Dining, Events, …) | ❌ No | Client-side only: filters `allDeals` by `service_type` after fetch. Single fetch with no `service_type` param. |
| **Sort: Distance** | ✅ Filter panel (Sort by) | ❌ No | Client-side sort only. API receives `user_latitude`/`user_longitude` for distance_km in response. |
| **Sort: Discount** | ✅ Filter panel | ❌ No | Client-side sort only. |
| **Sort: Rating** | ✅ Filter panel | ❌ No | Client-side sort only. |
| **Sort: Price** | ✅ Filter panel | ❌ No | Client-side sort only. |
| **Near Me (geo)** | ✅ Toggle | ✅ Yes | Sends `user_latitude`, `user_longitude`; API returns `distance_km` and sorts by distance. |
| **Price range** | ❌ No | ❌ No | Not in UI. API supports `price_min`, `price_max` but controller→service→repo chain drops them (see §2). |
| **Min rating** | ❌ No | ❌ No | API supports `min_rating`; not passed through service. |
| **Max distance (km)** | ❌ No | ❌ No | API supports `max_distance_km`; not passed through service. |
| **Cuisine** | ❌ No | ❌ No | API supports `cuisine_types`; not passed through service. |
| **Trending only** | ❌ No | ❌ No | API supports `trending=true`; frontend does not send. |
| **Premium / Verified** | ❌ No | ❌ No | Data exists (`approved_for_featured`); no filter param. |
| **Search (text)** | Placeholder only | ❌ No | Not wired. |

### 1.2 API Query Parameters (GET /api/v1/offers)

**Accepted by controller (offerController.listPublicOffers):**

- `limit`, `is_active`, `service_type`, `trending`, `admin`, `include_expired`
- `cuisine_types` (string or array)
- `price_min`, `price_max`, `min_rating`
- `user_latitude`, `user_longitude`, `max_distance_km`

**Passed through offerService to repository:** Only `status`, `not_expired`, `has_started`, `service_type`, `trending`, `limit`, `admin`, `partner_ids`. **Price, rating, geo, cuisine are dropped.**

### 1.3 Backend (offerRepository.listPublicOffers)

**SQL-level support (when params received):**

- ✅ `service_type` → `po.service_type = $n`
- ✅ `trending` → `po.is_trending = $n`
- ✅ `cuisine_types` → `p.cuisine_types && $n::text[]`
- ✅ `price_min` / `price_max` → discounted_price/original_price range
- ✅ `min_rating` → `p.rating >= $n`
- ✅ `user_latitude`, `user_longitude`, `max_distance_km` → Haversine distance filter
- ✅ Geo sort: when user lat/lng provided, `ORDER BY distance_km ASC NULLS LAST`
- ✅ Partner active/approved, offer status/not_expired/has_started

**Not implemented in repo:**

- Open now / bookable (would need operating hours + slot availability).
- Explicit “premium only” (`approved_for_featured = true`); data selected but no WHERE filter.
- EZT co-pay / Echelon filters (no param or column in filter path).

### 1.4 Database Indexing

| Table / columns | Index | Purpose |
|-----------------|--------|---------|
| partner_offers(status) | idx_offers_status / idx_partner_offers_status | Status filter |
| partner_offers(start_date, end_date) | idx_partner_offers_dates | Validity window |
| partner_offers(is_trending) | idx_partner_offers_trending | Trending filter |
| partners(cuisine_types) | idx_partners_cuisine_types (GIN) | Cuisine filter |
| partner_offers(service_type) | **Missing** | Service-type filter |
| partners(rating) | **Missing** | Min-rating filter |
| partners(latitude, longitude) | **Missing** | Geo/distance (Haversine uses both) |

---

## 2. Functional Gaps

1. **Service layer drops filters**  
   offerService.listPublicOffers does not pass `price_min`, `price_max`, `min_rating`, `user_latitude`, `user_longitude`, `max_distance_km`, `cuisine_types` to the repository. So these are **API-accepted but non-functional**.

2. **Category sent as client-side only**  
   Frontend fetches once without `service_type`; category chips filter in memory. Works but does not reduce payload or enable server-side pagination by category.

3. **No “open now” / bookable**  
   No filter for “open now” or “has bookable slots”; would require joining partner_hours / slot availability.

4. **No premium-only filter**  
   `approved_for_featured` is in SELECT only; no `?premium=true`-style filter.

5. **No vertical-specific filters in API**  
   Dining: cuisine present in repo; meal period, service type (buffet/set menu/a la carte), outdoor seating, etc. not in offers API. Spa/Events/Travel: no therapy type, event type, date, stay type, etc.

6. **Search**  
   No text search (title, partner name); would need ILIKE or full-text search.

7. **Pagination**  
   Only `limit`; no `offset` or cursor. Combined with filters, “load more” would need offset/next-page support.

8. **Combined filters**  
   When service passes all params through, combination is AND (repository already builds AND). No conflict; need to ensure UI sends coherent combinations.

9. **Clearing filters**  
   Frontend has “Clear” for sort; no unified “clear all filters” or URL sync for filter state.

---

## 3. Restaurant-Specific Biases Found

- **Copy / UX:** “Search restaurants, events, cuisines…” and “Top Restaurants Near You” use “restaurants”; other verticals are mixed in via `service_type` but wording is dining-heavy.
- **Cuisine:** Only dining-relevant; repo uses `partners.cuisine_types`. For Spa/Events, equivalent would be tags/therapy_type/event_type — not present as filters.
- **Cost for two:** `avg_cost_for_two` exists on partners and is returned; no `cost_for_two_min/max` filter in API. If added, should be optional and not the only cost filter (price_min/price_max are vertical-agnostic).
- **Data model:** `service_type` and categories are multi-vertical; no logic assumes “only dining.” Filter *depth* is dining-biased (cuisine, cost for two) until vertical-specific filters are added.

**Recommendation:** Keep universal filters (price, rating, distance, trending, premium). Add vertical-specific filters only when that category is selected; label and schema should be neutral (e.g. “Cost range” not “Cost for two” in universal UI).

---

## 4. Multi-Vertical Compliance Status

| Requirement | Status |
|-------------|--------|
| All verticals (Dining, Events, Spa, Wellness, Healthcare, Travel, Others) in category/service_type | ✅ Supported in schema and API. |
| Filters not assuming only dining | ⚠️ Cuisine and “cost for two” are dining-leaning; price_min/max are universal. |
| Category-context filters (show dining filters when Dining selected, etc.) | ❌ Not implemented; all users see same filter set. No dining-only or spa-only filter panels. |
| Backend filter logic vertical-agnostic | ✅ Repo uses service_type, price, rating, distance; no hardcoded “restaurant.” |

---

## 5. Performance Risk Areas

- **Haversine in WHERE:** Distance filter uses expression in WHERE; without spatial index or precomputed grid, large partner sets may be slower. Index on (latitude, longitude) helps bounding-box pre-filters; full Haversine still scans.
- **Large limit:** Default 100, max 1000; single query. Pagination (offset/limit or keyset) recommended for production.
- **Missing indexes:** service_type, rating, and geo not indexed for filter; recommend adding (see §8).
- **N+1:** Single list query; no N+1 in list path. Detail/venue calls are separate.
- **In-memory filtering:** Frontend does category and sort in memory after one big fetch; acceptable for current limit but does not scale; server-side filter + sort preferred.

---

## 6. Implementation Roadmap

### Phase 1 — Make existing API filters functional (backward compatible)

1. **offerService:** Pass through `price_min`, `price_max`, `min_rating`, `user_latitude`, `user_longitude`, `max_distance_km`, `cuisine_types` from `filters` to `repoFilters`. Do not remove or rename existing params.
2. **Optional:** Add `premium_only` (or `approved_for_featured`) to controller + service + repo as optional boolean; when true, add `AND p.approved_for_featured = true`.
3. **Frontend:** Add optional query params to `loadAllDeals`: e.g. when user sets “Price range” or “Within X km”, send `price_min`, `price_max`, `max_distance_km`; keep existing behavior when not set.
4. **Indexes:** Add `CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);`, `CREATE INDEX IF NOT EXISTS idx_partners_rating ON partners(rating) WHERE rating IS NOT NULL;`, and consider composite for (latitude, longitude) or use existing if any.

### Phase 2 — Universal filter set (all categories)

- Location (geo radius): already in repo; fix service pass-through.
- Distance sort: already returned and sortable; frontend can keep client sort or request server sort order param later.
- Rating: min_rating in repo; fix pass-through; add UI.
- Price range: in repo; fix pass-through; add UI.
- Availability: “Open now” / “Bookable” requires design (operating hours + optional slot check); defer or MVP as “accepting_bookings” only.
- Discount / co-pay: filter by discount_percentage or ezt_equivalent range; add param + repo condition if needed.
- Trending: already supported; optional “Trending only” toggle in UI.
- Premium / verified: add `premium_only` and show in UI.
- EZT / Echelon: data in offers; add optional `ezt_copay_max` or “Echelon access” later.

### Phase 3 — Category-context filters (show only when relevant)

- **Dining:** Cuisine (already in repo), meal type, service type (buffet/set menu/a la carte), outdoor seating, etc. Require partner/offer metadata and new params.
- **Spa & Wellness:** Therapy type, duration, couple-friendly, etc. Require schema/fields.
- **Events:** Event type, date range, ticket range, VIP. Require event-specific fields.
- **Travel:** Stay type, star rating, refundable, breakfast. Require travel-specific fields.

Implement in order: backend params + repo conditions (optional), then UI that only shows when `activeCategory` matches (e.g. show cuisine only when Dining).

### Phase 4 — Advanced

- Sticky filter memory per category; saved presets; multi-select; fuzzy search; URL sync for filters.

---

## 7. Migration Risk Assessment

- **Pass-through fix (Phase 1):** Low risk. Additive; existing calls without new params behave as today. Old URLs without new query params unchanged.
- **New optional params:** Low risk. All new filters optional; fallback behavior unchanged when param missing.
- **Indexes:** Low risk. IF NOT EXISTS; no data change.
- **Frontend sending new params:** Low risk. Only send when user changes filter; default load unchanged.
- **Renaming/removing existing params:** Not planned; would break backward compatibility.

---

## 8. Suggested Index Additions

```sql
-- Filter / sort performance
CREATE INDEX IF NOT EXISTS idx_partner_offers_service_type ON partner_offers(service_type);
CREATE INDEX IF NOT EXISTS idx_partners_rating ON partners(rating) WHERE rating IS NOT NULL;
-- Geo: bounding box can use lat/lng; full Haversine still scans
CREATE INDEX IF NOT EXISTS idx_partners_lat_lng ON partners(latitude, longitude) WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
```

---

## 9. QA Checklist (Summary)

| Check | Status |
|-------|--------|
| All current filters listed | ✅ §1 |
| Missing vs Eazydiner identified | ✅ §2, §6 |
| UI-only vs functional | ✅ §1.1, §2 (price, rating, distance, cuisine API-ready but not passed through) |
| Partially functional | ✅ Geo: works for sort; distance filter dropped by service |
| SQL per filter | ✅ §1.3 |
| Performance bottlenecks | ✅ §5 |
| Index suggestions | ✅ §8 |
| Multi-vertical compliance | ✅ §4 |

---

## 10. Eazydiner-Style Benchmark (Mapping)

| Eazydiner | Elizian equivalent | Status |
|-----------|--------------------|--------|
| Deal type (Set Menu, Buffet, A La Carte) | service_type / perk_type | Partial (data exists; no dedicated filter) |
| Buckets (Top Rated, Trending) | is_trending, rating | Trending in repo; rating filter dropped by service |
| Cuisine | cuisine_types | In repo; dropped by service |
| Categories | service_type (Dining, Events, …) | ✅ Client-side; API supports, not sent |
| Cost for Two | avg_cost_for_two, price_min/max | price in repo; cost_for_two in SELECT only |
| Location | user_lat/lng, max_distance_km | In repo; distance filter dropped by service |
| Meal Period | — | Not in API |
| Discount % | discount_percentage | In data; no filter param |
| Rating | min_rating | In repo; dropped by service |
| Distance | distance_km sort + filter | Sort works; filter dropped |
| Availability | — | No “open now” |

**Conclusion:** Elizian has the data and most of the SQL; the main gap is the **service layer not forwarding** price, rating, geo, and cuisine to the repository. Fixing that makes existing API filters functional. Then add UI and optional indexes; then add category-context and vertical-specific filters without restaurant-only bias.

---

## 11. Implementation Completed (Phase 1)

- **offerService:** All universal filters now passed through to repository: `cuisine_types`, `price_min`, `price_max`, `min_rating`, `user_latitude`, `user_longitude`, `max_distance_km`, and new `premium_only`.
- **offerRepository:** Optional `premium_only` filter added (`p.approved_for_featured = true`).
- **offerController:** Reads `premium_only` from query and passes to service.
- **filterBuilder.js:** New `backend/src/utils/filterBuilder.js` — `buildOfferListFilters()`, `buildOfferListOrderBy()` for reuse and future list endpoints.
- **Indexes:** `backend/db/migrations/2026-02-filter-engine-indexes.sql` — indexes on `partner_offers.service_type`, `partner_offers.is_trending`, `partners.rating`, `partners(latitude, longitude)`, `partners.approved_for_featured`.
- **Frontend (HomePage):** Server-side filter state added: `maxDistanceKm`, `minRating`, `priceMin`, `priceMax`, `premiumOnly`. `loadAllDeals` sends these and `service_type` (from active category) to the API. Refetch effect runs when these or `activeCategory` change. Filter panel extended with: Within 10 km, Within 25 km, 4+ rating, Premium only; Clear all resets sort + server filters.
- **Backward compatibility:** Existing API calls without new params behave unchanged. No param renames or removals.
