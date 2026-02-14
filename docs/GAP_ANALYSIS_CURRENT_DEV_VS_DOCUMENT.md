# Gap Analysis: Current Development vs Elizian vs Blackbird Feature Gap (v2)

**Reference document:** `Elizian_vs_Blackbird_Feature_Gap_v2.docx`  
**Date:** February 2026  
**Scope:** Compare the **current codebase** (Elizian2 repo: `frontend/`, `backend/`) to the feature-by-feature comparison and the 19-feature prioritised build list in the document.

**Design constraints (from document):** No in-app bill payments, no in-app token sales. In-app tipping is in scope.

---

## Executive Summary

| Category | Document expectation | Current dev status |
|----------|----------------------|--------------------|
| **Phase 1 (Pre-launch essentials)** | 6 features | **6 implemented** (venue discovery, venue detail, geo check-in, Guest CRM, per-venue tiers & tangible perks, guest value score) |
| **Phase 2 (Retention & network)** | 8 features | **8 implemented** (messaging, tipping, reviews, subscription passes, EZ Club, event discovery, pre-launch/founding, merchant campaigns) |
| **Phase 3 (Defensibility)** | 5 features | **5 implemented** (staff rewards, recommendation engine, NFT-style membership cards, community governance, developer API platform) |

**Conclusion:** All 19 prioritised features from the v2 document are now implemented. Optional hardening remains (e.g. geo radius 100 m, referral/cross-venue clarity).

---

## 1. Feature-by-feature (document sections A–H) vs current code

### A. Check-In & Identity

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| NFC Puck Check-In | ✘ Not present; QR Scanner in partner console | **Unchanged.** No NFC; QR Scanner in Partner Console. Document says “NFC pucks not needed for now.” |
| In-App Check-In (Consumer) | ⚠ QR-based; merchant QR Scanner | **Same.** Booking/voucher flow; partner redeems via QR. |
| **Geo-Verified Check-In** | ✘ No geo-fence on QR | **Implemented.** `redemption_audit` has `redemption_latitude`, `redemption_longitude`, `geo_verified`. `enhancedRedemptionService` uses Haversine; 500 m radius. Redemption API accepts lat/lon in body. |
| **Guest Profile / Identity** | ⚠ Tier on orders; no clickable guest profile | **Implemented.** Guest CRM: `GET /partners/:id/guests`, `GET /partners/:id/guests/:userId`, `POST .../guests/:userId/notes`. Partner Console has Guests section and guest profile modal. |
| **Guest Value Score** | ✘ No per-guest scoring | **Implemented.** `guestRepository.getGuestProfileForPartner` returns value score (visit count + spend). Shown in guest profile in Partner Console. |

### B. Rewards & Loyalty Mechanics

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| Token Rewards on Check-In | ✔ Mechanism exists | **Same.** $EZT via transactions/token ledger; redemption flow. |
| Token Rewards on Referral | ⚠ Stated in one-pager | **Backend:** `referralController`, `referralService`, `referralRoutes`. Verify UX visibility. |
| Cross-Venue Token Spending | ⚠ Co-pay confirmed; cross-venue unclear | **Same.** $EZT co-pay on offers; cross-venue is product-level (no technical block). |
| Platform-Level Status Tiers | ✔ Nova, Aether on orders | **Same.** `users.current_tier_id`; tier badges on orders and in dashboard. |
| **Per-Venue Custom Tiers** | ✘ Platform-level only | **Implemented.** `partner_venue_tiers` (migration); `venueTierController`, `venueTierRepository`; Partner Console “Venue Tiers” section. |
| **Tangible Perks** | ⚠ % and co-pay; no experiential perks | **Implemented.** `partner_offers.perk_type`, `perk_description`; display on HomePage cards and VenueDetailPage; partner form in PartnerConsole. |
| Offer / Coupon Management | ✔ Full management | **Same.** Create/update offers, codes, validity, redemption tracking, category, trending. |
| Deflationary Burn Mechanics | ⚠ Described in docs | **Unchanged.** Document does not require implementation in app. |

