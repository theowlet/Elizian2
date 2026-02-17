# Full Codebase Review — Elizian2

**Scope:** Entire folder (backend + frontend). This doc covers app-wide concerns, auth, config, DB, frontend, and security. For **operating hours, slot booking, waitlist, and booking flow** see **`backend/CODE_REVIEW_OPERATING_HOURS_BOOKING.md`**.

---

## 1. Repository layout

| Area | Location | Notes |
|------|----------|--------|
| Backend | `backend/` | Express app, `src/` (routes, controllers, services, repos, utils, config), `middleware/`, `config/`, `db/`, `scripts/` |
| Frontend | `frontend/` | Vite + React; `src/` (pages, components, api), `public/js/` (legacy scripts, features, core) |
| Migrations | `backend/db/migrations/`, `backend/db/*.sql` | 2026-02-* and older; `missing_tables.sql` used by init |

**Dual roots:** Some code lives under `backend/utils/` and `backend/controllers/` (e.g. `authController.js`, `utils/jwt.js`) and some under `backend/src/`. Require paths mix `../utils/`, `../../utils/`, `../config/env` — ensure imports resolve to the intended file (see JWT below).

---

## 2. Auth & JWT

### Strengths
- **User auth:** `middleware/authenticateToken.js` uses Bearer token, sets `req.userId`, `req.user`, `req.userRole`; optional `req.partnerId` and `req.authType` from payload. 401/403 returned clearly.
- **API key auth:** `authenticateApiKey.js` hashes key (SHA-256), compares to stored hash, prefix lookup for performance; records usage. Used for developer API.
- **Auth routes:** OTP rate-limited; login/register use validation middleware; M-PIN and profile behind authenticateToken.
- **Production:** `env.js` fails start if `JWT_SECRET` is default in production; `validateEnvironment.js` enforces JWT_SECRET length and production default check.

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Two JWT modules:** `backend/utils/jwt.js` (uses `../src/config/env`) and `backend/src/utils/jwt.js` (uses `../config/env`). `authenticateToken` (in `middleware/`) requires `../utils/jwt` → backend/utils. Partner/service code may use `../../utils/jwt` or `../utils/jwt` (src). | Low | Standardize on one JWT module (e.g. `src/utils/jwt.js`) and update all requires (middleware, authController, partnerService, etc.) to use it. Remove or deprecate `backend/utils/jwt.js`. |
| 2 | **Partner scope:** `/me` partner routes rely on `req.partnerId` from JWT. Ensure login/issue flow for partners sets `partnerId` (and optionally `type: 'partner'`) in the token payload so partner console is correctly scoped. | Low | Verify partner auth (e.g. `partnerController.login`) issues tokens with `userId` and `partnerId` and that middleware sets `req.partnerId`. |
| 3 | **requireSuperAdmin:** Uses `getUserRoleById(req.userId)`; assumes `authenticateToken` ran first. Admin routes must mount auth before requireSuperAdmin. | Low | Document or add a small wrapper that ensures `req.userId` exists; avoid calling requireSuperAdmin on routes that don’t use authenticateToken. |

---

## 3. Database (config/db.js)

### Strengths
- Pool creation with config (max, idle timeout, connection timeout); UTC set on connect; error handler on pool.
- Init: `missing_tables.sql`, offers, menu, accounts, partners patch, orders; most use IF NOT EXISTS / DO $$ for migrations.
- Server continues if some inits fail (log and don’t throw in places).

### Issues & recommendations

| # | Issue | Severity | Recommendation |
|---|--------|----------|----------------|
| 1 | **Duplicate `initAccountsTable`:** Defined twice (lines ~216 and ~255). Second definition includes `partner_id` and CHECK constraint; first does not. `initializeAllTables()` calls `initAccountsTable()` twice. | Medium | Remove the first (simpler) `initAccountsTable` definition and keep the one with `partner_id` and user_or_partner constraint. Call `initAccountsTable` once in `initializeAllTables`. |
| 2 | **module.exports:** Exports `initAccountsTable` twice (same name). Harmless but confusing. | Low | Export once after removing the duplicate function. |
| 3 | **SSL:** `ssl: false` is hardcoded in both connection branches. For production over TLS, enable from config (e.g. `config.database.ssl`). | Low | Use `ssl: config.database.ssl || false` (or similar) when connecting to managed Postgres. |

---

## 4. Config & environment

### validateEnvironment.js
- Validates DATABASE_URL or DB_* vars, JWT_SECRET (length, default value), PORT, DB_PORT, NODE_ENV, FRONTEND_URL/ADMIN_URL format. Exits on errors; logs warnings.
- **Issue:** Line 6 contains `console.error("data url", process.env.DATABASE_URL)` — **leaks DATABASE_URL** (or shows “undefined”) and is debug leftover. **Remove this line.**

### env.js
- Loads dotenv (path configurable); CORS, DB, Redis, security (JWT, OTP). Production refuses to start if JWT_SECRET is default. No issues found beyond the above.

---

## 5. Frontend

### Structure
- **React (Vite):** `src/App.jsx`, `src/pages/*`, `src/components/*`, `src/api/axios.jsx`. Routing with React Router; protected routes use token + expiry check; `elizian-logout` and storage events for cross-tab logout.
- **Legacy:** `public/js/` — core (config, auth, api, storage), features (rewards, events, restaurants, payments, etc.), UI components. Likely used by some legacy pages or admin; mixed with `src/` usage.

