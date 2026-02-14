# Fix "429 Too Many Requests" in local development

If you see **"Too many requests from this IP"** or **429** errors when using the Partner Console or sending messages:

1. Open **`backend/.env`** (create it from `.env.example` if needed).
2. Add or set:
   ```bash
   RATE_LIMIT_DISABLED=1
   ```
3. **Restart the backend** (stop and run `npm run dev` or `npm start` again).

After that, the global API rate limiter is turned off and 429s from the limiter should stop. Re-enable in production by removing this line or setting it to `0`.