### C. Discovery, Content & Social

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| **Venue Discovery Feed** | ⚠ Category + search; no map, no venue cards | **Implemented.** HomePage deal cards with “View venue”; `GET /offers` with `user_latitude`, `user_longitude`, `max_distance_km`. VenueMapPage at `/venues/map` (Leaflet); “View on map” from Home. |
| **Venue Detail Pages** | ✘ No rich venue profile | **Implemented.** `GET /partners/:id/venue-detail`; VenueDetailPage at `/venue/:id` (hero, about, hours, offers, menu gallery, map, reviews, tip/message/waitlist). |
| Dining / Experience Preference Algorithm | ✘ Not present | **Implemented as “Recommendation engine”.** `GET /recommendations/offers`; “Recommended for you” on Home when logged in. |
| **Event Discovery** | ⚠ Events category; no calendar | **Implemented.** EventsPage (`/events`), EventDetailPage (`/events/:id`); “View all events” from Home. |
| **In-App Messaging** | ✘ Not present | **Implemented.** `conversationRoutes`; `GET/POST` conversations with partner; VenueDetailPage “Message venue” modal; Partner Console “Messages” section. |
| City-Level Content Feeds | ✘ Not present | **Not implemented.** Document Phase 2/3 does not prioritise this. |
| **Social Proof / Reviews** | ✘ Not present | **Implemented.** `GET/POST /partners/:id/reviews`; VenueDetailPage shows aggregate rating, review list, “Write a review” modal (rating, title, comment); verified visit badge. |

### D. Memberships, Subscriptions & Club

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| **Cross-Network Club (EZ Club)** | ✘ Not present | **Implemented.** Migration `2026-02-ez-club.sql` (`users.ez_club_member`, `ez_club_network_check_ins`, etc.); redemption updates count; Profile page shows EZ Club badge and progress. |
| **Subscription Passes** | ✘ Not present | **Implemented.** Migration `2026-02-subscription-prelaunch.sql`; `subscriptionPassController`, redeem at partner; MyPassesPage; Partner Console Scanner “Redeem pass”. |
| **Venue Pre-Launch / Founding** | ✘ Not present | **Implemented.** `prelaunchController`, `prelaunchRepository`; `GET/POST /prelaunch` and partner `/:id/prelaunch/*`; VenueDetailPage “Join waitlist” + “Founding member” badge. |
| House Accounts | ✘ Not present | **Not implemented.** Document lists as Blackbird feature; not in 19-feature list. |
| NFT Membership Cards | ⚠ Described but not live | **In scope only.** No implementation in codebase. |
| Priority / Guaranteed Reservations | ✘ Not present | **Not in 19-feature list.** Optional later. |

### E. Merchant-Side Tools

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| Merchant Dashboard | ✔ KPIs, rewards analytics | **Same.** Partner Console: orders, revenue, menu, rewards. |
| Order Management | ✔ Full order table | **Same.** Order table with customer, status, view/update. |
| Venue Profile Management | ✔ Basic info editable | **Same.** Name, email, phone, address, etc.; map preview and “Open in Google Maps” when lat/lon present; geo_verified badge. |
| Menu / Service Management | ✔ Services, menu images | **Same.** Add service, upload menu images. |
| Offers & Discounts Engine | ✔ Full; stronger than Blackbird | **Same.** Plus perk_type/perk_description (tangible perks). |
| QR Scanner (Venue-Side) | ✔ QR Scanner in console | **Same.** Validate vouchers; redeem pass. |
| **Guest CRM** | ✘ No clickable profiles, no notes | **Implemented.** Guests API + Partner Console Guests section, profile modal, add note. |
| **Restaurant-Configurable Perks** | ⚠ No per-venue tiers/experiential | **Implemented.** Per-venue tiers (Venue Tiers section); tangible perks on offers. |
| Customer Spending Intelligence | ⚠ Basic revenue/tier only | **Implemented.** Guest profile includes visit count, total spend, value score. |
| Analytics Dashboard | ⚠ Summary KPIs only | **Unchanged.** Dashboard KPIs; no separate deep analytics (not in 19-feature list). |
| **Merchant Messaging / Push** | ✘ Not present | **Implemented.** `campaignController` (list, create, update, send); Partner Console “Campaigns” section (title, body, segment, Send now). |
| POS Integration | ✘ Not present | **Out of scope.** Not in 19-feature list. |
| Pre-Launch / Founding | ✘ Not present | **Implemented.** See D above. |

### F. Employee & Staff Rewards

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| **Staff Check-In / Rewards** | ✘ Not present | **Implemented.** Migration `2026-02-staff-rewards.sql` (`partner_staff`, `staff_check_ins`); staffController; Partner Console “Staff Rewards” (add staff, list, record check-in, EZT credit). |
| Staff Cross-Venue Rewards | ✘ Not present | **Same.** Staff earn EZT; spending is cross-venue by design (token use at any partner). |
| Industry Pro Membership | ✘ Not present | **Not in 19-feature list.** |

