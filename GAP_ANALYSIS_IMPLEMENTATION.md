# Elizian vs Blackbird Gap Analysis – Implementation Summary

**Source document (full narrative, comparison tables, constraints):** [docs/GAP_ANALYSIS_ELIZIAN_VS_BLACKBIRD.md](docs/GAP_ANALYSIS_ELIZIAN_VS_BLACKBIRD.md) (February 2026).

**Scope sources:** The 19-feature list is also defined in:
- **Elizian_vs_Blackbird_Feature_Gap_v2.docx**
- **Elizian_vs_Blackbird_Feature_Gap_v3_Admin.docx**

All 19 features across three phases are in scope; below is implementation status.

**Design constraints (from both docs):** No in-app bill payments, no in-app token sales. In-app tipping is in scope.

---

## Full scope (19 features) – status

| # | Feature | Phase | Status |
|---|---------|--------|--------|
| 1 | Venue Detail Pages | 1 | **Done** |
| 2 | Venue Discovery Feed (map, venue cards, geo-sorting) | 1 | **Done** (geo + “View venue” + map at /venues/map) |
| 3 | Geo-Verified Check-In | 1 | **Done** |
| 4 | Guest CRM / Profiles (partner-side) | 1 | **Done** (backend + Partner Console Guests section) |
| 5 | Per-Venue Custom Tiers | 1 | **Done** (backend + Partner Console Venue Tiers section) |
| 6 | Tangible Perks (free items, secret menu, priority access) | 1 | **Done** (display on cards + venue; partner form in PartnerConsole) |
| 7 | In-App Messaging (Consumer ↔ Venue) | 2 | **Done** (conversations + Message venue + Partner Messages) |
| 8 | In-App Tipping | 2 | **Done** (APIs + “Tip venue” on VenueDetailPage) |
| 9 | Social Proof & Reviews | 2 | **Done** (APIs + submit review + display on venue page) |
| 10 | Subscription Passes | 2 | **Done** (pass products, claim by code, My passes page, partner redeem in Scanner) |
| 11 | EZ Club (Cross-Network Loyalty Tier) | 2 | **Done** (migration, redemption hook, profile/rewards API, Profile badge) |
| 12 | Event Discovery & Curation | 2 | **Done** (Events page, event detail, list by date) |
| 13 | Venue Pre-Launch / Founding Member Programs | 2 | **Done** (signup API, Join waitlist + Founding member badge on venue page) |
| 14 | Merchant Messaging & Push Notifications | 2 | **Done** (backend APIs + Campaigns section in Partner Console) |
| 15 | Staff / Employee Rewards | 3 | **Done** (migration, APIs, Partner Console Staff section, EZT on check-in) |
| 16 | Preference-Based Recommendation Engine | 3 | **Done** (GET /recommendations/offers, “Recommended for you” on Home) |
| 17 | NFT Membership Cards (Per-Venue) | 3 | In scope |
| 18 | Community Governance / Participation Token | 3 | In scope |
| 19 | Developer / API Platform | 3 | In scope |

---

## Implemented (Phase 1)

### 1. **Venue Detail Pages**
- **Backend:** New public endpoint `GET /api/v1/partners/:id/venue-detail` returns full venue data: partner profile, menu images, operating hours (from `partner_hours`), review stats (from `venue_reviews`), and active offers.
- **Frontend:** New page at `/venue/:id` (`VenueDetailPage.jsx`) with hero, about, contact, opening hours, offers grid (Book now), and menu gallery.
- **Discovery:** Home page deal cards now include a “View venue” link that navigates to `/venue/:partnerId`.

### 2. **Geo-Verified Check-In**
- **Migration:** `redemption_audit` gains `redemption_latitude`, `redemption_longitude`, and `geo_verified`.
- **API:** Redemption request body can include `redemption_latitude` and `redemption_longitude`. Backend computes distance to venue (Haversine); if within 500 m, `geo_verified` is set to `true` and stored with the redemption.
- **Backward compatible:** If the new columns are not yet in the DB, redemption still succeeds without geo fields.

### 3. **Guest CRM (Partner-Side)**
- **Migration:** New table `partner_guest_notes` for merchant notes per guest.
- **Backend:**
  - `GET /api/v1/partners/:id/guests` – list guests (visit count, total spend, last visit, tier).
  - `GET /api/v1/partners/:id/guests/:userId` – guest profile: visit history, value score, notes.
  - `POST /api/v1/partners/:id/guests/:userId/notes` – add a note (body: `{ "note": "..." }`).
