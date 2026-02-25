import React from "react";
import "../styles/venueMemeCard.css";

/**
 * Meme-style collectible venue card.
 * Tagline is chosen pseudo-randomly from a fixed list for a snobbier feel.
 * Avatar can be shown to give it a meme-coin look.
 */
const TAGLINE_SUFFIXES = [
  "HOUSE PRIVILEGED",
  "INNER CIRCLE",
  "FOUNDERS LIST",
  "TABLES ALWAYS RESERVED",
  "NOT FOR ORDINARY",
  "OFF-MENU ACCESS",
  "BLACKLIST-PROOF",
  "ABOVE THE LIST",
];

function getTaglineIndex(card) {
  if (card && typeof card.id === "number") {
    return Math.abs(card.id) % TAGLINE_SUFFIXES.length;
  }
  if (card && typeof card.partner_id === "string") {
    let hash = 0;
    for (let i = 0; i < card.partner_id.length; i += 1) {
      hash = (hash * 31 + card.partner_id.charCodeAt(i)) | 0;
    }
    return Math.abs(hash) % TAGLINE_SUFFIXES.length;
  }
  return 0;
}

const DEFAULT_BRAND_AVATAR = "/img/z.png";

function VenueMemeCard({ card, formatDate, onTap, onEditAvatar, avatarUrl, avatarInitials, brandAvatarUrl }) {
  const venueName = card.partner_name || "Venue";
  const earnedDate = card.earned_at
    ? formatDate
      ? formatDate(card.earned_at)
      : new Date(card.earned_at).toLocaleDateString()
    : "";

  const taglineIndex = getTaglineIndex(card);
  const tagline = TAGLINE_SUFFIXES[taglineIndex];
  const variantClass = `venue-meme-card--v${taglineIndex % 4}`;

  // Per-card S3 avatar first, then profile photo, then brand placeholder
  const displayAvatarUrl = card.avatar_display_url || avatarUrl;

  return (
    <button
      type="button"
      className={`venue-meme-card ${variantClass}`}
      onClick={() => onTap && onTap(card)}
      aria-label={`Venue card: ${venueName}. Member · ${tagline}. Earned ${earnedDate}. Tap to open venue.`}
    >
      <div className="venue-meme-card__frame">
        <div className="venue-meme-card__header">
          <div className="venue-meme-card__avatar-wrap">
            {displayAvatarUrl ? (
              <img src={displayAvatarUrl} alt="" className="venue-meme-card__avatar" loading="lazy" />
            ) : (
              <>
                <img
                  src={brandAvatarUrl || DEFAULT_BRAND_AVATAR}
                  alt=""
                  className="venue-meme-card__avatar"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = "none";
                    const fallback = e.target.nextElementSibling;
                    if (fallback) fallback.classList.remove("venue-meme-card__avatar-placeholder-hidden");
                  }}
                />
                <div className="venue-meme-card__avatar-placeholder venue-meme-card__avatar-placeholder-hidden" aria-hidden="true">
                  <span>{avatarInitials || "U"}</span>
                </div>
              </>
            )}
          </div>
          <div className="venue-meme-card__title-wrap">
            <div className="venue-meme-card__badge">VENUE CARD</div>
            <h3 className="venue-meme-card__title">{venueName}</h3>
          </div>
          {onEditAvatar && (
            <span
              role="button"
              tabIndex={0}
              className="venue-meme-card__edit-avatar"
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onEditAvatar(card);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onEditAvatar(card);
                }
              }}
              aria-label="Edit card avatar"
            >
              ✎
            </span>
          )}
        </div>
        <p className="venue-meme-card__subtitle">MEMBER · {tagline}</p>
        <div className="venue-meme-card__footer">
          <span className="venue-meme-card__earned">Earned {earnedDate}</span>
        </div>
      </div>
    </button>
  );
}

export default VenueMemeCard;
