import React from "react";
import { useNavigate } from "react-router-dom";
import "../styles/experienceCard.css";

/**
 * Universal Experience Card — works across all categories.
 * Layer 1: Image + overlays (rating, wishlist, ribbon, availability)
 * Layer 2: Core metadata (title, area + distance, price band, category tags)
 * Layer 3: Category-specific module (conditional by service_type)
 * Layer 4: Action bar (View Details, Book Now / Join Waitlist / Priority Book)
 */
export default function ExperienceCard({
  deal,
  onBook,
  formatPrice = (n) => (n != null ? `₹${Number(n).toLocaleString()}` : "—"),
  formatDistance = (km) => (km != null ? (km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`) : null),
}) {
  const navigate = useNavigate();
  const {
    id,
    title,
    description,
    price,
    originalPrice,
    image,
    image_url,
    service_type = "others",
    rating,
    partner_rating,
    partner_name,
    partner_address,
    partner_id,
    distance_km,
    is_trending,
    perk_type,
    perk_description,
    min_tier_name,
    partner_cuisine_types,
    partner_avg_cost_for_two,
    experience_metadata,
    start_date,
    end_date,
  } = deal;

  const imgUrl = image || image_url;
  const displayRating = rating ?? partner_rating ?? null;
  const area = (partner_address || partner_name || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const areaLine = area.length ? area[0] : partner_name || "";
  const distanceStr = formatDistance(distance_km);

  // Ribbon: EZT co-pay / Echelon only (no Premium)
  const ribbon =
    (min_tier_name && min_tier_name.toLowerCase().includes("echelon") && "Echelon Exclusive") ||
    (deal.ezt_equivalent > 0 && `Co-pay up to 50% with $EZT`) ||
    null;

  // Availability badge (placeholder: can be wired to slots/waitlist later)
  const availabilityBadge = "Open Now"; // or "Limited Slots" | "Sold Out" | "This Weekend"

  const handleViewDetails = (e) => {
    e.stopPropagation();
    if (partner_id) navigate(`/venue/${partner_id}`);
    else navigate(`/experience/${id}`);
  };

  const handleBook = (e) => {
    e.stopPropagation();
    if (onBook) onBook(deal);
    else if (partner_id) {
      navigate(`/venue/${partner_id}`);
    } else {
      navigate(`/experience/${id}`);
    }
  };

  const isEchelon = min_tier_name && String(min_tier_name).toLowerCase().includes("echelon");
  const primaryCtaLabel = isEchelon ? "Priority Book" : "Book Now";

  return (
    <article className="experience-card" data-service-type={service_type}>
      {/* Layer 1 — Image area (top ~60%, 16:9) */}
      <div className="exp-card__image-wrap">
        <div
          className="exp-card__image"
          style={{
            backgroundImage: imgUrl ? `url(${imgUrl})` : "none",
          }}
          role="img"
          aria-label={title}
        />
        <div className="exp-card__overlays">
          {displayRating != null && (
            <div className="exp-card__rating">
              <span className="exp-card__rating-star">⭐</span>
              <span>{Number(displayRating).toFixed(1)}</span>
              {deal.review_count != null && <span className="exp-card__reviews">({deal.review_count} reviews)</span>}
            </div>
          )}
          <button type="button" className="exp-card__wishlist" aria-label="Add to wishlist">
            ♥
          </button>
          {ribbon && <div className="exp-card__ribbon">{ribbon}</div>}
          <div className="exp-card__availability">{availabilityBadge}</div>
        </div>
      </div>

      {/* Layer 2 — Core metadata */}
      <div className="exp-card__core">
        <h3 className="exp-card__title">{title}</h3>
        <p className="exp-card__area">
          {areaLine}
          {distanceStr ? ` • ${distanceStr}` : ""}
        </p>
        <p className="exp-card__price-band">
          {partner_avg_cost_for_two != null && (service_type === "dining" || service_type === "others")
            ? `${formatPrice(partner_avg_cost_for_two)} for two`
            : price != null
            ? `${formatPrice(price)}${service_type === "travel" ? " per night" : service_type === "events" ? " per ticket" : " per session"}`
            : "—"}
        </p>
        <div className="exp-card__tags">
          {(partner_cuisine_types && partner_cuisine_types.length > 0 && (
            <span className="exp-card__tag">{[].concat(partner_cuisine_types).slice(0, 2).join(" • ")}</span>
          )) ||
            (service_type && <span className="exp-card__tag">{service_type.replace(/-/g, " ")}</span>)}
        </div>
      </div>

      {/* Layer 3 — Category-specific module */}
      <div className="exp-card__category-meta">
        {service_type === "dining" && (
          <>
            {(experience_metadata?.cuisine?.length || partner_cuisine_types?.length) && (
              <span>Cuisine: {(experience_metadata?.cuisine || partner_cuisine_types || []).slice(0, 2).join(", ")}</span>
            )}
            {partner_avg_cost_for_two != null && <span>Cost for two: {formatPrice(partner_avg_cost_for_two)}</span>}
            <span>Open until 11 PM</span>
          </>
        )}
        {(service_type === "spa-and-salon" || service_type === "wellness") && (
          <>
            {experience_metadata?.duration_minutes != null && <span>{experience_metadata.duration_minutes} min</span>}
            {experience_metadata?.therapy_type?.length > 0 && <span>{(experience_metadata.therapy_type || []).join(", ")}</span>}
            <span>Available today</span>
          </>
        )}
        {service_type === "events" && (
          <>
            {experience_metadata?.event_date && <span>Date: {experience_metadata.event_date}</span>}
            {(start_date || end_date) && <span>Time: —</span>}
            {experience_metadata?.seats_left != null && <span>{experience_metadata.seats_left} seats left</span>}
          </>
        )}
        {service_type === "travel" && (
          <>
            {experience_metadata?.star_rating != null && <span>{experience_metadata.star_rating} Star</span>}
            {experience_metadata?.refundable && <span>Refundable</span>}
            {experience_metadata?.breakfast_included && <span>Breakfast included</span>}
          </>
        )}
        {service_type === "healthcare" && (
          <>
            {experience_metadata?.specialization?.length > 0 && <span>{(experience_metadata.specialization || []).join(", ")}</span>}
            {experience_metadata?.consultation_fee != null && <span>Consultation: {formatPrice(experience_metadata.consultation_fee)}</span>}
            {experience_metadata?.verified && <span className="exp-card__verified">Verified</span>}
          </>
        )}
      </div>

      {/* Layer 4 — Action bar */}
      <div className="exp-card__actions">
        <button type="button" className="exp-card__btn exp-card__btn--secondary" onClick={handleViewDetails}>
          View Details
        </button>
        <button type="button" className="exp-card__btn exp-card__btn--primary" onClick={handleBook}>
          {primaryCtaLabel}
        </button>
      </div>
    </article>
  );
}