- **Repository:** `guestRepository.js` with `listGuestsForPartner`, `getGuestProfileForPartner`, `addGuestNote`. Value score is derived from visit count and total spend.
- **Partner console:** Backend is ready; partner UI (e.g. “Guests” section and guest detail modal) can be wired to these APIs.

---

## Database Migration

Run the new migration so all gap-analysis tables and columns exist:

```bash
psql $DATABASE_URL -f backend/db/migrations/2026-02-gap-analysis-features.sql
```

This migration adds or updates:

- **venue_reviews** – ratings and comments per venue (for future reviews feature).
- **partner_guest_notes** – CRM notes.
- **partner_venue_tiers** – per-venue custom tier names/thresholds (for future use).
- **partner_offers** – `perk_type`, `perk_description` (tangible perks).
- **redemption_audit** – `redemption_latitude`, `redemption_longitude`, `geo_verified`.
- **tips** – in-app tips (for future tipping feature).
- **partner_notification_campaigns** – merchant push campaigns (for future use).
- **partners** – `review_count`, `average_rating` (optional denormalized fields).

---

## Not Implemented (In Scope from v2 & v3 – Suggested Next Steps)

All of the following are in scope per both gap documents (v2 and v3).

**Phase 1 (finish):**
- **Venue Discovery Feed:** **Done.** Map at `/venues/map` (VenueMapPage, Leaflet); "View on map" on Home; partners API supports lat/lon for distance sort.- **Per-venue custom tiers:** DB and migration in place; partner console UI to configure tier names and perks still to build.
- **Tangible perks:** **Done.** `perk_type` / `perk_description` on offers; display on HomePage cards and VenueDetailPage; partner form in PartnerConsole (React). Backend create/update offer accepts perk fields.

**Phase 2 (implemented):**
- **In-app tipping:** **Done.** `POST /api/v1/partners/:id/tips`, `GET .../tips` (partner-only). “Tip venue” button and modal on VenueDetailPage (amount presets + custom + notes).
- **Social proof & reviews:** **Done.** `GET/POST /api/v1/partners/:id/reviews`; venue page shows aggregate and list; “Write a review” modal (rating, title, comment).
- **Event discovery & curation:** **Done.** Dedicated `/events` page (EventsPage.jsx) listing events from offers API; `/events/:id` (EventDetailPage.jsx) for event detail; “View all events” from Home. Public `GET /api/v1/offers/:offerId` for single offer/event.

**Phase 2 (remaining):**
- **In-app messaging (consumer ↔ venue):** DMs for reservations, special requests, dietary needs, event queries.
- **Subscription passes:** e.g. Wellness Wednesday, Weeknight Dining Club, Morning Chai Pass (prepaid externally, redeem via QR).
- **EZ Club:** **Done.** Migration `2026-02-ez-club.sql` (users.ez_club_member, ez_club_network_check_ins, ez_club_qualified_at); backfill from redemption_audit; on each redemption, user’s network check-in count incremented and EZ Club set at 5+ check-ins; profile and rewards summary return ez_club; Profile page shows EZ Club badge and progress.
- **Venue pre-launch / founding member programs:** Early sign-ups get guaranteed perks when venue opens.
- **Merchant messaging & push:** **Done.** Backend: `GET/POST /api/v1/partners/:id/campaigns`, `GET/PUT /api/v1/partners/:id/campaigns/:campaignId`, `POST .../send`. Partner Console: “Campaigns” section with list, “New campaign” (title, body, optional segment JSON), Edit, Send now. Delivery is recorded (status=sent, sent_at); actual push can be wired later.

**Phase 3:**
- **Staff / employee rewards:** **Done.** Migration `2026-02-staff-rewards.sql` (partner_staff, staff_check_ins). Partner Console “Staff Rewards”: add staff by email, list staff, record check-in (awards configurable EZT via tokenService.creditFixed). Staff can spend EZT across the network.
- **Preference-based recommendation engine:** **Done.** `GET /api/v1/recommendations/offers` (auth required) returns offers from partners the user has booked/redeemed at, or trending if no history. Home shows “Recommended for you” when logged in.
- **NFT membership cards (per-venue):** Digital collectible per venue in wallet.
- **Community governance / participation:** Active users vote on cities, categories, events (no token sale).
- **Developer / API platform:** Open APIs for check-in, voucher validation, loyalty status for third parties.

---

## Files Touched / Added

