/**
 * Single source of truth for resolving offer/deal image URLs.
 * Use this everywhere we expose offer image_url (list, get-by-id, normalizer).
 * Prevents "missing images in All Partner Deals" and similar regressions.
 */

const { getS3FileUrl } = require("../../utils/s3Bucket");

/** Default S3 key when offer has no image (same pattern as uploads). */
const DEFAULT_OFFER_IMAGE_S3_KEY = "uploads/default-offer.jpg";

/** Public fallback when no S3 and no local file — always loadable in browser. */
const FALLBACK_IMAGE_URL =
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80";

/**
 * When S3 is not configured, return a path so the app can serve from /uploads (express.static).
 * Preserves uploaded images (e.g. partner-uploaded deal images).
 */
function localUploadUrl(key) {
  if (!key || typeof key !== "string") return null;
  const k = String(key).trim();
  return k.startsWith("/") ? k : `/${k}`;
}

/**
 * Resolve a display-ready image URL for an offer.
 * - Uses S3 URL when configured and key is an S3 key.
 * - Uses local path (/uploads/...) when S3 not configured but offer has image_url.
 * - Falls back to default image or public URL so the result is never null.
 * @param {string|null|undefined} imageUrlOrKey - DB value (URL, S3 key, or path like uploads/...)
 * @returns {string} Always a non-empty string URL suitable for frontend img/backgroundImage.
 */
function resolveOfferImageUrl(imageUrlOrKey) {
  const key = imageUrlOrKey;
  const fromS3 = key ? getS3FileUrl(key) : null;
  const fromLocal = key ? localUploadUrl(key) : null;
  return (
    fromS3 ||
    fromLocal ||
    getS3FileUrl(DEFAULT_OFFER_IMAGE_S3_KEY) ||
    localUploadUrl(DEFAULT_OFFER_IMAGE_S3_KEY) ||
    FALLBACK_IMAGE_URL
  );
}

/**
 * Safeguard: ensure every offer in a list has a valid image_url.
 * Call this before sending offers to the client so we never send null/empty image_url.
 * @param {Object[]} offers - Array of offer objects (may have image_url missing)
 * @returns {Object[]} Same array with each offer guaranteed to have image_url set.
 */
function ensureOffersHaveImageUrl(offers) {
  if (!Array.isArray(offers)) return offers;
  return offers.map((offer) => {
    if (!offer || typeof offer !== "object") return offer;
    const hasUrl = offer.image_url != null && String(offer.image_url).trim() !== "";
    const url = hasUrl ? resolveOfferImageUrl(offer.image_url) : FALLBACK_IMAGE_URL;
    return { ...offer, image_url: url };
  });
}

module.exports = {
  resolveOfferImageUrl,
  ensureOffersHaveImageUrl,
  FALLBACK_IMAGE_URL,
  DEFAULT_OFFER_IMAGE_S3_KEY,
};
