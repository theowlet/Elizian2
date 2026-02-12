# Why existing deals are not visible

Deals (partner offers) show on the **Home** and **Events** pages only when the public API returns them. The API filters out offers that don’t meet these conditions.

---

## Requirements for a deal to appear

1. **Partner**
   - `partners.is_active = true`
   - `partners.status` is one of: `'active'`, `'approved'`, or `NULL` (if the column exists).

2. **Offer**
   - Offer is active: either `partner_offers.status = 'active'` **or** `partner_offers.is_active = true` (depending on schema).
   - Not expired: `partner_offers.end_date` is `NULL` **or** `end_date >= current time`.

If any of these fail, the offer is excluded from the public list.

---

## How to check in the database

Run against your Postgres DB (e.g. `psql` or a GUI):

```sql
-- Partners that are active and approved
SELECT id, name, is_active, status
FROM partners
WHERE is_active = true
  AND (status IS NULL OR status IN ('active', 'approved'));

-- Offers that would be visible (active + not expired)
SELECT po.id, po.title, po.status, po.is_active, po.end_date, p.name AS partner_name, p.is_active AS partner_active, p.status AS partner_status
FROM partner_offers po
JOIN partners p ON po.partner_id = p.id
WHERE p.is_active = true
  AND (p.status IS NULL OR p.status IN ('active', 'approved'))
  AND (po.status = 'active' OR po.is_active = true)
  AND (po.end_date IS NULL OR po.end_date >= CURRENT_TIMESTAMP);
```

- If the first query returns no rows, no partners are eligible; fix `partners.is_active` and `partners.status`.
- If the second query returns no rows (or fewer than expected), fix:
  - `partner_offers.status` or `partner_offers.is_active`, and/or
  - `partner_offers.end_date` (set to `NULL` or a future date).

---

## Quick fixes

| Issue | Fix |
|--------|-----|
| Partner not approved | Set `partners.status = 'active'` or `'approved'` and `partners.is_active = true`. |
| Offer inactive | Set `partner_offers.status = 'active'` or `partner_offers.is_active = true`. |
| Offer expired | Set `partner_offers.end_date = NULL` or to a future timestamp. |

Example (use your own IDs):

```sql
UPDATE partners SET is_active = true, status = 'active' WHERE id = '<partner-uuid>';
UPDATE partner_offers SET status = 'active', end_date = NULL WHERE id = '<offer-uuid>';
```

---

## API and frontend

- **Endpoint:** `GET /api/v1/offers?limit=100&is_active=true`
- **Frontend:** `HomePage.jsx` loads from this endpoint; if the API returns an empty array, the UI shows “No deals available”. The app now treats non-array `data` safely and logs a console warning.

**Debug – include expired:** Call the API with `?include_expired=true` (e.g. `GET /api/v1/offers?limit=100&is_active=true&include_expired=true`). If deals appear, they were excluded by expiry; set `end_date` to `NULL` or a future date in the DB.

If you run the SQL above and see rows but the app still shows no deals, check the browser Network tab: confirm the request to `/api/v1/offers` returns 200 and `data` as an array with those offers.
