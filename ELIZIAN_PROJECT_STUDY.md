# Elizian Project – Deep Study

A structured overview of the Elizian codebase: architecture, backend, frontend, data flows, and conventions.

---

## 1. Project overview

- **Product:** Multi-vertical loyalty and discovery platform (dining, events, healthcare, spa, wellness, travel). Consumer app for discovery and bookings; partner console (EZNet) for venues; admin for platform control.
- **Stack:** Backend: Node.js, Express 5, PostgreSQL. Frontend: React 18, Vite 6, React Router 7. Optional: Redis, Socket.IO, AWS S3, Twilio, Capacitor (Android).
- **Repo layout:** Monorepo with `backend/` and `frontend/`. Backend has a legacy layer (`backend/routes/`, `backend/middleware/`, `backend/controllers/`) and a modular layer (`backend/src/`). Frontend has Vite/React in `frontend/src/` and legacy HTML/JS in `frontend/public/`.

---

## 2. Backend architecture

### 2.1 Entry and bootstrap

- **Entry:** `backend/src/server.js` (default port **4000** from env; README sometimes says 5001).
- **App:** `backend/src/app.js` – Express app: CORS, helmet, morgan, body parsing, rate limit, static uploads, then routes, then error handler.
- **Startup:** Validates env, creates PG pool, optional Redis init, `initializeAllTables()` (db/config/db.js), creates upload dirs, starts booking auto-cancel and event cleanup cron jobs, then starts HTTP server. Optional WebSocket init after listen.
- **Static:** `/uploads` serves `backend/uploads/` (offers, menu, events, orders, vouchers). `/assets` can serve `frontend/public/assets` if present.

### 2.2 Route mounting (app.js)

| Prefix | Source | Notes |
|--------|--------|------|
| `/api/v1/auth` | `backend/routes/authRoutes.js` | OTP, register, login, profile, M-PIN |
| `/api/v1/loyalty` | `backend/routes/loyaltyRoutes.js` | Loyalty engine |
| `/api/v1/theatre` | `backend/routes/theatreRoutes.js` | Theatre/shows |
| `/api/v1/rewards` | `backend/src/routes/rewardsRoutes.js` | Rewards |
| `/api/v1/account` | accountRoutes | Account deletion, preferences |
| `/api/v1/bookings` | bookingRoutes + voucherRoutes.bookingVoucherRouter | Bookings + create voucher for booking |
| `/api/v1/redemptions` | redemptionRoutes | Enhanced voucher redemption (POST /redeem) |
| `/api/v1/vouchers` | voucherRoutes | Get voucher, redeem (partner) |
| `/api/v1/partners` | partnerRoutes + voucherRoutes.partnerVoucherRouter | Partners, venue-detail, guests, vouchers list |
| `/api/v1/events` | eventRoutes | Events CRUD, taxonomy, tickets |
| `/api/v1/admin` | adminRoutes | Admin: partners, offers, redemptions, feature requests, etc. |
| `/api/v1/user` | userRoutes | User APIs |
| `/api/v1/categories` | categoryRoutes | Categories |
| `/api/v1/offers`, `/api/v1/deals` | offerRoutes | Public offers list, availability |
| `/api/v1/notifications` | notificationRoutes | In-app notifications |
| `/api/v1/achievements` | achievementRoutes | Gamification |
| `/api/v1/referrals` | referralRoutes | Referral program |
| `/api/v1/settings` | systemSettingsRoutes | System settings |
| Plus: tierRoutes, bankOfferRoutes, reservationRoutes, preOrderRoutes, ticketRoutes, serviceRoutes (various prefixes) |

### 2.3 Two route/middleware roots

- **Legacy root:** `backend/routes/` (auth, loyalty, theatre), `backend/middleware/` (authenticateToken, validation, rateLimiters), `backend/controllers/authController.js`. Used by auth and a few high-level routes.
- **Modular root:** `backend/src/routes/`, `backend/src/controllers/`, `backend/src/services/`, `backend/src/repositories/`, `backend/src/middleware/` (rateLimiter, requireSuperAdmin), `backend/src/utils/`. Most features live here.
- **Auth middleware:** `backend/middleware/authenticateToken.js` – reads `Authorization: Bearer <token>`, verifies JWT, sets `req.userId` and `req.userRole`. Does **not** set `req.partnerId` when token has `type: 'partner'` and `partnerId`; partner flows that need `req.partnerId` use `req.partnerId || req.userId` (e.g. redemptionController), so partner identity may rely on URL `:id` or future middleware setting `decoded.partnerId` → `req.partnerId`.

