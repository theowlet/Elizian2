# Universal Experience Card + Dynamic Filter Engine — Implementation Summary

Production-grade, backward-compatible implementation of the Universal Experience Card blueprint and DB-backed dynamic filter system across all 7 categories.

---

## 1. Updated file list

### New files
| Path | Purpose |
|------|--------|
| `backend/db/migrations/2026-02-experience-metadata.sql` | Experience metadata table + indexes (offer_id → partner_offers) |
| `backend/src/utils/dynamicFilterBuilder.js` | Category-aware dynamic filter builder (SQL-safe, param placeholders) |
| `frontend/src/config/filterSchema.js` | Universal + category-specific filter schema (drives UI + API params) |
| `frontend/src/components/ExperienceCard.jsx` | Universal card: 4 layers (image, core, category module, actions) |
| `frontend/src/styles/experienceCard.css` | Card layout: 320–360px, 16:9 image, elevation, mobile sticky CTA |

### Modified files
| Path | Changes |
|------|---------|
| `backend/src/repositories/offerRepository.js` | Optional LEFT JOIN experience_metadata; merge dynamic conditions; return experience_metadata; fallback when table missing |
| `backend/src/controllers/offerController.js` | New query params: meal_type, therapy_type, duration_min/max, event_type, event_date, star_rating, refundable, specialization |
| `backend/src/services/offerService.js` | Pass-through of dynamic filter params to repo |
| `backend/src/utils/responseNormalizer.js` | Pass-through experience_metadata, partner_cuisine_types, partner_avg_cost_for_two, min_tier_name |
| `frontend/src/pages/HomePage.jsx` | ExperienceCard for main listing; search intent (keyword → category); dynamic filter state + API params; category filter chips in panel |

---

## 2. Schema changes

### New table: `experience_metadata`
- **Primary key:** `offer_id` (UUID, REFERENCES partner_offers(id) ON DELETE CASCADE).
- **Columns:** cuisine (TEXT[]), meal_type (TEXT[]), service_type_list, therapy_type (TEXT[]), duration_minutes, event_type (TEXT[]), event_date, seats_left, star_rating, refundable, breakfast_included, specialization (TEXT[]), consultation_fee, verified, price_min, price_max, amenities (TEXT[]), tags (TEXT[]), created_at, updated_at.
- **Indexes:** price (price_min, price_max), GIN(tags), GIN(cuisine), GIN(therapy_type), GIN(event_type), star_rating, duration_minutes.

**Backward compatibility:** Listing works without this table. When the table is missing and dynamic filters are used, the repo retries without the metadata join so existing deployments do not break.

---

## 3. API changes

### GET /api/v1/offers (additive only)
Existing query params unchanged. **New optional params:**

| Param | Type | Category | Description |
|-------|------|----------|-------------|
| meal_type | string[] (repeat or comma) | Dining | Filter by meal type |
| therapy_type | string[] | Spa, Wellness | Filter by therapy type |
| duration_min | int | Spa, Wellness | Min duration (minutes) |
| duration_max | int | Spa, Wellness | Max duration (minutes) |
| event_type | string[] | Events | Filter by event type |
| event_date | date (YYYY-MM-DD) | Events | Filter by date |
| star_rating | int | Travel | Min star rating |
| refundable | true | Travel | Only refundable |
| specialization | string[] | Healthcare | Filter by specialization |

**Response:** Each offer may include `experience_metadata` (object or undefined) with category-specific fields when the metadata join was used. Legacy clients can ignore it.

---

## 4. Regression risk assessment

| Area | Risk | Mitigation |
|------|------|------------|
| Existing offers list | Low | No change when new params not sent; same WHERE/ORDER/LIMIT for base query |
| Existing filters | Low | price_min, price_max, min_rating, max_distance_km, premium_only, cuisine_types, service_type unchanged |
| Routes / deep links | None | No route or path changes |
| Mobile layout | Low | ExperienceCard is responsive; grid unchanged |
| Featured / Trending sections | None | Only “All Experiences” grid uses ExperienceCard; other sections keep current cards |

---

## 5. Performance

- **DB:** Filters use existing indexes (partner_offers.service_type, is_trending; partners.rating, lat/lon, approved_for_featured) and new GIN/indexes on experience_metadata. LEFT JOIN only when dynamic filters are present.
- **No N+1:** Single list query; metadata columns selected in same query when join is used.
- **Target:** Response under 200ms with indexed filters and reasonable limit (e.g. 100). No in-memory filtering; all filtering in SQL.

---

## 6. Edge cases

| Case | Behavior |
|------|----------|
| experience_metadata table missing | Repo catches error, retries without metadata join and without dynamic conditions; listing still returns (without metadata filter). |
| Offer has no experience_metadata row | LEFT JOIN yields NULLs; row still returned; experience_metadata in response undefined or empty. |
| Category filter sent for wrong category | dynamicFilterBuilder builds conditions per service_type; irrelevant filters do not apply. |
| Empty multi-select (e.g. cuisine_types=[]) | Not appended to params; no filter applied. |
| Search keyword matches multiple intents | First match wins (e.g. “spa” then “events”); UI can be extended to prefer last match or disambiguate. |

---

## 7. How to run

1. **Migration (optional but recommended for category filters):**
   ```bash
   # From project root or backend
   psql $DATABASE_URL -f backend/db/migrations/2026-02-experience-metadata.sql
   ```
   Or run via your existing migration runner if it picks up this file.

2. **Backend:** No config change. New params are optional.

3. **Frontend:** No env change. Ensure HomePage loads ExperienceCard and filterSchema.

4. **Populate experience_metadata:** Optional. Insert rows for offer_id (partner_offers.id) to enable category-specific filtering and card metadata. If not populated, listing still works; dynamic filters that rely on metadata will effectively be no-ops (offers without metadata still included due to “em.offer_id IS NULL OR …” logic).

---

## 8. Design goals met

- **Universal card:** One ExperienceCard component; 4 layers (image, core metadata, category-specific module, action bar); works for Dining, Spa, Events, Travel, Healthcare, Wellness, Others.
- **Category-adaptive metadata:** Layer 3 renders different fields by service_type (e.g. cuisine/cost for two for Dining; duration/therapy for Spa; date/seats for Events; star/refundable for Travel; specialization/consultation/verified for Healthcare).
- **Dynamic filter schema:** filterSchema.js defines universal + per-category filters; panel and API params driven by schema; no restaurant-only bias.
- **DB-backed filtering:** experience_metadata table + dynamicFilterBuilder; optional JOIN; indexed columns; backward compatible when table or rows missing.
- **Backward compatibility:** Existing filters and routes unchanged; legacy clients can ignore experience_metadata and new params.
- **Routing:** No changes to routes or deep links.
- **Mobile-first:** Card full width on small screens; sticky action bar; 16:9 image ratio.
