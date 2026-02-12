# Elizian – Port reference

Use this as the single source of truth for local development.

---

## Service ports (what runs where)

| Service              | Port | Where it's set / used |
|----------------------|------|------------------------|
| **Backend API**      | **3000** | `backend/.env`: `PORT=3000`. Code default in `backend/src/config/env.js` is 4000 if `PORT` is unset. |
| **Frontend (Vite)**  | **8080** | `frontend/vite.config.js`: `server.port: 8080` |
| **PostgreSQL**       | **5432** | `backend/.env`: `DB_PORT=5432` (or in `DATABASE_URL`) |

---

## Frontend → Backend (API base URL)

- Set **one** value in `frontend/.env`:
  - **Local:** `VITE_API_BASE_URL=http://localhost:3000` (matches `backend/.env` `PORT=3000`)
  - **Production:** `VITE_API_BASE_URL=https://elizian.in` (or your API domain)
- All auth and API calls should use this; various pages have fallbacks (3000, 4000, 5001) only when `VITE_API_BASE_URL` is not set.

---

## CORS (backend allowed origins)

Backend allows these origins by default (see `backend/src/config/env.js`):

- `http://localhost:8080` – main frontend (Vite)
- `http://localhost:8081`
- `http://localhost:3000`
- `http://localhost:4000`
- `http://localhost:5001`
- `http://localhost:5173` – Vite default when not using custom port
- `http://127.0.0.1:8080`
- `http://127.0.0.1:8081`
- `http://127.0.0.1:5173`

Override with: `CORS_ALLOWED_ORIGINS=http://localhost:8080,https://yourapp.com`

---

## Quick local checklist

1. **Backend:** `cd backend && npm run dev` (or start script) → listens on **3000** if `PORT=3000` in `.env`.
2. **Frontend:** `cd frontend && npm run dev` → dev server on **8080**.
3. **Frontend .env:** `VITE_API_BASE_URL=http://localhost:3000`.
4. **DB:** PostgreSQL on **5432** (local or remote per `DATABASE_URL` / `DB_*`).

---

## Summary table

| Role        | Port |
|------------|------|
| Backend API | 3000 |
| Frontend dev server | 8080 |
| PostgreSQL | 5432 |
