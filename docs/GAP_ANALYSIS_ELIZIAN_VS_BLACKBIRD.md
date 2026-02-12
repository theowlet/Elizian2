# ELIZIAN – Feature Gap Analysis: Elizian vs. Blackbird

**Prepared February 2026** · Confidential  
**Constraints:** No in-app bill payments, no in-app token sales. In-app tipping in scope.

> **Implementation status:** See [GAP_ANALYSIS_IMPLEMENTATION.md](../GAP_ANALYSIS_IMPLEMENTATION.md) in the repo root for the 19-feature build list and current status.

---

## Executive Summary

Blackbird has evolved from a simple NFC check-in loyalty app into a full-stack commerce platform for restaurants: payments, discovery, messaging, membership clubs, employee rewards, and a proprietary L3 blockchain (Flynet). It operates in 6+ US cities with 1,000+ restaurants, $85M in funding, and 107,000+ wallets.

Elizian’s current app (elizian.in) is more built out than it appears at first glance. The consumer-facing side has category-based discovery (Dining, Events, Healthcare, Spa, Wellness, Travel) with search. The merchant-side Partner Console (EZNet) includes a functional dashboard with KPIs and rewards analytics, order management with customer tier badges, venue profile management, services/menu management with image uploads, a full offers & discounts engine with $EZT co-pay integration, and a QR Scanner for venue-side validation.

However, measured against global standards set by Blackbird and best-in-class loyalty platforms, Elizian has critical gaps in three areas: (1) **consumer-side richness** — the discovery experience lacks depth, venue detail pages, social proof, and personalisation; (2) **merchant-side intelligence** — there is no guest CRM, no per-guest value scoring, no messaging, and no per-venue loyalty customisation; and (3) **community & retention mechanics** — no membership clubs, subscription passes, staff rewards, or event curation.

This document maps every material feature, assesses Elizian’s verified current state based on live dashboard review, and recommends a prioritised build list.

---

## Design Constraints (Non-Negotiable)

1. **No in-app bill payments.** Elizian will not process bill payments through the app. Check-in, vouchers, rewards, and in-app tipping remain in scope.
2. **No in-app token sales.** $EZT will not be sold or purchased inside the app. Token distribution occurs via rewards, partner incentives, and external channels only.

---

## Feature-by-Feature Comparison

**Legend:** ✔ = Present | ⚠ = Partial | ✘ = Missing

### A. Check-In & Identity

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| NFC Puck Check-In | Proprietary NFC puck at host stand; tap phone to check in | Not present. QR Scanner built into partner console for venue-side validation | ✘ |
| In-App Check-In (Consumer) | Fallback check-in via app button | QR-based check-in. Merchant QR Scanner section confirmed in dashboard | ⚠ |
| Geo-Verified Check-In | Location-aware verification prevents fake check-ins | Not present. QR scan has no geo-fence layer | ✘ |
| Guest Profile / Identity | On-chain identity, dining history, preferences visible to merchant | Tier badges visible on orders (Nova, Aether). No clickable guest profile or preference history | ⚠ |
| Guest Value Score | Proprietary algorithm scoring diner lifetime value for restaurants | Average Customer Tier shown (dashboard). No per-guest scoring | ✘ |

### B. Rewards & Loyalty Mechanics

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Token Rewards on Check-In | Earn $FLY on every check-in | $EZT distribution tracked in dashboard. Mechanism exists | ✔ |
| Token Rewards on Referral | $FLY earned for referrals | $EZT earned for referrals (stated in one-pager) | ⚠ |
| Cross-Venue Token Spending | $FLY usable at any Blackbird restaurant | $EZT co-pay offers confirmed. Cross-venue use unclear | ⚠ |
| Platform-Level Status Tiers | 3X and 5X tiers based on check-ins + spending | Nova and Aether tiers visible on customer orders. Average Customer Tier in dashboard | ✔ |
| Per-Venue Custom Tiers | Each restaurant designs own tier names, perks, thresholds | Tiers are platform-level (Nova, Aether). No per-venue customisation | ✘ |
| Tangible Perks (free items, secret menus, priority access) | Core to the experience. Configured per venue | Offers & Discounts exist (% off, co-pay with $EZT). No venue-specific experiential perks | ⚠ |
| Offer / Coupon Management | Perks tied to loyalty tiers | Create offers with codes, %, validity, redemption tracking, category tags, trending badges | ✔ |
| Deflationary Burn Mechanics | 25 $FLY clip fee per transaction; treasury redistribution | $EZT platform fee burn described in docs | ⚠ |