### 2.4 Authentication flows

- **Consumer:**  
  - OTP: POST `/api/v1/auth/send-otp`, POST `/api/v1/auth/verify-otp`.  
  - Register: POST `/api/v1/auth/register`.  
  - Login: POST `/api/v1/auth/login` (email + password).  
  - JWT payload includes `userId`, `role`; stored in localStorage as `token`.  
  - M-PIN: set/verify/reset under `/api/v1/auth/` (set-mpin, verify-mpin, etc.).
- **Partner:**  
  - Login: POST `/api/v1/partners/auth/login` (email, password).  
  - Response: `token` (JWT with `partnerId`, `email`, `type: 'partner'`), `partner` object.  
  - Frontend stores `partnerToken`; partner console uses it for API calls.  
  - Some partner endpoints use URL `:id` as partner id (e.g. dashboard, guests).
- **Admin:**  
  - Login via legacy admin UI; token stored as `adminToken` or `token`.  
  - Admin routes sit under `/api/v1/admin` and use `authenticateToken` + role/super-admin checks.

---

## 3. Core data and domain

### 3.1 Main entities

- **users** – Consumer accounts (phone, email, name, tier, tokens, spend). Linked to `user_auth_credentials`, `otp_sessions`, tier progress.
- **partners** – Venues (name, category, address, lat/long, menu_images, status, approval). Linked to categories, partner_offers, partner_auth.
- **categories** – e.g. Dining, Events, Healthcare, Spa, Wellness, Travel, Others (slug used in APIs).
- **partner_offers** – Deals/offers (title, pricing, service_type, dates, is_trending, status, perk_type/perk_description from gap migration).
- **bookings** – Created for event, offer, or show. Has user_id, deal_id/offer_id, partner_id (derived), status, voucher_code, voucher_state, total_price, fiat_amount, booking_reference, etc.
- **voucher lifecycle** – State machine: created → booked → active → redeemed → settled/disputed → closed (and cancelled/expired). Stored as `voucher_state` on bookings; `voucher_state_transitions` and `redemption_audit` for audit trail.
- **redemption_audit** – One row per redemption: booking_id, voucher_code, partner, financials, redeemed_at, settlement_status, optional geo (redemption_latitude, redemption_longitude, geo_verified).
- **loyalty_tiers** – Platform tiers (e.g. Aether, Nova, Luminar, Valiant, Echelon). Users have current_tier_id, annual_spend_current, tier_name; tierService + tierRepository drive upgrades and EZT rewards.
- **notifications** – In-app (and optional email/SMS/push) via notificationService; table stores user_id, type, title, message, action_url, etc.
- **events** – Event taxonomy and event records; separate from partner_offers but can be linked to partners/venues.

### 3.2 Booking → voucher → redemption flow

1. **Create booking:** POST `/api/v1/bookings` with `offer_id` (or event_id/show_id), `num_tickets`, `special_requests`, optional `ezt_to_redeem`, `reservation_data`, `pre_order_data`, `booking_date`, `booking_time`.  
   - bookingService creates booking, sets voucher_state (e.g. booked), generates voucher_code, can generate QR (S3 or data URL), updates offer redemption count, applies bank offers/reservations/pre-orders, tier/EZT at redemption time.
2. **Create voucher (QR):** POST `/api/v1/bookings/:bookingId/vouchers` – generates voucher/QR for the booking.
3. **Redeem at venue:** POST `/api/v1/redemptions/redeem` with body: voucher_code, total_bill_amount, ezt_co_pay_amount, net_amount_from_user, redemption_notes, optional redemption_latitude, redemption_longitude.  
   - enhancedRedemptionService: validates booking and voucher state, applies redemption rules (time windows, blackout dates), writes redemption_audit, updates booking status to redeemed, can run tier/EZT and loyalty points, sends notifications.  
   - Geo: if lat/lon provided, distance to partner is computed; within 500 m sets geo_verified on redemption_audit.

### 3.3 Database and migrations

