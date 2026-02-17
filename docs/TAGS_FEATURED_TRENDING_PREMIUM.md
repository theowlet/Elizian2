# Tags & Sections: Trending, Featured, Premium

Single source of truth for the three concepts. **No overlap.**

---

## 1. Trending (on-card tag)

| Aspect | Detail |
|--------|--------|
| **Type** | On-card badge only |
| **Source** | `partner_offers.is_trending` (offer-level) |
| **Meaning** | This offer is currently promoted as “trending” |
| **UI** | “🔥 Trending” on the card |
| **Section** | Shown in **“Trending Experiences”** (homepage section filled from main offers list filtered by `is_trending`) |
| **Admin** | Offer can be set as trending; partner should usually be `approved_for_featured` (or admin forces) |

---

## 2. Premium (on-card tag)

| Aspect | Detail |
|--------|--------|
| **Type** | On-card badge only |
| **Source** | `partners.approved_for_featured` (partner/venue-level) |
| **Meaning** | This venue is approved for premium / featured placement |
| **UI** | “⭐ Premium” on the card |
| **Section** | Not a section; can appear in any section (Featured, Trending, or main list) |
| **Admin** | Partner “featured eligibility” is toggled separately from offer trending |

A card can show **both** Trending and Premium (e.g. trending offer from a premium venue).

---

## 3. Featured (section only, not a tag)

| Aspect | Detail |
|--------|--------|
| **Type** | Section title only — there is no “Featured” badge on cards |
| **Source** | `GET /api/v1/collections/featured` |
| **Meaning** | Curated or premium list for the “Featured” block |
| **UI** | Section heading “✩ Featured” and subtitle “Handpicked experiences” |
| **Content** | • If `featured_collection_offer_ids` is set → those offer IDs (handpicked).<br>• Else → **premium venues only** (`premium_only: true`, i.e. `approved_for_featured`). |
| **No overlap** | Featured section **never** falls back to “trending” offers, so it does not duplicate the “Trending Experiences” section. |

---

## Summary

- **Trending** = offer is promoted (tag + “Trending Experiences” section).
- **Premium** = venue is approved for featured (tag only; can appear anywhere).
- **Featured** = section name; content is either curated IDs or premium venues, never trending.

The API field `featured` on offers is a deprecated alias of `is_trending` for backward compatibility. For “is this in the Featured section?” use the Featured endpoint; for “is this venue premium?” use `partner_approved_for_featured`.