### C. Discovery, Content & Social

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Venue Discovery Feed | Map + list of nearby restaurants, curated by city, with photos and perks | Category filter tabs + Search bar. No map view, no venue cards with photos/perks, no geo-sorting. "Trending Experiences" section empty | ⚠ |
| Venue Detail Pages | Rich profiles: menu, hours, perks, photos, reviews, membership options | Offers exist as listings but no rich venue profile pages visible | ✘ |
| Dining / Experience Preference Algorithm | Matching algorithm for dining vibe | Not present | ✘ |
| Event Discovery | Events, pop-ups, exclusive dinners surfaced in-app | "Events" category exists as filter tab. No dedicated events calendar or curation | ⚠ |
| In-App Messaging to Venues | DM restaurants directly | Not present | ✘ |
| City-Level Content Feeds | City-specific restaurant launches, editorial | Not present | ✘ |
| Social Proof / Reviews | Ratings, reviews, community buzz | Not present | ✘ |

### D. Memberships, Subscriptions & Club

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Cross-Network Club (Blackbird Club) | Tiered club: Rewards + Access + Amenities. 25–50 check-ins or $5K $FLY deposit | Not present | ✘ |
| Subscription Passes | Breakfast Club ($85/yr), Bar Blackbird (monthly). Off-peak traffic | Not present | ✘ |
| Per-Venue Founding Member Programs | Pre-launch house accounts (e.g. Gjelina raised $500K) | Not present | ✘ |
| House Accounts | $5K pre-funded accounts at individual restaurants | Not present | ✘ |
| NFT Membership Cards | Digital punch card / NFT unique to each restaurant | NFT membership utilities described but not live | ⚠ |
| Priority / Guaranteed Reservations | Blackbird Club members get guaranteed tables | Not present | ✘ |

### E. Merchant-Side Tools

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Merchant Dashboard (KPIs) | Revenue, orders, guest count, loyalty metrics | Total Orders, Today’s Orders, Total Revenue, Menu Items. Customer Rewards Analytics (EZT distributed, loyalty points, avg tier) | ✔ |
| Order Management | Orders visible with customer info and status | Full order table with Order ID, Customer name + phone, Items, Tickets, Total, Payment, Status, View/Update | ✔ |
| Venue Profile Management | Basic venue info editable | Venue Name, Email, Phone, GST Number, Address. Functional | ✔ |
| Menu / Service Management | Menu items, pricing, photos | Add New Service, Upload Menu Images. Services & Menu section | ✔ |
| Offers & Discounts Engine | Perks tier-based | Full offer management: coupon codes, % discounts, $EZT co-pay, validity, redemption tracking, category tagging, trending badges. Stronger than Blackbird’s approach | ✔ |
| QR Scanner (Venue-Side) | NFC puck reads customer phone | Dedicated QR Scanner section in partner console for validating check-ins/vouchers | ✔ |
| Guest CRM / Profiles | Full CRM: guest profiles, visit history, preferences, value score, notes | Customer names and tier on orders. No clickable guest profiles, no visit history, no notes | ✘ |
| Restaurant-Configurable Perks | Each venue sets own perks, tier names, thresholds | Offers allow venue-created promotions. No per-venue loyalty tier customisation or experiential perks | ⚠ |
| Customer Spending Intelligence | Spending patterns, LTV, frequency, cross-venue behaviour | Total Revenue and Average Customer Tier. No per-guest LTV, frequency, or cohort analytics | ⚠ |
| Analytics Dashboard | Trends, cohorts, retention curves, revenue by period | Analytics in nav. Dashboard shows summary KPIs only | ⚠ |
| Merchant Messaging / Push Notifications | Push, direct messages to guests or segments | Not present | ✘ |
| POS Integration | Integrates with Toast, Square, etc. | Not present. Orders EZNet-native only | ✘ |
| Pre-Launch / Founding Programs | Restaurants raise capital via pre-opening house accounts | Not present | ✘ |

### F. Employee & Staff Rewards

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Staff Check-In Puck | Purple puck for employees; earn $FLY by clocking in | Not present | ✘ |
| Staff Cross-Venue Rewards | Staff spend $FLY at other network restaurants | Not present | ✘ |
| Industry Pro Membership | Blackbird Club Pro: extra points, 20% off, 5x Mon/Tue | Not present | ✘ |

### G. Payments & Tipping

Bill payment and token sales are excluded from Elizian’s roadmap. **In-app tipping is in scope.**

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| In-App Tipping | Tip through the app during checkout | Not present — planned | ✘ |
| In-App Bill Payment | Pay with card, $FLY, or hybrid | Excluded by design | N/A |
| Bill Splitting | Split check via app | Excluded by design | N/A |
| In-App Token Purchase | Buy $FLY with card or USDC | Excluded by design | N/A |
| $FLY Buyback / Cash-Out | Exchange $FLY for USD at thresholds | Excluded by design | N/A |

