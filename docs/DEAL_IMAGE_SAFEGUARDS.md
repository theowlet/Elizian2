# Deal / Offer Image Safeguards

This doc describes how we prevent "missing images in All Partner Deals" (and similar) from recurring. **When adding or changing code that touches offer images, follow these rules.**

---

## 1. Backend: single source of truth

**File:** `backend/src/utils/offerImageUrl.js`

- **`resolveOfferImageUrl(imageUrlOrKey)`**  
  Call this whenever you need a display-ready image URL for an offer (list, get-by-id, etc.).  
  It:
  - Uses S3 URL when configured and the value is an S3 key.
  - Uses a local path (`/uploads/...`) when S3 is not configured but the offer has an image key/path.
  - **Never returns null** — falls back to a public placeholder URL.

- **`ensureOffersHaveImageUrl(offers)`**  
  Call this on any **array** of offers before sending to the client. It guarantees every item has a non-empty `image_url`.  
  Used in: `offerService.listPublicOffers()` after normalizing.

- **`FALLBACK_IMAGE_URL`**  
  Single constant for the public placeholder. Used by the normalizer and empty-offer shape.

**Where to use:**

- `offerRepository`: when mapping rows to offer objects, set `image_url: resolveOfferImageUrl(row.image_url)`.
- `offerService.listPublicOffers`: after `normalizeOffers(offers)`, return `ensureOffersHaveImageUrl(normalizedOffers)`.
- `offerService.getPublicOfferById`: set `image_url: resolveOfferImageUrl(offer.image_url)`.
- `responseNormalizer.normalizeOffer`: use `FALLBACK_IMAGE_URL` from `offerImageUrl.js` (not a local or `/assets/...` path that 404s on the frontend).

**Do not:** build image URLs inline with `getS3FileUrl` + ad-hoc fallbacks in controllers or repos. Use `offerImageUrl.js` only.

---

## 2. Frontend: single source of truth

**File:** `frontend/src/utils/dealImage.js`

- **`getDealImageUrl(deal, apiBase)`**  
  Call this whenever you display a deal/offer image (card, list, detail).  
  It:
  - Accepts `deal.image` or `deal.image_url`.
  - Leaves full URLs (http/https/data) as-is.
  - Prefixes paths starting with `/` with `apiBase` so the request goes to the backend.
  - **Always returns a string** — uses `DEFAULT_DEAL_IMAGE_URL` when the deal has no image.

- **`DEFAULT_DEAL_IMAGE_URL`**  
  Same placeholder as backend (Unsplash). Use for `onError` fallback in components.

**Where to use:**

- **ExperienceCard:** `imgUrl = getDealImageUrl(deal, API_BASE)`; use `<img src={effectiveUrl} onError={...} />` so failed loads show the default.
- **HomePage:** when building `formattedDeals`, set `image: getDealImageUrl(item, API_BASE)`. For "All Partner Deals", pass `dealWithImage` with `image: getDealImageUrl(deal, API_BASE)`.
- **Any new list/card that shows offers:** use `getDealImageUrl(offer, API_BASE)` for the image URL; avoid hardcoded fallbacks or raw `offer.image_url` without resolution.

**Do not:** build image URLs inline with `API_BASE + item.image_url` or duplicate fallback strings across components. Use `dealImage.js` only.

---

## 3. Response guarantee

- **Backend:** Every offer in `GET /api/v1/offers` (and get-by-id) must have `image_url` set to a non-empty string (S3 URL, local path, or public fallback). The `ensureOffersHaveImageUrl` safeguard enforces this for list responses.
- **Frontend:** Every place that renders an offer image must use `getDealImageUrl(deal, apiBase)` so paths are resolved and missing images become the default placeholder. Prefer a visible `<img>` with `onError` so failed loads (e.g. CORS) show the placeholder.

---

## 4. Checklist for new code

- [ ] New API that returns offers: use `resolveOfferImageUrl` for each offer’s `image_url`; for lists, run `ensureOffersHaveImageUrl` before sending.
- [ ] New component that displays offer image: use `getDealImageUrl(deal, API_BASE)` and a fallback (e.g. `<img onError={...}>` or default src).
- [ ] New normalizer or formatter that touches offers: do not overwrite `image_url` with a relative path that 404s on the frontend (e.g. `/assets/default-offer.jpg`). Use `FALLBACK_IMAGE_URL` from `offerImageUrl.js`.

---

## 5. Why this prevents the problem

1. **One place to fix:** All resolution logic lives in `offerImageUrl.js` (backend) and `dealImage.js` (frontend). Changing S3 vs local or fallback URL only requires edits there.
2. **No null/empty in API:** `ensureOffersHaveImageUrl` guarantees the client never receives an offer with missing `image_url`.
3. **Frontend always has a URL:** `getDealImageUrl` always returns a string, and cards use `<img onError={...}>` so even when the primary URL fails (e.g. CORS), the placeholder appears instead of an empty area.