| Area | Files |
|------|--------|
| Migration | `backend/db/migrations/2026-02-gap-analysis-features.sql` |
| Venue detail | `backend/src/repositories/partnerRepository.js` (getVenueDetail), `backend/src/services/partnerService.js` (getVenueDetail), `backend/src/controllers/partnerController.js` (getVenueDetail), `backend/src/routes/partnerRoutes.js` |
| Frontend venue page | `frontend/src/pages/VenueDetailPage.jsx`, `frontend/src/App.jsx` (route `/venue/:id`) |
| Home discovery | `frontend/src/pages/HomePage.jsx` (View venue link, card-actions styles) |
| Geo check-in | `backend/src/controllers/redemptionController.js`, `backend/src/services/enhancedRedemptionService.js` (haversine, geo_verified, optional columns) |
| Guest CRM | `backend/src/repositories/guestRepository.js`, `backend/src/controllers/guestController.js`, `backend/src/routes/partnerRoutes.js` |
| Merchant campaigns | `backend/src/repositories/campaignRepository.js`, `backend/src/services/campaignService.js`, `backend/src/controllers/campaignController.js`, `backend/src/routes/partnerRoutes.js`, `frontend/src/pages/PartnerConsole.jsx` (Campaigns section + modal) |
| Guest CRM UI | `backend/src/routes/partnerRoutes.js` (auth on guest routes), `backend/src/controllers/guestController.js` (ownership check), `frontend/src/pages/PartnerConsole.jsx` (Guests section + profile modal + add note) |
| Per-venue tiers | `backend/src/repositories/venueTierRepository.js`, `backend/src/controllers/venueTierController.js`, `backend/src/routes/partnerRoutes.js`, `frontend/src/pages/PartnerConsole.jsx` (Tiers section + modal) |
| In-app messaging | `backend/db/migrations/2026-02-in-app-messaging.sql`, `backend/src/repositories/messagingRepository.js`, `backend/src/controllers/messagingController.js`, `backend/src/routes/partnerRoutes.js`, `backend/src/routes/conversationRoutes.js`, `backend/src/app.js`, `frontend/src/pages/VenueDetailPage.jsx` (Message venue modal), `frontend/src/pages/PartnerConsole.jsx` (Messages section) |
| Subscription passes | `backend/db/migrations/2026-02-subscription-prelaunch.sql`, `backend/src/repositories/subscriptionPassRepository.js`, `backend/src/controllers/subscriptionPassController.js`, `backend/src/routes/subscriptionPassRoutes.js`, `backend/src/routes/partnerRoutes.js`, `frontend/src/pages/MyPassesPage.jsx`, `frontend/src/pages/Profile.jsx` (My passes link), `frontend/src/pages/PartnerConsole.jsx` (Redeem pass in Scanner) |
| Pre-launch / founding member | `backend/src/repositories/prelaunchRepository.js`, `backend/src/controllers/prelaunchController.js`, `backend/src/routes/partnerRoutes.js`, `backend/src/routes/prelaunchRoutes.js`, `frontend/src/pages/VenueDetailPage.jsx` (Join waitlist + Founding member badge) |
| **Field & data consistency** | `backend/src/utils/response.js` (error sends `message` + `error`), `backend/src/services/partnerService.js` (venue-detail offers: S3 image_url, perk_type/perk_description), `backend/src/controllers/bookingController.js` (getBooking QR URL fix), `frontend/public/js/core/api.jsx` (error response uses `message ?? error`), `frontend/src/pages/*` (error display: `result?.message ?? result?.error`), `docs/API_RESPONSE_CONTRACT.md` |
| **Venue map** | `backend/src/services/partnerService.js` (listPartners lat/lon sort), `backend/src/controllers/partnerController.js` (lat, lon query), `frontend/src/pages/VenueMapPage.jsx`, `frontend/src/App.jsx` (route `/venues/map`), `frontend/src/pages/HomePage.jsx` (View on map), leaflet + react-leaflet |
| **EZ Club** | `backend/db/migrations/2026-02-ez-club.sql`, `backend/src/services/enhancedRedemptionService.js` (EZ Club update on redemption), `backend/services/authService.js` (getUserProfile ez_club), `backend/src/services/rewardsService.js` (getUserRewardsSummary ezClub), `frontend/src/pages/Profile.jsx` (EZ Club badge) |
| **Staff rewards** | `backend/db/migrations/2026-02-staff-rewards.sql`, `backend/src/repositories/staffRepository.js`, `backend/src/controllers/staffController.js`, `backend/src/services/tokenService.js` (creditFixed), `backend/src/routes/partnerRoutes.js` (staff routes), `frontend/src/pages/PartnerConsole.jsx` (Staff Rewards section) |
| **Recommendations** | `backend/src/repositories/recommendationRepository.js`, `backend/src/services/recommendationService.js`, `backend/src/controllers/recommendationController.js`, `backend/src/routes/recommendationRoutes.js`, `backend/src/repositories/offerRepository.js` (partner_ids filter), `frontend/src/pages/HomePage.jsx` (Recommended for you section) |