### H. Blockchain & Infrastructure

| Feature | Blackbird | Elizian Today | Gap |
|--------|-----------|----------------|-----|
| Dedicated Blockchain Layer | Flynet: proprietary L3 on Base | $EZT on Base (L2), no proprietary L3 | ⚠ |
| Governance Token | $F2 token for network governance | No governance token | ✘ |
| On-Chain Customer Profiles | Profiles, history on-chain. Consumers own data | Wallet identity exists; on-chain profile depth unclear | ⚠ |
| Open Developer Platform | Developers can build on Flynet | Not present | ✘ |

---

## Prioritised Feature Build List (19 Features)

Ranked by impact on user retention, merchant value, and investor credibility. Respects design constraints (no payments, no token sales). Grouped into three phases.

### Phase 1: Pre-Launch Essentials (Before or concurrent with Q1–Q2 2026 launch)

1. **Rich Venue Discovery Feed (UPGRADE).** Upgrade from basic category tabs to rich venue cards with photos, perks preview, ratings, distance, and map view.
2. **Venue Detail Pages (NEW).** Build rich, standalone venue pages with menu, hours, location, gallery, perks, and booking/check-in CTA.
3. **Guest CRM in Merchant Dashboard (NEW).** Add clickable guest profiles with visit history, spending, preferences, and notes.
4. **Per-Venue Experiential Perks (UPGRADE).** Beyond % discounts: let venues configure experiential perks (free welcome drink, complimentary dessert, priority seating, secret menu access).
5. **Guest Value Score (NEW).** Proprietary scoring algorithm for merchants; surface in dashboard.
6. **Geo-Verified Check-In (NEW).** Geo-fencing on QR check-ins so users must be physically at the venue.

### Phase 2: Retention & Network Effects (Q2–Q4 2026, post-launch)

7. **In-App Messaging (Consumer ↔ Venue).** Consumers message venues for reservations, special requests, dietary needs, event queries.
8. **In-App Tipping.** Consumers tip venue staff via $EZT or linked payment method.
9. **Social Proof & Reviews.** Ratings, reviews, and social validation on venue pages.
10. **Subscription Passes.** Curated passes that drive off-peak traffic (e.g. Wellness Wednesday, Weeknight Dining Club).
11. **EZ Club (Cross-Network Loyalty Tier).** Tiered club rewarding most active network participants with exclusive access.
12. **Event Discovery & Curation.** Events tab, calendar, event detail pages; venues create events from dashboard.
13. **Venue Pre-Launch / Founding Member Programs.** Venues launch pre-opening membership programs with advance perks.
14. **Merchant Messaging & Push Notifications.** Merchant push to guests and segments (by tier, visit frequency, last-seen).

### Phase 3: Defensibility & Moat (Q4 2026–Q2 2027)

15. **Staff / Employee Rewards.** Reward staff for engagement—clocking in, adding preferences, cross-venue dining.
16. **Preference-Based Recommendation Engine.** Matching algorithm from past behaviour, preferences, and network patterns.
17. **NFT Membership Cards (Per-Venue).** NFT-based membership card per venue, visible in wallet, tradeable within ecosystem.
18. **Community Governance / Participation Token.** $EZT-based mechanism for active users to influence network decisions.
19. **Developer / API Platform.** Third-party developers can build on Elizian’s voucher, check-in, and loyalty infrastructure.

---

## What Elizian Does Not Need to Copy

- **In-app bill payments.** Out of scope; voucher + QR model achieves merchant settlement without processing consumer payments. Exception: tipping (lightweight, one-directional).
- **In-app token sales.** Would trigger securities scrutiny; distribution via rewards and merchant incentives is cleaner.
- **NFC pucks (for now).** QR is dominant in India/Dubai and more scalable.
- **Proprietary L3 blockchain.** $EZT on Base (L2) is sufficient for current volume; revisit when transaction volumes justify it.

---

## Where Elizian Already Has the Edge

- **Multi-vertical from day one.** Dining, wellness, entertainment, travel, hospitality → richer data and network effects.
- **Multi-geography.** India, Dubai, Hong Kong — premium consumer markets; cross-border $EZT interoperability as differentiator.
- **QR-native design.** Right technical choice for target markets; cheaper to deploy.
- **Token-offset fee model.** 2.5% effective fee (after token offset) gives merchants reason to hold and engage with $EZT.

---

*The gap is real but closable. Build the 19 features above, in order, and the product gap disappears within 12 months.*
