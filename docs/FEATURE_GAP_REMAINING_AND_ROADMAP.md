# Feature Gap: Remaining vs Elizian vs Blackbird (v2 / v3 Admin)

**References:**  
- Elizian_vs_Blackbird_Feature_Gap_v2.docx  
- Elizian_vs_Blackbird_Feature_Gap_v3_Admin.docx  
- Elizian_vs_Blackbird_Feature_Gap.docx  

**Constraints (from docs):** No in-app bill payments, no in-app token sales. In-app tipping is in scope.

This document reviews the **current Elizian2 codebase** against the feature set in those documents and lists **gaps still existing** and **recommended development**.

---

## 1. What Is Already Implemented (No Gap or Minor Polish Only)

| Area | Feature | Current state in codebase |
|------|---------|---------------------------|
| **Check-in & identity** | Geo-verified check-in | Redemption accepts `redemption_latitude`/`redemption_longitude`; backend sets `geo_verified` (100 m radius). Visit sessions + QR check-in with geo. |
| | Guest profile / identity | Tier badges on orders; Guest CRM with clickable guest profiles, visit history, notes (Partner Console). |
| | Guest value score | `guestRepository.computeValueScore(visitCount, totalSpend)`; shown in guest profile modal. |
| **Rewards & loyalty** | Token rewards, cross-venue EZT | $EZT co-pay on offers; redemption_audit; cross-venue use via any partner offer. |
| | Platform tiers | Nova, Aether; `current_tier_id`; visible on orders and dashboard. |
| | Per-venue custom tiers | `partner_venue_tiers` table; Partner Console “Venue Tiers” section (CRUD). |
| | Tangible perks | `perk_type`, `perk_description` on `partner_offers`; API and HomePage deal cards use them. |
| | Offer/coupon management | Full offer engine: codes, %, validity, redemption tracking, category, trending. |
| **Discovery & content** | Venue discovery feed | HomePage: categories, deal cards, “View venue”; geo params passed to `/api/v1/offers` (`user_latitude`, `user_longitude`); server returns `distance_km` and sorts by distance. |
| | Map view | VenueMapPage (Leaflet) at `/venues/map`; partners with lat/lon; “Sorted by distance” when location available. |
| | Venue detail pages | VenueDetailPage: hero, about, hours, menu, offers, reviews, rating, tips, message, map, “Open in Google Maps”, prelaunch waitlist, founding member badge. |
| | Event discovery | EventsPage, EventDetailPage, `/events`, `/events/:id`; eventRoutes (list, get, purchaseTicket); HomePage “Events” category + getLiveEvents. |
| | Social proof / reviews | `venue_reviews`; submit review (auth); list reviews; aggregate rating on venue detail; review_count / average_rating on partners. |
| **Merchant tools** | Dashboard (KPIs) | Total orders, today’s orders, revenue, menu items; recent orders with voucher redemption details (total bill, fiat paid, co-pay EZT, redeemed at). |
| | Order/booking management | Order table; booking list; QR Scanner; redeem voucher with calculation. |
| | Venue profile, menu, offers | Partner Console: profile edit, menu images, full offers engine. |
| | Guest CRM | GET guests, GET guest profile, POST guest notes; Guests section + guest modal with visit history and value score. |
| | Notification campaigns | `partner_notification_campaigns`; Partner Console Campaigns section (create, edit, “Send”). |
| | In-app messaging | `venue_conversations`, `venue_messages`; “Message venue” on VenueDetailPage; Partner Console Messages section. |
| **Other** | In-app tipping | Tips table; POST/GET tips; “Tip venue” modal on VenueDetailPage (amount, note). |
| | Subscription passes | Pass products; claim by code; “My passes”; partner redeem in Scanner. |
| | EZ Club | Migration `ez_club_*` on users; redemption updates count; Profile shows EZ Club badge and progress. |
| | Pre-launch / founding member | Prelaunch signup API; “Join waitlist” and “Founding member” badge on venue page. |
| | Staff / employee rewards | Staff migration; routes (list, add, remove, check-in); Partner Console Staff section. |
| | Preference-based recommendations | GET `/api/v1/recommendations/offers`; “Recommended for you” on Home (when logged in). |
| | Partner geo (Part A) | `place_id`, `geo_verified`, `formatted_address` migration; geocodingService; geocode on partner create/update; POST `/:id/verify-location`. Map preview and “Open in Google Maps” in Console and venue page. |
| | Referral (backend) | referralService (code generation, apply at signup); referral routes; system settings for rewards. |

---

## 2. Gaps Still Existing (To Be Developed)

### 2.1 High impact (Phase 1–2)