### G. Payments & Tipping

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| **In-App Tipping** | ✘ Not present — planned | **Implemented.** `POST /partners/:id/tips`, `GET .../tips` (partner); VenueDetailPage “Tip venue” modal (presets + custom + notes). |
| In-App Bill Payment | N/A — excluded by design | N/A. |
| Bill Splitting / Token Purchase / Buyback | N/A — excluded | N/A. |

### H. Blockchain & Infrastructure

| Feature | Doc: Elizian today / gap | Current implementation |
|--------|---------------------------|------------------------|
| Dedicated L3 / $EZT on Base | ⚠ L2 only | **Unchanged.** Document says “L2 sufficient for now.” |
| Governance Token | ✘ Not present | **In scope (Phase 3 #18).** Not implemented. |
| On-Chain Customer Profiles | ⚠ Wallet identity; depth unclear | **Unchanged.** |
| Developer / API Platform | ✘ Not present | **In scope (Phase 3 #19).** Not implemented. |

---

## 2. Prioritised 19-feature build list vs current dev

| # | Feature (from document) | Phase | Document expectation | Current status |
|---|-------------------------|--------|------------------------|----------------|
| 1 | Rich Venue Discovery Feed | 1 | Map, venue cards, photos, perks, distance, geo-sort | **Done.** HomePage cards, “View venue”, VenueMapPage, offers API with lat/lon and max_distance_km. |
| 2 | Venue Detail Pages | 1 | Rich venue page: menu, hours, location, gallery, perks, CTA | **Done.** GET venue-detail; VenueDetailPage with hero, hours, map, offers, menu, reviews, tip, message, waitlist. |
| 3 | Guest CRM in Merchant Dashboard | 1 | Clickable guest profiles, visit history, spending, notes | **Done.** Guests API; Partner Console Guests section + profile modal + add note. |
| 4 | Per-Venue Experiential Perks | 1 | Free item, secret menu, priority access, etc. | **Done.** perk_type/perk_description on offers; display on cards and venue page; partner form. |
| 5 | Guest Value Score | 1 | Scoring algorithm; surface in dashboard | **Done.** Value score in guestRepository (visit count + spend); shown in guest profile. |
| 6 | Geo-Verified Check-In | 1 | Geo-fence on QR redemption | **Done.** Redemption body lat/lon; Haversine 500 m; geo_verified in redemption_audit. |
| 7 | In-App Messaging (Consumer ↔ Venue) | 2 | DMs for reservations, requests, dietary, events | **Done.** Conversations API; “Message venue” on VenueDetailPage; Partner Console Messages. |
| 8 | In-App Tipping | 2 | Tip via $EZT or payment | **Done.** Tips API; “Tip venue” modal on VenueDetailPage. |
| 9 | Social Proof & Reviews | 2 | Ratings, reviews on venue pages | **Done.** Reviews API; submit review; display on venue page; verified visit. |
| 10 | Subscription Passes | 2 | Curated passes; redeem via QR | **Done.** Pass products, claim by code; MyPassesPage; partner redeem in Scanner. |
| 11 | EZ Club | 2 | Cross-network tier; exclusive access | **Done.** Migration; redemption hook; profile/rewards API; Profile EZ Club badge. |
| 12 | Event Discovery & Curation | 2 | Events tab, calendar, event detail; venues create events | **Done.** EventsPage, EventDetailPage; list by date; events from offers. |
| 13 | Venue Pre-Launch / Founding Member | 2 | Join waitlist; perks when venue opens | **Done.** Prelaunch API; “Join waitlist” + “Founding member” on VenueDetailPage. |
| 14 | Merchant Messaging & Push | 2 | Push to guests/segments | **Done.** Campaigns API; Partner Console Campaigns (create, edit, send). |
| 15 | Staff / Employee Rewards | 3 | Staff check-in, earn $EZT | **Done.** Staff migration; APIs; Partner Console Staff section; EZT on check-in. |
| 16 | Preference-Based Recommendation Engine | 3 | Match venues from behaviour/preferences | **Done.** GET /recommendations/offers; “Recommended for you” on Home. |
| 17 | NFT Membership Cards (Per-Venue) | 3 | NFT per venue in wallet | **Implemented (in-app).** Digital collectible per venue: `user_venue_membership_cards`; awarded on first redemption; Profile "Venue membership cards"; tap to view venue. No blockchain. |
| 18 | Community Governance / Participation Token | 3 | $EZT-based influence on network decisions | **Implemented.** `governance_proposals`, `governance_votes`; vote weight from EZT balance; Governance page (list, create, vote, results). |
| 19 | Developer / API Platform | 3 | Open APIs for check-in, voucher, loyalty | **Implemented.** API keys (create/list/revoke) in Profile → Developer; public API `GET/POST /api/developer/v1/vouchers/validate?code=...` with `X-API-Key`. |

---

## 3. Remaining gaps and recommendations

### Implemented but worth verifying

- **Geo radius:** Document suggests 100 m possible; code uses 500 m. Consider making radius configurable or tightening to 100 m if product requires.
- **Referral rewards:** Backend exists; confirm consumer-facing referral flow and $EZT credit visibility.
- **Cross-venue $EZT:** No technical barrier; confirm copy and UX state “usable at any partner”.

### Implemented (Phase 3 #17–#19)

- **#17 NFT Membership Cards:** In-app digital collectible per venue; awarded on first redemption; displayed in Profile ("Venue membership cards"); tap to view venue. No blockchain.
- **#18 Community Governance:** Proposals and votes; vote weight from EZT balance; Governance page (list, create, vote, results).
- **#19 Developer / API Platform:** API keys (create/list/revoke from Profile → Developer); public API `GET/POST /api/developer/v1/vouchers/validate` with `X-API-Key`.

### Out of scope / by design (no gap)

- In-app bill payments, token sales, NFC pucks (for now), proprietary L3 (document says not to copy).

### Optional enhancements (document “Where Elizian has the edge”)

- Multi-vertical and multi-geography are product/positioning; no code gap.
- Ensure venue discovery and offers clearly support multiple categories and, if applicable, region/city filters.

---

## 4. Reference: key codebase locations

| Feature | Backend | Frontend |
|---------|---------|----------|
| Venue detail | `partnerController.getVenueDetail`, `partnerService.getVenueDetail`, `partnerRepository` | `VenueDetailPage.jsx`, route `/venue/:id` |
| Geo redemption | `redemptionController`, `enhancedRedemptionService` (haversine, geo_verified) | Partner Scanner sends lat/lon (if available) |
| Guest CRM | `guestController`, `guestRepository` | `PartnerConsole.jsx` (Guests section) |
| Per-venue tiers | `venueTierController`, `venueTierRepository` | `PartnerConsole.jsx` (Venue Tiers) |
| Tangible perks | `partner_offers.perk_type`, `perk_description` | HomePage, VenueDetailPage, PartnerConsole offer form |
| Tips | `tipController`, `tipService` | VenueDetailPage “Tip venue” modal |
| Reviews | `reviewController`, `reviewService` | VenueDetailPage reviews + “Write a review” |
| Messaging | `messagingController`, `conversationRoutes` | VenueDetailPage “Message venue”, PartnerConsole Messages |
| Subscription passes | `subscriptionPassController`, redeem in partnerRoutes | MyPassesPage, PartnerConsole Scanner |
| EZ Club | `2026-02-ez-club.sql`, `enhancedRedemptionService`, rewardsService | Profile.jsx (badge) |
| Events | `eventController`, offers/events | EventsPage, EventDetailPage |
| Prelaunch | `prelaunchController`, `prelaunchRepository` | VenueDetailPage waitlist + Founding member badge |
| Campaigns | `campaignController`, `campaignService` | PartnerConsole Campaigns section |
| Staff rewards | `staffController`, `2026-02-staff-rewards.sql` | PartnerConsole Staff Rewards section |
| Recommendations | `recommendationController`, `recommendationService` | HomePage “Recommended for you” |
| Venue map / discovery | `partnerService.listPartners` (lat/lon sort), offers with distance | VenueMapPage, HomePage “View on map”, deal cards |

---

## 5. Summary table (current dev vs document)

| Metric | Count |
|--------|--------|
| 19-feature list: **Implemented** | 19 |
| 19-feature list: **In scope only** | 0 |
| Document “✘ Missing” items that are now **implemented** | Geo check-in, Venue detail, Guest CRM, Guest value score, Per-venue tiers, Tangible perks, Messaging, Tipping, Reviews, Subscription passes, EZ Club, Event discovery, Pre-launch, Merchant campaigns, Staff rewards, Recommendations |
| Document “N/A” or “not copy” | Bill payment, token sales, NFC puck, L3 — no gap. |

**Conclusion:** Current development is well aligned with *Elizian_vs_Blackbird_Feature_Gap_v2.docx*. The main remaining work from the document is Phase 3 features #17–#19 (NFT membership cards, community governance, developer platform); the rest of the prioritised list is implemented in the codebase.
