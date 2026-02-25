/**
 * Single place for resolving deal/offer image URLs on the frontend.
 * Use this wherever we display deal images (cards, lists, detail) so we never show a broken or empty image.
 * Must stay in sync with backend: backend returns image_url (or path); we resolve paths with API_BASE and fallback.
 */

export const DEFAULT_DEAL_IMAGE_URL =
  "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80";

/**
 * Returns a loadable image URL for a deal/offer.
 * - Full URLs (http/https/data) are returned as-is.
 * - Paths starting with / are prefixed with apiBase so the request goes to the backend.
 * - Falsy or missing image/image_url returns the default placeholder.
 * @param {Object} deal - Deal/offer object (may have .image and/or .image_url)
 * @param {string} [apiBase] - Base URL for API (e.g. import.meta.env.VITE_API_BASE_URL || "http://localhost:4000")
 * @returns {string} Always a non-empty URL suitable for <img src> or backgroundImage.
 */
export function getDealImageUrl(deal, apiBase = "") {
  const base = apiBase || (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE_URL) || "http://localhost:4000";
  const raw = (deal && (deal.image ?? deal.image_url)) || "";
  const url = typeof raw === "string" ? raw.trim() : "";
  if (!url) return DEFAULT_DEAL_IMAGE_URL;
  if (url.startsWith("http://") || url.startsWith("https://") || url.startsWith("data:")) return url;
  if (url.startsWith("/")) return `${base.replace(/\/$/, "")}${url}`;
  return `${base.replace(/\/$/, "")}/${url}`;
}
