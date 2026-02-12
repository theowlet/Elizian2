# How to test Elizian

## 1. Prerequisites

- **Node.js** (v18+)
- **PostgreSQL** (running, with a database created)
- **Environment:** Copy `backend/.env.example` to `backend/.env` and set at least:
  - `DATABASE_URL` (e.g. `postgresql://user:password@localhost:5432/elizian`)
  - `JWT_SECRET` (long random string)
  - Optionally `PORT` (backend, default often 3000 or 5001)
- **Frontend API URL:** In `frontend/.env` or when running, set `VITE_API_BASE_URL` to your backend base URL (e.g. `http://localhost:5001` if backend runs on 5001).

## 2. Run database migrations

From the project root (or backend folder), run the migrations so all features have their tables:

```bash
# From project root (adjust if your backend lives elsewhere)
export DATABASE_URL="postgresql://user:password@localhost:5432/elizian"

# Gap analysis & newer features
psql "$DATABASE_URL" -f backend/db/migrations/2026-02-gap-analysis-features.sql
psql "$DATABASE_URL" -f backend/db/migrations/2026-02-in-app-messaging.sql
psql "$DATABASE_URL" -f backend/db/migrations/2026-02-subscription-prelaunch.sql
psql "$DATABASE_URL" -f backend/db/migrations/2026-02-ez-club.sql
psql "$DATABASE_URL" -f backend/db/migrations/2026-02-staff-rewards.sql
```

If you use a GUI (e.g. pgAdmin, DBeaver), open each `.sql` file and run it against your database.

## 3. Start backend and frontend

**Terminal 1 – Backend**

```bash
cd backend
npm install
npm run dev
# or: npm start
```

Note the port in the logs (e.g. `Listening on port 5001`).

**Terminal 2 – Frontend**

```bash
cd frontend
npm install
npm run dev
```

Vite will show the app URL (e.g. `http://localhost:5173`). Ensure the frontend is configured to call your backend: e.g. in `frontend/.env` set `VITE_API_BASE_URL=http://localhost:5001` (match your backend port).

## 4. What to test (manual)

### User app (consumer)

1. **Landing / Login / Signup**  
   Open the app URL, sign up or log in (OTP/M-PIN flow if enabled).

2. **Home & offers**  
   - Home should list deals/offers.  
   - “View on map” → opens `/venues/map` with venue markers; click a marker and “View venue”.

3. **Venue detail**  
   - From Home or map, open a venue (`/venue/:id`).  
   - Check: hero, hours, offers, reviews, “Write a review”, “Tip venue”, “Message venue”, “Join waitlist” / “Founding member” if implemented.

4. **Recommended for you**  
   - Log in and go to Home.  
   - If you have past bookings/redemptions, a “Recommended for you” section appears with offers from venues you’ve used; otherwise it may show trending offers.

5. **EZ Club**  
   - Log in, go to **Profile**.  
   - After 5+ redemptions (across any venue), you should see the “EZ Club member” badge and optional “Member since” date.  
   - Before that, you may see “Network check-ins: X” and text about qualifying at 5+ venues.

6. **Events**  
   - “View all events” → `/events`; open an event → `/events/:id`; book if implemented.

7. **My passes**  
   - Profile → “My passes” or `/passes`; claim a pass with a code if you have products/codes set up.

### Partner Console

1. **Login**  
   Use partner credentials and open the partner login URL (e.g. `/partner/login`).

2. **Staff Rewards**  
   - In the sidebar, open **Staff Rewards**.  
   - Add staff by **email** (user must already exist in `users`).  
   - In “Record check-in”, select a staff member, set EZT (default 10), submit.  
   - Check “Recent check-ins” and that the staff user’s EZT balance increases (e.g. in that user’s Profile if they use the consumer app).

3. **Other sections**  
   - **Guests:** List guests, open a guest, add a note.  
   - **Venue Tiers:** Add/Edit/Delete tiers.  
   - **Campaigns:** Create/send a campaign.  
   - **Messages:** Open conversations and reply.  
   - **QR Scanner:** Validate a voucher; redeem a subscription pass with a code.

## 5. Quick API checks (optional)

With backend running, you can sanity-check APIs (replace port and IDs as needed):

```bash
# Public – list partners (for map/venues)
curl -s "http://localhost:5001/api/v1/partners" | head -c 500

# Public – list offers
curl -s "http://localhost:5001/api/v1/offers?limit=5" | head -c 500

# Recommendations (requires user token)
curl -s -H "Authorization: Bearer YOUR_USER_JWT" "http://localhost:5001/api/v1/recommendations/offers" | head -c 500
```

Partner and user JWTs come from login/signup responses (e.g. `token` in the JSON).

## 6. Troubleshooting

- **CORS errors:** Ensure backend `FRONTEND_URL` or CORS config includes the frontend origin (e.g. `http://localhost:5173`).
- **401 on recommendations / profile:** User must be logged in; use the token from login in the `Authorization: Bearer <token>` header.
- **Staff add fails “User not found”:** The email must belong to an existing row in `users` (create via consumer signup first).
- **EZ Club not updating:** Run the EZ Club migration and ensure redemptions are recorded (partner redeems a voucher); EZ Club updates on each redemption.
- **Map empty:** Partners need `latitude` and `longitude` set in the database for markers to appear.