- **Schema base:** `backend/db/elizian_schema.sql` – users, tiers, categories, partners, partner_offers, partner_images, partner_hours, check_ins, transactions, token_ledger, referrals, bookings-related, etc.
- **Patches / init:** `backend/src/config/db.js` – `initializeAllTables()` runs logic to ensure partner_offers and other tables/columns exist; can run `missing_tables.sql` and other one-off patches.
- **Migrations:** `backend/db/migrations/` – voucher/redemption, partner status, offer status, GST, menu images, gap-analysis features (venue_reviews, partner_guest_notes, partner_venue_tiers, tips, redemption geo, partner_notification_campaigns, etc.). Run migrations manually (e.g. `psql -f ...`) as needed.

---

## 4. Frontend architecture

### 4.1 Build and serve

- **Dev:** `frontend/package.json` – `npm run dev` runs Vite (port **8080**).  
- **Build:** `vite build` → `frontend/dist/`.  
- **Config:** `frontend/vite.config.js` – React plugin, base `/`, publicDir `public`, alias `@` → `src`.

### 4.2 React app (src/)

- **Entry:** `frontend/src/index.jsx` → `App.jsx` with `BrowserRouter`.
- **Routes (App.jsx):**  
  - Public: `/`, `/login`, `/otp`, `/signup`, `/mpin-setup`, `/mpin-login`.  
  - Protected (consumer): `/home`, `/profile`, `/privacy_policy`, `/bookings`, `/booking/:id`, `/booking/:id/reschedule`, `/events/booking`, `/wellness`, `/health-wellness`, `/data-entry`.  
  - Public venue: `/venue/:id` (VenueDetailPage).  
  - Partner: `/partner/login`, `/partner/console` (protected by partnerToken).  
  - Admin: `/admin/login`, `/admin`, `/admin/multi-tier` (protected by adminToken/token).  
- **Auth:** `ProtectedRoute` checks localStorage `token` (and expiry); optional `requirePartner` (partnerToken), `requireAdmin` (adminToken or token). No global auth context; token and user object in localStorage.
- **API base:** `import.meta.env.VITE_API_BASE_URL` (fallback e.g. `http://localhost:4000`). Requests use `Authorization: Bearer ${token}` where needed.

### 4.3 Main consumer pages

- **LandingPage** – Entry; links to login/signup.
- **LoginPage / OTPScreen / SignupPage** – Email/password or OTP flows; on success store token and user, redirect.
- **HomePage** – Discovery: category tabs, trending, “Top Restaurants Near You” (geo-sorted), live/upcoming events, “All Partner Deals”. Fetches from GET `/api/v1/offers?limit=100&is_active=true`. Deal cards: “View venue” (→ `/venue/:partnerId`) and “Book Now” (→ EventBooking with deal in state).
- **VenueDetailPage** – GET `/api/v1/partners/:id/venue-detail`; shows partner info, hours, reviews summary, active offers, menu gallery; “Book now” → EventBooking.
- **EventBooking** – Multi-step: selection (date, time, tickets, requests) → review → confirmation. Creates booking via POST `/api/v1/bookings`; then can create voucher (QR) via POST `/api/v1/bookings/:bookingId/vouchers`. Shows QR and booking details.
- **BookingHistory / BookingDetails / RescheduleBooking** – List and detail for user bookings.
- **Profile** – User profile and preferences.
- **WellnessPage / HealthWellnessPage** – Category-specific views.
- **DataEntry** – Protected data-entry UI.

### 4.4 Partner and admin UIs (legacy iframes)

- **OtherRoute.jsx** – Renders iframes to static HTML:  
  - Admin login: `src="/admin-login.html"`  
  - Admin dashboard: `src="/admin.html"`  
  - Partner login: `src="/partner-login.html"`  
  - Partner console: `src="/partner-console.html"`  
- These live under `frontend/public/` (admin.html, partner-console.html, partner-login.html, admin-login.html) and use their own JS (e.g. public/js/admin.jsx, adminRewards.jsx). They call the same backend APIs (partners, bookings, offers, redemptions, analytics, QR scanner, etc.) with partner or admin token.

---

## 5. Configuration and environment

- **Backend env:** `.env` (see `.env.example`): NODE_ENV, PORT (default 4000 in code), DB_*, JWT_SECRET, CORS_*, FRONTEND_URL, OTP_*, SMS/email placeholders. Optional: REDIS_URL, S3, Twilio, etc.
- **Frontend env:** Vite uses `VITE_*`; in code mainly `VITE_API_BASE_URL` (and `VITE_API_URL` in one place). Defaults to `http://localhost:4000` when unset.
- **CORS:** Backend allows multiple origins (localhost 8080/8081/3000/5173, or CORS_ALLOWED_ORIGINS). Credentials and common headers allowed; `/uploads` is more permissive.

