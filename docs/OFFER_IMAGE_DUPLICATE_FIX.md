# Why Two Deals Show the Same (Wrong) Image

## What you see

Two different experiences (e.g. **Holi Milan** and **All year around Cafe access**) show the **same** image (e.g. the same massage/placeholder) instead of their own images.

## Root cause

- Offer images come from `partner_offers.image_url` in the database.
- When `image_url` is **null or empty** for an offer, the backend uses a **single shared fallback URL** (`FALLBACK_IMAGE_URL` in `backend/src/utils/offerImageUrl.js` — same Unsplash image for every offer without an image).
- So if **both** Holi Milan and All year around Cafe access have **no image_url** in the DB, the API returns the **same** fallback URL for both → the UI shows the same image for both.
- “Disappearance” of the correct images can be because:
  1. **DB never had images** for these offers (never uploaded or upload failed).
  2. **DB was cleared** (e.g. a migration or script set `image_url` to null).
  3. **Stored URLs became invalid** (e.g. S3 key changed, file deleted, or path no longer served). The app then falls back to the shared placeholder (and frontend `onError` can also replace failed loads with the same default).

## How to confirm

From the **backend** directory run:

```bash
node scripts/inspect-offer-by-name.js --title "Holi Milan"
node scripts/inspect-offer-by-name.js --title "All year around"
```

Check the printed `image_url` for each offer. If you see `(null)` or empty for both, that explains the duplicate image.

## How to fix

1. **Restore correct images**
   - Have partners re-upload images in Partner Console for those offers, **or**
   - Restore `image_url` from a DB backup if it was overwritten, **or**
   - Fix serving (S3/local) so existing `image_url` values load (then no fallback for those).

2. **Optional: distinct placeholders**
   - To avoid every “no image” offer looking identical, you could use a **per-offer** placeholder (e.g. different default image or one derived from `offer.id` / title). That would only change the placeholder; the real fix is having correct `image_url` in the DB or working URLs.

## Code references

- Backend fallback: `backend/src/utils/offerImageUrl.js` — `resolveOfferImageUrl`, `ensureOffersHaveImageUrl`, `FALLBACK_IMAGE_URL`.
- Backend list: `offerRepository.listPublicOffers` → `normalizeOffers` → `ensureOffersHaveImageUrl`; each offer gets its own `image_url` or the same fallback when null.
- Frontend: `frontend/src/utils/dealImage.js` — `getDealImageUrl`; `HomePage.jsx` uses it per card and `onError` sets `DEFAULT_DEAL_IMAGE_URL` when the image fails to load.