| # | Gap | Doc reference | Recommendation |
|---|-----|----------------|-----------------|
| **1** | **Campaign push delivery** | Merchant Messaging & Push Notifications | **Current:** “Send” campaign only sets `status = 'sent'` in DB. No FCM/APNs or in-app notification inbox. **Build:** (a) Integrate push provider (FCM/APNs) and store device tokens per user; (b) On campaign send, push to segment (e.g. “guests who visited this venue”); and/or (c) In-app inbox so “Campaigns” send creates entries users see in the app. |
| **2** | **Referral consumer UI** | Token Rewards on Referral | **Current:** Backend referral (code, apply at signup, rewards) exists; no referral entry in main consumer app (SignupPage, Profile). **Build:** Signup: optional “Referral code”; Profile: “Your referral link” + share; optional “Referral stats” (earned EZT, invites). |
| **3** | **Distance filter on first load (optional)** | Venue Discovery Feed | **Current:** HomePage passes `user_latitude`/`user_longitude` when loading offers (for sort and `distance_km`). It does **not** pass `max_distance_km`; server-side distance filter is optional. **Build:** Optional “Within X km” control that sets `max_distance_km` in the initial offers request for consistency with backend. |

### 2.2 Medium impact (Phase 2–3)

| # | Gap | Doc reference | Recommendation |
|---|-----|----------------|-----------------|
| **4** | **Analytics depth** | Analytics Dashboard | **Current:** Partner dashboard has summary KPIs; getPartnerAnalytics exists. **Build:** Trends (orders/revenue over time), simple cohorts (e.g. first visit month), retention curve, revenue by period; expose in Partner Console Analytics section. |
| **5** | **EZ Club benefits in product** | EZ Club (Cross-Network Loyalty Tier) | **Current:** EZ Club qualification and badge are implemented; no product benefit (e.g. priority reservations, exclusive events). **Build:** Define 1–2 concrete benefits (e.g. “EZ Club” flag on booking, early access to events) and implement in booking/event flows. |
| **6** | **Event creation by venues** | Event Discovery & Curation | **Current:** Events are listable and bookable; event creation may be admin-only or limited. **Build:** Allow partners to create/manage events from Partner Console (if not already), and show “Events” in venue detail where relevant. |

### 2.3 Phase 3 (Defensibility & moat)

| # | Gap | Doc reference | Recommendation |
|---|-----|----------------|-----------------|
| **7** | **NFT-style membership cards (per-venue)** | NFT Membership Cards | **Current:** Migration `user_venue_membership_cards` exists (digital collectible, no blockchain). **Build:** When user redeems/visits a venue, mint/assign a membership card; “My membership cards” in Profile/Wallet; show on venue detail (“Member” badge). |
| **8** | **Community governance** | Community Governance / Participation Token | **Current:** Migration `governance_proposals`, `governance_votes` exists. **Build:** Proposals (e.g. new city, category priority); voting by active users (e.g. by check-ins or $EZT); read API + minimal admin UI; optional consumer “Vote” surface. |
| **9** | **Developer / API platform** | Developer / API Platform | **Current:** Migration `developer_api_keys`; developerController may exist. **Build:** Self-serve API key creation (scopes: e.g. vouchers:validate, loyalty:read); rate limits; public docs for check-in, voucher validation, loyalty status so third parties can integrate. |
| **10** | **Deflationary burn mechanics** | Deflationary Burn Mechanics | **Current:** “$EZT platform fee burn” described in docs; not verified in code. **Build:** If in scope: define fee per redemption/transaction and burn path (e.g. send to burn address or record in ledger); implement in redemption/token flow and document. |

---

## 3. Out of Scope (Per Gap Docs)

- In-app bill payments  
- In-app token sales  
- NFC pucks (for now)  
- Proprietary L3 blockchain  

---

## 4. Summary: What to Build Next

1. **Campaign push delivery** – So “Send” actually delivers to guests (push and/or in-app inbox).  
2. **Referral consumer UI** – Signup referral code + Profile “Your link” and share.  
3. **Analytics depth** – Trends, cohorts, retention, revenue by period in Partner Console.  
4. **EZ Club benefits** – At least one concrete benefit in booking/events.  
5. **Event creation by partners** – If not already, allow venues to create events from Console.  
6. **Phase 3:** NFT-style membership cards UI, governance (proposals + voting), developer API platform, and deflationary burn (if required).

---

## 5. References in Codebase

- **Geo & audit:** `docs/SYSTEM_AUDIT_FOR_GAP_AND_GEO.md`  
- **Migrations:** `backend/db/migrations/2026-02-gap-analysis-features.sql`, `2026-02-partners-geo-place-id-verified.sql`, `2026-02-in-app-messaging.sql`, `2026-02-ez-club.sql`, `2026-02-subscription-prelaunch.sql`, `2026-02-staff-rewards.sql`, `2026-02-developer-api-governance-membership-cards.sql`  
- **Implementation summary:** `GAP_ANALYSIS_IMPLEMENTATION.md`