---

## 6. Notable implementation details

- **Dual route roots:** Auth and a few routes in `backend/routes` and `backend/middleware`; everything else under `backend/src`. Be consistent with require paths (e.g. `../../middleware/authenticateToken` from `src/routes`).
- **Partner JWT vs req.partnerId:** Partner token carries `partnerId` and `type: 'partner'`. authenticateToken only sets `req.userId`/`req.userRole`; it does not set `req.partnerId`. Endpoints that need partner identity use `req.partnerId || req.userId` or the partner id from URL; consider setting `req.partnerId` from `decoded.partnerId` when `type === 'partner'` for clarity and security.
- **Booking vs offer:** Bookings reference offers via `deal_id` (and sometimes `offer_id` in code). Partner is derived from offer (partner_offers.partner_id) or event.
- **Voucher state machine:** Centralised in voucherStateMachine; transitions and booking.voucher_state drive what actions (e.g. redeem) are allowed. redemption_audit is append-only for financial and compliance.
- **Tier and EZT:** Tier upgrades and EZT rewards can be applied at redemption time (in enhancedRedemptionService), not only at booking time, so actual bill amount drives loyalty.
- **Guest CRM:** Implemented in backend (guestRepository, guestController): list guests per partner, guest profile with visit history and value score, add note. Partner console UI (e.g. “Guests” tab) can be wired to GET/POST `/api/v1/partners/:id/guests`.
- **Gap-analysis work:** Venue detail page, geo-verified redemption, guest CRM APIs, migration for reviews/tips/notifications/per-venue tiers/perks. See `GAP_ANALYSIS_IMPLEMENTATION.md`.

---

## 7. File and folder quick reference

```
Elizian2/
├── backend/
│   ├── src/
│   │   ├── app.js              # Express app, route mounting
│   │   ├── server.js           # Bootstrap, DB, cron, WebSocket, listen
│   │   ├── config/             # env, db (pool + init)
│   │   ├── routes/             # All modular API routes
│   │   ├── controllers/        # Request handlers
│   │   ├── services/          # Business logic (booking, voucher, redemption, tier, etc.)
│   │   ├── repositories/      # DB access (booking, offer, partner, user, guest, etc.)
│   │   ├── middleware/        # rateLimiter, requireSuperAdmin
│   │   ├── jobs/              # bookingAutoCancel, eventCleanup, voucher jobs
│   │   ├── utils/             # logger, response, realtimeEmitter, qrCodeGenerator, etc.
│   │   └── websocket/         # Optional Socket.IO
│   ├── routes/                # Legacy: auth, loyalty, theatre
│   ├── middleware/            # Legacy: authenticateToken, validation, rateLimiters
│   ├── controllers/           # Legacy: authController
│   ├── db/                    # elizian_schema.sql, missing_tables.sql, migrations/
│   └── utils/                 # jwt, logger, etc.
├── frontend/
│   ├── src/
│   │   ├── App.jsx            # Router, ProtectedRoute, all routes
│   │   ├── index.jsx
│   │   ├── pages/             # Landing, Login, Home, VenueDetail, EventBooking, Profile, etc.
│   │   ├── components/       # DealMenuPane, QRCodeModal, etc.
│   │   └── styles/
│   └── public/                # Static HTML (admin, partner), assets, js (legacy bundles)
├── .env.example
├── README.md
├── GAP_ANALYSIS_IMPLEMENTATION.md
└── ELIZIAN_PROJECT_STUDY.md   # This file
```

---

## 8. Running the project

- **Backend:** `cd backend && npm install && cp .env.example .env` (edit .env), ensure PostgreSQL is up and migrations/schema applied, then `npm start` (or `npm run dev` with nodemon). Listens on PORT (e.g. 4000).
- **Frontend:** `cd frontend && npm install && npm run dev`. Opens at http://localhost:8080. Set `VITE_API_BASE_URL` to backend URL if different.
- **Partner/Admin:** Use React routes `/partner/login`, `/partner/console`, `/admin/login`, `/admin`; they load legacy HTML in iframes from `frontend/public/`.

This document reflects the codebase as of the study; for gap-analysis feature status and next steps, see `GAP_ANALYSIS_IMPLEMENTATION.md`.