### axios (src/api/axios.jsx)
- Base URL: `VITE_API_BASE_URL || 'http://localhost:3000/api/v1'`. Attaches Bearer from localStorage. On 401, clears token/user and redirects to `/login`. Good.
- **Inconsistency:** `App.jsx` sets `window.MY_GLOBAL_CONFIG.apiUrl = import.meta.env.VITE_API_URL` (no “BASE”). If any code uses `VITE_API_URL`, ensure it’s set in env or align with `VITE_API_BASE_URL`.

### API surface
- Booking, partners (operating hours, waitlist), auth, rewards, notifications, etc. use the same axios instance or fetch with same base; 401 handling is centralized in the interceptor.

### Recommendations
- Prefer a single env var for API base (e.g. `VITE_API_BASE_URL`) and use it everywhere (axios baseURL and any `MY_GLOBAL_CONFIG`).
- Gradually migrate `public/js` usage to `src/` and shared api/axios to avoid two parallel stacks.

---

## 6. Security (high level)

| Topic | Status | Notes |
|-------|--------|--------|
| **SQL injection** | ✅ Parameterized queries in reviewed repos (e.g. bookingRepository, partnerRepository) — `$1, $2` with array params. No raw concatenation of user input into SQL found. | Continue to use parameterized queries everywhere. |
| **Secrets** | ✅ JWT_SECRET validated; no hardcoded secrets in code. | Remove `console.error` with DATABASE_URL in validateEnvironment. |
| **CORS** | ✅ Configurable origins; production can restrict; dev allows multiple localhost ports. | — |
| **Rate limiting** | ✅ API limiter (skip in dev/localhost); OTP limiter stricter. RATE_LIMIT_DISABLED for dev. | — |
| **Helmet** | ⚠️ CSP disabled (legacy inline scripts). | Re-enable after CSP audit and fixing inline scripts. |
| **File upload (partner)** | ✅ Multer with type check (image/), size limit (5MB), destination under uploads/menu. Filename uses `req.params.id` — ensure `id` is validated (UUID) to avoid path traversal. | Validate partner `id` is UUID before using in path. |
| **Auth on sensitive routes** | ✅ Booking create/list/get/update use authenticateToken; partner /me routes use it; admin uses requireSuperAdmin after auth. | — |

---

## 7. Routes and verticals (recap)

- **30+ route modules** under `/api/v1/*`: auth, loyalty, theatre, rewards, account, bookings, redemptions, vouchers, partners, conversations, passes, prelaunch, events, tickets, admin, user, categories, offers/deals, services, tiers, bank offers, reservations, pre-orders, notifications, achievements, referrals, recommendations, developer, governance, settings, NFC. Partner routes include operating-hours and waitlist; booking is shared across verticals.
- **Partner auth:** JWT with `partnerId` for /me; URL `:id` for partner-scoped resources. Ensure partner can only access their own resource when using `:id` (controller checks `partnerId === id` or super_admin).

---

## 8. Migrations and DB scripts

- **Migrations:** `backend/db/migrations/` — 2025-*, 2026-02-* (enterprise booking, partner hours breaks, operating hours waitlist, tier, messaging, etc.). Many use IF NOT EXISTS / additive changes.
- **Legacy:** `missing_tables.sql`, `elizian_schema.sql`, and other standalone SQL files in `backend/db/`. `initializeAllTables()` runs `missing_tables.sql` only; other migrations are run separately (e.g. scripts or manual).
- **Recommendation:** Document which migrations are required and in what order for a fresh deploy; consider a single migration runner that runs `migrations/*.sql` in order.

---

## 9. Logging and error handling

- **Logger:** `backend/utils/logger.js` (or `src/utils/logger`) used across services/controllers. Central error handler in `middleware/errorHandler.js`: statusCode, message, details, requestId; 500s logged with stack. No leakage of internals in response.
- **Consistency:** Prefer a single logger module and use it everywhere (some requires point to `../utils/logger`, others to `../../utils/logger` depending on file location).

---

## 10. Summary and priority fixes

| Priority | Item | Action |
|----------|------|--------|
| **High** | Remove DATABASE_URL from logs | Delete `console.error("data url", process.env.DATABASE_URL)` in `config/validateEnvironment.js`. |
| **Medium** | Duplicate initAccountsTable in db.js | Keep one `initAccountsTable` (with partner_id + constraint); remove the other; call once in `initializeAllTables`. |
| **Low** | JWT single module | Use one JWT file (e.g. `src/utils/jwt.js`) and update all requires. |
| **Low** | Frontend API URL env | Use one env var (e.g. VITE_API_BASE_URL) for API base everywhere. |
| **Low** | CSP | Re-enable Helmet CSP after removing/fixing inline scripts. |
| **Low** | Partner upload path | Validate partner `id` (UUID) before using in multer filename/path. |

---

## 11. Reference to detailed review

For **operating hours, multiple breaks, slot capacity, booking validation, booking service (reservation path), waitlist, operating hours controller, OperatingHoursManager (frontend), and related migrations**, see:

**`backend/CODE_REVIEW_OPERATING_HOURS_BOOKING.md`**

That document includes app-wide bootstrap, cross-vertical usage, and release-on-rollback implementation.

---

**Conclusion:** The codebase is structured for a multi-vertical product with shared auth, booking, and partner features. The main issues are a debug leak in validateEnvironment, duplicate DB init logic in db.js, and minor consolidation (JWT, frontend API URL). Security posture is good (parameterized SQL, env-based secrets, rate limiting, auth on sensitive routes).
