# All Partner Deals — Why Images Disappeared and What Was Fixed

## What you saw

Deal cards in **All Partner Deals** showed dark empty rectangles instead of images (including the Basant Bahaar-style asset).

## Root cause

1. **Response normalizer**  
   Public offers are normalized in `offerService.listPublicOffers()` via `normalizeOffers()` → `normalizeOffer()` in `backend/src/utils/responseNormalizer.js`.  
   When an offer had no `image_url` (or it was stripped earlier), the normalizer used a **relative** fallback:
   - `image_url: imageUrl || '/assets/default-offer.jpg'`
   That path is requested from the **frontend origin** (e.g. `https://yourapp.com/assets/default-offer.jpg`).  
   The file does not exist there → **404** → image fails to load.  
   So the API was sometimes sending a non-loadable URL, which led to empty image areas.

2. **Repository vs normalizer**  
   The offer repository already guarantees a loadable URL when S3 is not configured (e.g. `FALLBACK_IMAGE_URL`).  
   The normalizer **replaces** the offer with a new object and was overwriting a valid `image_url` with `/assets/default-offer.jpg` when it considered the value “missing”, or the fallback was used for empty offers.  
   So even when the repo sent a valid URL, the normalizer could still output a path that 404s on the frontend.

3. **Relative paths on the frontend**  
   If the API did return a relative path (e.g. `/uploads/foo.jpg` or `/assets/default-offer.jpg`), the frontend used it as-is in `img`/`backgroundImage`.  
   The browser then requested it from the **app origin**, not the API server, so backend-served assets under `/uploads` or `/assets` would not load unless the app and API share the same origin.

## Changes made

1. **`backend/src/utils/responseNormalizer.js`**
   - Fallback image is no longer a relative path.  
   - When `image_url` is missing, the normalizer now uses the same **public** fallback URL used elsewhere (Unsplash), so the API always returns a URL that loads in the browser.
   - `getEmptyOffer()` uses the same public fallback instead of `'/assets/default-offer.jpg'`.
   - Existing full URLs (http/https/data) and relative paths from the repo are preserved; only the default when there is no URL was changed.

2. **Frontend**
   - **HomePage** (deal list): If `item.image_url` starts with `/`, it is turned into an absolute URL by prepending `API_BASE` so the image is loaded from the backend when the API returns a path.
   - **ExperienceCard**: Same rule — if `image` or `image_url` is a string starting with `/`, it is resolved with `API_BASE` before use, so any path returned by the API is loaded from the backend.

Result:

- The API no longer sends a fallback that 404s on the frontend.
- If the API does send a path, the frontend loads it from the API origin, so backend-served images (e.g. under `/uploads`) work.

## How to confirm

- Open All Partner Deals; cards should show either the offer image or the shared fallback image, not empty rectangles.
- If you use S3, offer images from S3 continue to work; the normalizer does not change full URLs.
- If you don’t use S3 and serve images from the backend (e.g. `express.static('uploads')`), ensure the repo returns a path (e.g. `/uploads/...`) or a full URL; the frontend will prepend `API_BASE` for paths so they load correctly.

## Files touched

- `backend/src/utils/responseNormalizer.js` — fallback image and empty-offer default.
- `frontend/src/pages/HomePage.jsx` — resolve relative `image_url` with `API_BASE`.
- `frontend/src/components/ExperienceCard.jsx` — resolve relative image URLs with `API_BASE`.
