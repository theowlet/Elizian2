# Part A – Geo-Enabled Partner Address (Implementation Summary)

Implemented per **CURSOR_MASTER_PROMPT** and **SYSTEM_AUDIT_FOR_GAP_AND_GEO**. No breaking changes; additive only.

---

## 1. Files Modified / Added

### Backend
- **`backend/db/migrations/2026-02-partners-geo-place-id-verified.sql`** (new) – Adds `place_id`, `geo_verified`, `formatted_address` to `partners`.
- **`backend/src/services/geocodingService.js`** (new) – Server-side Google Geocoding API; returns `formatted_address`, `latitude`, `longitude`, `place_id`; never exposes API key.
- **`backend/src/repositories/partnerRepository.js`** – Added `updatePartnerGeo(partnerId, geo)` for server-only geo updates.
- **`backend/src/services/partnerService.js`** – Geocoding on partner create (when address present) and on partner update (when address changed); does not block save on API failure.
- **`backend/src/repositories/adminRepository.js`** – Admin partners list now returns `formatted_address`, `latitude`, `longitude`, `geo_verified` for map link and badge.
- **`backend/.env.example`** – Documented optional `GOOGLE_GEOCODING_API_KEY`.

### Frontend
- **`frontend/src/pages/VenueDetailPage.jsx`** – Contact & Location: address, “Verified location” badge, map iframe preview, “Open in Google Maps” link when `latitude`/`longitude` present.
- **`frontend/src/pages/PartnerConsole.jsx`** – Profile: map preview and “Open in Google Maps” when partner has lat/lon; “Verified” badge when `geo_verified`.
- **`frontend/src/styles/partnerConsole.css`** – Styles for map block and Open in Maps button.
- **`frontend/public/js/admin.jsx`** – Partner cards: address + “Verified” badge when `geo_verified`; “Open in Google Maps” link when lat/lon present.
- **`frontend/public/css/admin.css`** – `.admin-maps-link` for map link.

### Docs
- **`docs/SYSTEM_AUDIT_FOR_GAP_AND_GEO.md`** – Step 1 audit (entities, geo fields, address storage, APIs, frontend consumption, safe additions, regression surface).

---

## 2. SQL Migration

Run once (additive, backward compatible):

```bash
# From project root, with DB connection configured
psql $DATABASE_URL -f backend/db/migrations/2026-02-partners-geo-place-id-verified.sql
```

Or via your migration runner. The script adds only if columns are missing:
- `partners.place_id` (VARCHAR 255)
- `partners.geo_verified` (BOOLEAN DEFAULT false)
- `partners.formatted_address` (TEXT)

Existing `partners.latitude` and `partners.longitude` are unchanged.

---

## 3. Environment

- **`GOOGLE_GEOCODING_API_KEY`** (optional): When set, partner create/update with address triggers server-side geocoding and sets `latitude`, `longitude`, `place_id`, `formatted_address`, `geo_verified = true`. When unset or on API failure, save still succeeds and `geo_verified` is set to false. API key is never sent to the frontend.

---

## 4. Behaviour Summary

- **Partner create:** If `address` is provided, after insert the service calls Google Geocoding and then `updatePartnerGeo`. Same for **partner update** when `address` is in the payload and different from current.
- **No repeated calls:** Geocoding runs only when address is new or changed.
- **Map visibility:**  
  - **Partner Console:** Profile shows map preview + “Open in Google Maps” when lat/lon exist.  
  - **Admin:** Partner list shows address, “Verified” when `geo_verified`, and “Open in Google Maps” when lat/lon exist.  
  - **Consumer Venue page:** Contact & Location shows address, verified badge, map preview, and “Open in Google Maps”.
- **Google Maps link format:** `https://www.google.com/maps/search/?api=1&query=LAT,LNG`

---

## 5. Regression Risk

- **Low:** No existing tables/columns renamed; no existing API contracts changed. New columns are nullable/defaulted. Geocoding is best-effort and does not block partner save. `updatePartner` still only allows existing allowedFields; geo fields are set only via `updatePartnerGeo` in the service.

---

## 6. Manual Testing Checklist

- [ ] Run migration; confirm `partners` has `place_id`, `geo_verified`, `formatted_address`.
- [ ] Create partner with address (with `GOOGLE_GEOCODING_API_KEY` set): confirm lat/lon/place_id/formatted_address/geo_verified updated.
- [ ] Update partner address: confirm geo fields re-geocoded; change address again and save, confirm only one geocode for that save.
- [ ] Unset or invalid API key: create/update partner with address; confirm save succeeds and `geo_verified` is false.
- [ ] Venue detail page: for a partner with lat/lon, confirm map preview and “Open in Google Maps” work.
- [ ] Partner Console Profile: confirm map and “Open in Google Maps” when partner has lat/lon.
- [ ] Admin partners list: confirm “Verified” and “Open in Google Maps” where applicable.

---

## 7. Rollback

- **Code:** Revert the listed files.
- **DB:** To remove new columns (optional):  
  `ALTER TABLE partners DROP COLUMN IF EXISTS place_id, DROP COLUMN IF EXISTS geo_verified, DROP COLUMN IF EXISTS formatted_address;`  
  (Only if no other code relies on them.)

---

## 8. Ready for Future Use

- Geo layer is ready for: 100 m geo-fenced QR check-in (tighten radius in `enhancedRedemptionService`), nearby venue sorting (already supported in offers/partners), map-based discovery, distance ranking. No further schema change required for these.
