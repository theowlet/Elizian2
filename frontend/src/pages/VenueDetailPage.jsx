import React, { useState, useEffect } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";

const VenueDetailPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
  const [venue, setVenue] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [reviewForm, setReviewForm] = useState({ rating: 5, title: "", comment: "" });
  const [submittingReview, setSubmittingReview] = useState(false);
  const [showTipModal, setShowTipModal] = useState(false);
  const [tipAmount, setTipAmount] = useState(100);
  const [tipCustomAmount, setTipCustomAmount] = useState("");
  const [tipNotes, setTipNotes] = useState("");
  const [submittingTip, setSubmittingTip] = useState(false);
  const [tipPaymentMethod, setTipPaymentMethod] = useState("fiat");
  const [eztBalance, setEztBalance] = useState(null);
  const [checkInsToday, setCheckInsToday] = useState(null);
  const [venueStats, setVenueStats] = useState(null);
  const [userTier, setUserTier] = useState(null);
  // Menu photo slider state (must be here — not after any early return)
  const [menuSlide, setMenuSlide] = useState(0);
  const [menuLightbox, setMenuLightbox] = useState(null);
  const token = localStorage.getItem("token");

  const perkLabel = (type) => {
    const labels = { free_item: "Free item", secret_menu: "Secret menu", priority_access: "Priority access", other: "Perk" };
    return labels[type] || type;
  };

  useEffect(() => {
    let cancelled = false;
    async function fetchVenue() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`${API_BASE}/api/v1/partners/${id}/venue-detail`);
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(data?.message || "Failed to load venue");
          setVenue(null);
          return;
        }
        if (data.success && data.data) {
          setVenue(data.data);
        } else {
          setVenue(null);
          setError("Venue not found");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message || "Something went wrong");
          setVenue(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    if (id) fetchVenue();
    return () => { cancelled = true; };
  }, [id, API_BASE]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    async function fetchReviews() {
      try {
        const res = await fetch(`${API_BASE}/api/v1/partners/${id}/reviews?limit=15`);
        const data = await res.json();
        if (cancelled) return;
        if (data.success && Array.isArray(data.data)) setReviews(data.data);
      } catch (_) {}
    }
    fetchReviews();
    return () => { cancelled = true; };
  }, [id, API_BASE]);

  // Check-ins today (social proof) – public
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/partners/${id}/check-ins-today`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled && d.success && d.data?.count != null) setCheckInsToday(d.data.count); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [id, API_BASE]);

  // User's stats at this venue + tier (for "You & this venue" block)
  useEffect(() => {
    if (!id || !token) return;
    let cancelled = false;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_BASE}/api/v1/user/venue-stats/${id}`, { headers }).then((r) => r.json()),
      fetch(`${API_BASE}/api/v1/user/tier`, { headers }).then((r) => r.json())
    ]).then(([statsRes, tierRes]) => {
      if (cancelled) return;
      if (statsRes.success && statsRes.data) setVenueStats(statsRes.data);
      if (tierRes.success && tierRes.data) setUserTier(tierRes.data);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [id, token, API_BASE]);

  const handleSubmitReview = async (e) => {
    e.preventDefault();
    if (!token) {
      navigate("/login", { state: { from: { pathname: `/venue/${id}` } } });
      return;
    }
    setSubmittingReview(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/${id}/reviews`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          rating: reviewForm.rating,
          title: reviewForm.title.trim() || undefined,
          comment: reviewForm.comment.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setShowReviewModal(false);
        setReviewForm({ rating: 5, title: "", comment: "" });
        setReviews((prev) => [{ ...data.data, user_name: "You" }, ...prev]);
        if (venue) {
          const count = (venue.review_count || 0) + 1;
          const avg = venue.average_rating
            ? (venue.average_rating * (count - 1) + reviewForm.rating) / count
            : reviewForm.rating;
          setVenue({ ...venue, review_count: count, average_rating: avg });
        }
      } else {
        alert(data?.message || "Failed to submit review");
      }
    } catch (err) {
      alert(err.message || "Failed to submit review");
    } finally {
      setSubmittingReview(false);
    }
  };

  const openTipModal = async () => {
    setShowTipModal(true);
    setTipPaymentMethod("fiat");
    if (token && eztBalance === null) {
      try {
        const res = await fetch(`${API_BASE}/api/v1/rewards/summary`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success && data.data?.ezt?.available != null) {
          setEztBalance(parseFloat(data.data.ezt.available));
        }
      } catch (_) {}
    }
  };

  const closeTipModal = () => {
    setShowTipModal(false);
    setTipNotes("");
    setTipCustomAmount("");
    setTipPaymentMethod("fiat");
  };

  const handleSendTip = async (e) => {
    e.preventDefault();
    if (!token) {
      navigate("/login", { state: { from: { pathname: `/venue/${id}` } } });
      return;
    }
    const amount = tipCustomAmount ? parseFloat(tipCustomAmount) : tipAmount;
    if (!Number.isFinite(amount) || amount <= 0) {
      alert("Please enter a valid amount");
      return;
    }
    if (tipPaymentMethod === "ezt" && eztBalance !== null && amount / 100 > eztBalance) {
      alert(`Insufficient EZT balance. You have ${eztBalance.toFixed(2)} EZT (₹${(eztBalance * 100).toFixed(0)})`);
      return;
    }
    setSubmittingTip(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/${id}/tips`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          amount_decimal: amount,
          currency: "INR",
          payment_method: tipPaymentMethod,
          notes: tipNotes.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        closeTipModal();
        if (tipPaymentMethod === "ezt") {
          setEztBalance((prev) => prev !== null ? prev - amount / 100 : prev);
        }
        alert(tipPaymentMethod === "ezt"
          ? `Thank you! ${(amount / 100).toFixed(2)} EZT deducted as tip.`
          : "Thank you! Your tip has been recorded.");
      } else {
        alert(data?.message || "Failed to send tip");
      }
    } catch (err) {
      alert(err.message || "Failed to send tip");
    } finally {
      setSubmittingTip(false);
    }
  };

  const handleBookOffer = (offer) => {
    const deal = {
      id: offer.id,
      title: offer.title,
      description: offer.description,
      service_type: offer.service_type || "others",
      partner_id: id,
      partner_name: venue?.name,
      discounted_price: offer.discounted_price,
      original_price: offer.original_price,
      image_url: offer.image_url,
    };
    const token = localStorage.getItem("token");
    if (!token) {
      sessionStorage.setItem(
        "pendingBooking",
        JSON.stringify({ dealId: offer.id, partnerId: id, redirectPath: `/venue/${id}` })
      );
      navigate("/login", { state: { from: { pathname: `/venue/${id}` } } });
      return;
    }
    navigate("/events/booking", { state: { deal, dealId: offer.id, serviceType: deal.service_type } });
  };

  const formatPrice = (price) => {
    if (price == null) return "—";
    return `₹${Number(price).toLocaleString("en-IN")}`;
  };

  if (loading) {
    return (
      <div className="venue-detail-page" style={{ padding: "2rem", textAlign: "center" }}>
        <div className="venue-detail-loading">Loading venue…</div>
      </div>
    );
  }

  if (error || !venue) {
    return (
      <div className="venue-detail-page" style={{ padding: "2rem", textAlign: "center" }}>
        <p className="venue-detail-error">{error || "Venue not found"}</p>
        <button type="button" className="btn btn-primary" onClick={() => navigate("/home")}>
          Back to Home
        </button>
      </div>
    );
  }

  const menuImages = Array.isArray(venue.menu_images) ? venue.menu_images : [];
  const offers = venue.offers || [];
  const rating = venue.average_rating ?? venue.rating;
  const reviewCount = venue.review_count ?? 0;

  return (
    <div className="venue-detail-page">
      <header className="venue-detail-header">
        <button
          type="button"
          className="venue-detail-back"
          onClick={() => navigate(-1)}
          aria-label="Go back"
        >
          ← Back
        </button>
      </header>

      <section className="venue-detail-hero">
        <h1 className="venue-detail-name">{venue.name}</h1>
        {(venue.category_name || venue.category_slug) && (
          <span className="venue-detail-category">{venue.category_name || venue.category_slug}</span>
        )}
        {rating != null && (
          <div className="venue-detail-rating">
            <span className="venue-detail-stars">★ {Number(rating).toFixed(1)}</span>
            {reviewCount > 0 && (
              <span className="venue-detail-review-count">({reviewCount} reviews)</span>
            )}
          </div>
        )}
        {token && (
          <button type="button" className="venue-detail-tip-btn" onClick={openTipModal}>
            Tip venue
          </button>
        )}
        {/* Quick action buttons */}
        <div className="venue-detail-action-bar">
          <button
            type="button"
            className="venue-action-btn venue-action-btn-primary"
            onClick={() => navigate('/reserve', { state: { partnerId: id, partnerName: venue.name } })}
          >
            📅 Book a Table
          </button>
          <button
            type="button"
            className="venue-action-btn"
            onClick={() => navigate(`/messages/${id}`)}
          >
            💬 Message
          </button>
          <button
            type="button"
            className="venue-action-btn"
            onClick={() => setShowReviewModal(true)}
          >
            ⭐ Review
          </button>
        </div>
        {/* You & this venue (when logged in) */}
        {token && (venueStats || userTier) && (
          <div className="venue-detail-you-venue" style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(16, 185, 129, 0.08)', borderRadius: 12, border: '1px solid rgba(16, 185, 129, 0.2)' }}>
            <h3 style={{ margin: '0 0 8px', fontSize: '0.95rem', color: '#d1d5db' }}>You & this venue</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px 20px', fontSize: '0.9rem' }}>
              {userTier?.current?.name && (
                <span><strong>Your tier:</strong> {userTier.current.name}</span>
              )}
              {venueStats?.visit_count != null && (
                <span><strong>Visits:</strong> {venueStats.visit_count}</span>
              )}
              {venueStats?.ezt_earned_at_venue != null && venueStats.ezt_earned_at_venue > 0 && (
                <span><strong>EZT earned here:</strong> {Number(venueStats.ezt_earned_at_venue).toFixed(2)}</span>
              )}
            </div>
          </div>
        )}
        {/* Social proof (real check-ins today) */}
        <div className="venue-detail-social-proof">
          🔥 {checkInsToday != null ? `${checkInsToday} check-in${checkInsToday !== 1 ? 's' : ''} today` : 'Recent check-ins at this venue'}
        </div>
      </section>

      {/* Photo gallery if venue has images */}
      {(venue.gallery_images || venue.image_url || menuImages.length > 0) && (
        <section className="venue-detail-gallery-section">
          <div className="venue-detail-gallery-scroll">
            {venue.image_url && (
              <div className="venue-detail-gallery-item">
                <img src={venue.image_url} alt={venue.name} />
              </div>
            )}
            {(venue.gallery_images || []).map((url, i) => (
              <div key={i} className="venue-detail-gallery-item">
                <img src={url.startsWith('http') ? url : `${API_BASE}${url}`} alt={`${venue.name} ${i+1}`} />
              </div>
            ))}
          </div>
        </section>
      )}

      {venue.description && (
        <section className="venue-detail-section">
          <h2>About</h2>
          <p className="venue-detail-description">{venue.description}</p>
        </section>
      )}

      {(venue.address || venue.phone_number || venue.email || (venue.latitude != null && venue.longitude != null)) && (
        <section className="venue-detail-section">
          <h2>Contact & Location</h2>
          {venue.address && <p><strong>Address:</strong> {venue.formatted_address || venue.address}</p>}
          {venue.geo_verified && <span className="venue-detail-geo-badge" title="Address verified on map">📍 Verified location</span>}
          {(() => {
            const lat = venue.latitude != null ? Number(venue.latitude) : null;
            const lon = venue.longitude != null ? Number(venue.longitude) : null;
            return lat != null && lon != null && !(lat === 0 && lon === 0);
          })() && (
            <div className="venue-detail-map-block">
              <div className="venue-detail-map-preview">
                <iframe
                  title="Venue location"
                  src={`https://www.google.com/maps?q=${venue.latitude},${venue.longitude}&z=15&output=embed`}
                  width="100%"
                  height="200"
                  style={{ border: 0, borderRadius: 8 }}
                  allowFullScreen
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                />
              </div>
              <a
                className="venue-detail-open-maps"
                href={`https://www.google.com/maps/search/?api=1&query=${venue.latitude},${venue.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions
              </a>
            </div>
          )}
          {venue.address && !(venue.latitude != null && venue.longitude != null && Number(venue.latitude) !== 0 && Number(venue.longitude) !== 0) && (
            (() => {
              const rawAddr = (venue.formatted_address || venue.address || '').trim();
              const mapQuery = rawAddr ? (/\bIndia\b/i.test(rawAddr) ? rawAddr : `${rawAddr}, India`) : rawAddr;
              return (
                <a
                  className="venue-detail-open-maps"
                  href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-block', marginTop: 8 }}
                >
                  Get directions (by address)
                </a>
              );
            })()
          )}
          {venue.phone_number && (
            <p><strong>Phone:</strong> <a href={`tel:${venue.phone_number}`}>{venue.phone_number}</a></p>
          )}
          {venue.email && (
            <p><strong>Email:</strong> <a href={`mailto:${venue.email}`}>{venue.email}</a></p>
          )}
        </section>
      )}

      {venue.operating_hours && venue.operating_hours.length > 0 && (
        <section className="venue-detail-section">
          <h2>Opening hours</h2>
          <ul className="venue-detail-hours">
            {venue.operating_hours.map((h, i) => (
              <li key={i}>
                {h.day}: {h.is_closed ? "Closed" : `${h.opens_at || "—"} – ${h.closes_at || "—"}`}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="venue-detail-section venue-detail-reviews">
        <h2>Reviews</h2>
        {token && (
          <button type="button" className="venue-detail-write-review" onClick={() => setShowReviewModal(true)}>
            Write a review
          </button>
        )}
        {!token && (
          <p className="venue-detail-review-login">
            <button type="button" className="venue-detail-review-login-btn" onClick={() => navigate("/login", { state: { from: { pathname: `/venue/${id}` } } })}>
              Sign in
            </button> to leave a review.
          </p>
        )}
        {reviews.length === 0 ? (
          <p className="venue-detail-no-reviews">No reviews yet. Be the first to review!</p>
        ) : (
          <ul className="venue-detail-reviews-list">
            {reviews.map((r) => (
              <li key={r.id} className="venue-detail-review-item">
                <div className="venue-detail-review-meta">
                  <span className="venue-detail-review-stars">{"★".repeat(r.rating)}{"☆".repeat(5 - r.rating)}</span>
                  <span className="venue-detail-review-user">{r.user_name}</span>
                  {r.is_verified_visit && <span className="venue-detail-verified">Verified visit</span>}
                  <span className="venue-detail-review-date">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
                {r.title && <strong className="venue-detail-review-title">{r.title}</strong>}
                {r.comment && <p className="venue-detail-review-comment">{r.comment}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {showTipModal && (
        <div className="venue-detail-modal-overlay" onClick={() => !submittingTip && closeTipModal()}>
          <div className="venue-detail-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Tip {venue?.name}</h3>
            <form onSubmit={handleSendTip}>
              {/* Payment method toggle */}
              <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
                <button type="button" onClick={() => setTipPaymentMethod("fiat")}
                  style={{ flex: 1, padding: "10px", borderRadius: 8, border: tipPaymentMethod === "fiat" ? "2px solid var(--primary-color, #2563eb)" : "1px solid #ddd", background: tipPaymentMethod === "fiat" ? "var(--primary-color, #2563eb)" : "#fff", color: tipPaymentMethod === "fiat" ? "#fff" : "#333", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                  Fiat (UPI / Cash)
                </button>
                <button type="button" onClick={() => setTipPaymentMethod("ezt")}
                  style={{ flex: 1, padding: "10px", borderRadius: 8, border: tipPaymentMethod === "ezt" ? "2px solid var(--primary-color, #2563eb)" : "1px solid #ddd", background: tipPaymentMethod === "ezt" ? "var(--primary-color, #2563eb)" : "#fff", color: tipPaymentMethod === "ezt" ? "#fff" : "#333", fontWeight: 600, cursor: "pointer", fontSize: "0.9rem" }}>
                  $EZT{eztBalance !== null ? ` (${eztBalance.toFixed(2)})` : ""}
                </button>
              </div>
              {tipPaymentMethod === "fiat" && (
                <p style={{ fontSize: "0.8rem", color: "#666", margin: "-0.5rem 0 0.75rem" }}>Pay via UPI / cash at the venue. This records your tip.</p>
              )}
              {tipPaymentMethod === "ezt" && eztBalance !== null && (
                <p style={{ fontSize: "0.8rem", color: "#666", margin: "-0.5rem 0 0.75rem" }}>
                  Balance: {eztBalance.toFixed(2)} EZT (₹{(eztBalance * 100).toFixed(0)})
                </p>
              )}
              <label>
                Amount (₹)
                <div className="venue-detail-tip-amounts">
                  {[50, 100, 200, 500].map((n) => (
                    <button key={n} type="button" className={`venue-detail-tip-amt ${tipAmount === n && !tipCustomAmount ? "active" : ""}`} onClick={() => { setTipAmount(n); setTipCustomAmount(""); }}>
                      ₹{n}
                    </button>
                  ))}
                </div>
                <input type="number" min="1" step="1" placeholder="Or custom amount" value={tipCustomAmount} onChange={(e) => { setTipCustomAmount(e.target.value); }} />
              </label>
              {tipPaymentMethod === "ezt" && (() => { const a = tipCustomAmount ? parseFloat(tipCustomAmount) : tipAmount; return Number.isFinite(a) && a > 0 ? <p style={{ fontSize: "0.8rem", color: "#004f4a", fontWeight: 600, margin: "0.25rem 0 0" }}>= {(a / 100).toFixed(2)} EZT</p> : null; })()}
              <label>
                Note (optional)
                <textarea value={tipNotes} onChange={(e) => setTipNotes(e.target.value)} placeholder="Thank your server or team" rows={2} />
              </label>
              <div className="venue-detail-modal-actions">
                <button type="button" onClick={closeTipModal} disabled={submittingTip}>Cancel</button>
                <button type="submit" disabled={submittingTip}>{submittingTip ? "Sending…" : `Send ${tipPaymentMethod === "ezt" ? "EZT" : ""} tip`}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showReviewModal && (
        <div className="venue-detail-modal-overlay" onClick={() => !submittingReview && setShowReviewModal(false)}>
          <div className="venue-detail-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Write a review</h3>
            <form onSubmit={handleSubmitReview}>
              <label>
                Rating
                <select value={reviewForm.rating} onChange={(e) => setReviewForm((f) => ({ ...f, rating: Number(e.target.value) }))}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <option key={n} value={n}>{n} ★</option>
                  ))}
                </select>
              </label>
              <label>
                Title (optional)
                <input type="text" value={reviewForm.title} onChange={(e) => setReviewForm((f) => ({ ...f, title: e.target.value }))} placeholder="Short summary" maxLength={200} />
              </label>
              <label>
                Comment (optional)
                <textarea value={reviewForm.comment} onChange={(e) => setReviewForm((f) => ({ ...f, comment: e.target.value }))} placeholder="Share your experience" rows={4} />
              </label>
              <div className="venue-detail-modal-actions">
                <button type="button" onClick={() => setShowReviewModal(false)} disabled={submittingReview}>Cancel</button>
                <button type="submit" disabled={submittingReview}>{submittingReview ? "Submitting…" : "Submit"}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {offers.length > 0 && (
        <section className="venue-detail-section venue-detail-offers">
          <h2>Deals</h2>
          <div className="venue-detail-offers-grid">
            {offers.map((offer) => (
              <div key={offer.id} className="venue-detail-offer-card">
                {offer.image_url && (
                  <div className="venue-detail-offer-image">
                    <img src={offer.image_url} alt="" />
                  </div>
                )}
                <div className="venue-detail-offer-body">
                  {offer.perk_type && offer.perk_type !== 'discount' && (
                    <span className="venue-detail-perk-badge">{perkLabel(offer.perk_type)}</span>
                  )}
                  <h3>{offer.title}</h3>
                  {offer.description && <p>{offer.description}</p>}
                  {offer.perk_description && <p className="venue-detail-perk-desc">{offer.perk_description}</p>}
                  <div className="venue-detail-offer-price">
                    {offer.discounted_price != null && (
                      <span className="venue-detail-price-current">
                        {formatPrice(offer.discounted_price)}
                      </span>
                    )}
                    {offer.original_price != null && offer.original_price !== offer.discounted_price && (
                      <span className="venue-detail-price-original">{formatPrice(offer.original_price)}</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary card-action-btn"
                    onClick={() => handleBookOffer(offer)}
                  >
                    Book now
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {menuImages.length > 0 && (
        <section className="venue-detail-section">
          <h2>Menu</h2>

          {/* ── Main slider ─────────────────────────────────────────────── */}
          <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: '#111', userSelect: 'none' }}>
            {/* Main image */}
            <div
              style={{ cursor: 'zoom-in', position: 'relative' }}
              onClick={() => setMenuLightbox(menuSlide)}
            >
              <img
                src={menuImages[menuSlide].startsWith('http') ? menuImages[menuSlide] : `${API_BASE}${menuImages[menuSlide]}`}
                alt={`Menu ${menuSlide + 1}`}
                style={{ width: '100%', maxHeight: 480, objectFit: 'contain', display: 'block', borderRadius: 12 }}
              />
              {/* Counter badge */}
              <span style={{
                position: 'absolute', bottom: 12, right: 14,
                background: 'rgba(0,0,0,0.6)', color: '#fff',
                fontSize: '0.8rem', padding: '3px 10px', borderRadius: 999
              }}>
                {menuSlide + 1} / {menuImages.length}
              </span>
            </div>

            {/* Prev / Next arrows */}
            {menuImages.length > 1 && (<>
              <button
                onClick={() => setMenuSlide(i => (i - 1 + menuImages.length) % menuImages.length)}
                style={{
                  position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
                  width: 38, height: 38, borderRadius: '50%', fontSize: '1.25rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >‹</button>
              <button
                onClick={() => setMenuSlide(i => (i + 1) % menuImages.length)}
                style={{
                  position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                  background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff',
                  width: 38, height: 38, borderRadius: '50%', fontSize: '1.25rem',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}
              >›</button>
            </>)}
          </div>

          {/* ── Thumbnail strip ─────────────────────────────────────────── */}
          {menuImages.length > 1 && (
            <div style={{
              display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10,
              paddingBottom: 4, scrollSnapType: 'x mandatory'
            }}>
              {menuImages.map((url, idx) => (
                <div
                  key={idx}
                  onClick={() => setMenuSlide(idx)}
                  style={{
                    flexShrink: 0, width: 72, height: 54,
                    borderRadius: 8, overflow: 'hidden', cursor: 'pointer',
                    border: idx === menuSlide ? '2px solid #5E17EB' : '2px solid transparent',
                    opacity: idx === menuSlide ? 1 : 0.6,
                    transition: 'opacity 0.15s, border-color 0.15s',
                    scrollSnapAlign: 'start'
                  }}
                >
                  <img
                    src={url.startsWith('http') ? url : `${API_BASE}${url}`}
                    alt={`Thumb ${idx + 1}`}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </div>
              ))}
            </div>
          )}

          {/* ── Lightbox ──────────────────────────────────────────────────── */}
          {menuLightbox !== null && (
            <div
              onClick={() => setMenuLightbox(null)}
              style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.93)',
                zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12
              }}
            >
              {/* Close */}
              <button
                onClick={() => setMenuLightbox(null)}
                style={{
                  position: 'absolute', top: 16, right: 20, background: 'none',
                  border: 'none', color: '#fff', fontSize: '2rem', cursor: 'pointer', opacity: 0.8
                }}
              >×</button>

              {/* Prev */}
              {menuImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setMenuLightbox(i => (i - 1 + menuImages.length) % menuImages.length); }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
                    fontSize: '2.25rem', width: 46, height: 64, borderRadius: 8, cursor: 'pointer', flexShrink: 0
                  }}
                >‹</button>
              )}

              {/* Image */}
              <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', maxWidth: 'calc(100vw - 140px)' }}>
                <img
                  src={menuImages[menuLightbox].startsWith('http') ? menuImages[menuLightbox] : `${API_BASE}${menuImages[menuLightbox]}`}
                  alt={`Menu ${menuLightbox + 1}`}
                  style={{ maxWidth: '100%', maxHeight: '88vh', objectFit: 'contain', borderRadius: 10, boxShadow: '0 8px 40px rgba(0,0,0,0.7)' }}
                />
                <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.85rem', marginTop: 10 }}>
                  {menuLightbox + 1} / {menuImages.length}
                </p>
              </div>

              {/* Next */}
              {menuImages.length > 1 && (
                <button
                  onClick={e => { e.stopPropagation(); setMenuLightbox(i => (i + 1) % menuImages.length); }}
                  style={{
                    background: 'rgba(255,255,255,0.12)', border: 'none', color: '#fff',
                    fontSize: '2.25rem', width: 46, height: 64, borderRadius: 8, cursor: 'pointer', flexShrink: 0
                  }}
                >›</button>
              )}
            </div>
          )}
        </section>
      )}

      <style>{`
        .venue-detail-page { max-width: 900px; margin: 0 auto; padding: 1rem 1.5rem 3rem; }
        .venue-detail-header { margin-bottom: 1rem; }
        .venue-detail-back { background: none; border: none; color: #333; cursor: pointer; font-size: 1rem; }
        .venue-detail-back:hover { text-decoration: underline; }
        .venue-detail-hero { margin-bottom: 1.5rem; }
        .venue-detail-name { font-size: 1.75rem; margin: 0 0 0.25rem 0; }
        .venue-detail-category { color: #666; font-size: 0.95rem; }
        .venue-detail-rating { margin-top: 0.5rem; }
        .venue-detail-stars { color: #e6a800; font-weight: 600; }
        .venue-detail-review-count { color: #666; font-size: 0.9rem; margin-left: 0.25rem; }
        .venue-detail-section { margin-bottom: 2rem; }
        .venue-detail-section h2 { font-size: 1.25rem; margin-bottom: 0.75rem; }
        .venue-detail-description { color: #444; line-height: 1.5; }
        .venue-detail-hours { list-style: none; padding: 0; margin: 0; }
        .venue-detail-hours li { padding: 0.25rem 0; }
        .venue-detail-offers-grid { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
        .venue-detail-offer-card { border: 1px solid #eee; border-radius: 8px; overflow: hidden; }
        .venue-detail-offer-image { height: 140px; background: #f5f5f5; }
        .venue-detail-offer-image img { width: 100%; height: 100%; object-fit: cover; }
        .venue-detail-offer-body { padding: 1rem; }
        .venue-detail-offer-body h3 { margin: 0 0 0.5rem 0; font-size: 1.1rem; }
        .venue-detail-offer-price { margin: 0.5rem 0; }
        .venue-detail-price-current { font-weight: 600; margin-right: 0.5rem; }
        .venue-detail-price-original { color: #999; text-decoration: line-through; font-size: 0.9rem; }
        .venue-detail-perk-badge { display: inline-block; font-size: 0.75rem; font-weight: 600; color: #059669; background: #d1fae5; padding: 4px 8px; border-radius: 6px; margin-bottom: 0.5rem; }
        .venue-detail-perk-desc { color: #555; font-size: 0.9rem; margin: 0.25rem 0 0; font-style: italic; }
        .venue-detail-menu-gallery { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 0.75rem; }
        .venue-detail-menu-item img { width: 100%; border-radius: 6px; object-fit: cover; max-height: 200px; }
        .venue-detail-loading, .venue-detail-error { color: #666; }
        .venue-detail-reviews { position: relative; }
        .venue-detail-write-review { margin-bottom: 1rem; padding: 8px 16px; background: var(--primary-color, #2563eb); color: #fff; border: none; border-radius: 6px; cursor: pointer; font-weight: 600; }
        .venue-detail-review-login { color: #666; font-size: 0.95rem; }
        .venue-detail-review-login-btn { background: none; border: none; color: var(--primary-color, #2563eb); cursor: pointer; text-decoration: underline; }
        .venue-detail-no-reviews { color: #888; font-style: italic; }
        .venue-detail-reviews-list { list-style: none; padding: 0; margin: 0; }
        .venue-detail-review-item { border-bottom: 1px solid #eee; padding: 1rem 0; }
        .venue-detail-review-meta { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem; }
        .venue-detail-review-stars { color: #e6a800; }
        .venue-detail-review-user { font-weight: 600; }
        .venue-detail-verified { font-size: 0.75rem; color: #059669; background: #d1fae5; padding: 2px 6px; border-radius: 4px; }
        .venue-detail-review-date { color: #888; font-size: 0.85rem; }
        .venue-detail-review-title { display: block; margin-top: 0.25rem; }
        .venue-detail-review-comment { margin: 0.25rem 0 0; color: #444; line-height: 1.4; font-size: 0.95rem; }
        .venue-detail-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
        .venue-detail-modal { background: #fff; padding: 1.5rem; border-radius: 12px; max-width: 400px; width: 90%; box-shadow: 0 4px 20px rgba(0,0,0,0.15); }
        .venue-detail-modal h3 { margin: 0 0 1rem 0; }
        .venue-detail-modal label { display: block; margin-bottom: 0.75rem; }
        .venue-detail-modal label select, .venue-detail-modal label input, .venue-detail-modal label textarea { width: 100%; padding: 8px; margin-top: 4px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        .venue-detail-modal-actions { display: flex; justify-content: flex-end; gap: 0.5rem; margin-top: 1rem; }
        .venue-detail-modal-actions button { padding: 8px 16px; border-radius: 6px; cursor: pointer; }
        .venue-detail-modal-actions button[type="submit"] { background: var(--primary-color, #2563eb); color: #fff; border: none; }
        .venue-detail-tip-btn { margin-left: 0.75rem; padding: 6px 14px; border-radius: 8px; border: 1px solid #ddd; background: #fff; cursor: pointer; font-size: 0.9rem; }
        .venue-detail-tip-btn:hover { background: #f5f5f5; }
        .venue-detail-tip-amounts { display: flex; gap: 0.5rem; margin: 0.5rem 0; flex-wrap: wrap; }
        .venue-detail-tip-amt { padding: 8px 14px; border: 1px solid #ddd; border-radius: 8px; background: #fff; cursor: pointer; }
        .venue-detail-tip-amt.active { background: var(--primary-color, #2563eb); color: #fff; border-color: var(--primary-color, #2563eb); }
        .venue-detail-message-modal { max-height: 80vh; display: flex; flex-direction: column; }
        .venue-detail-message-list { flex: 1; max-height: 240px; overflow-y: auto; margin-bottom: 12px; border: 1px solid #eee; border-radius: 8px; padding: 8px; }
        .venue-detail-msg { margin-bottom: 8px; padding: 8px; border-radius: 8px; }
        .venue-detail-msg-user { background: #e0e7ff; margin-left: 20%; }
        .venue-detail-msg-partner { background: #f3f4f6; margin-right: 20%; }
        .venue-detail-msg-date { font-size: 0.75rem; color: #888; display: block; margin-top: 4px; }
        .venue-detail-msg-input { width: 100%; padding: 8px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 6px; box-sizing: border-box; }
        .venue-detail-modal-close-inline { margin-top: 8px; padding: 6px 12px; background: #f3f4f6; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; }
        .venue-detail-geo-badge { display: inline-block; font-size: 0.75rem; color: #059669; background: #d1fae5; padding: 4px 8px; border-radius: 6px; margin-left: 0.5rem; }
        .venue-detail-map-block { margin-top: 0.75rem; }
        .venue-detail-map-preview { border-radius: 8px; overflow: hidden; margin-bottom: 0.5rem; }
        .venue-detail-open-maps { display: inline-block; padding: 8px 16px; background: #2563eb; color: #fff; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 0.9rem; }
        .venue-detail-open-maps:hover { background: #1d4ed8; color: #fff; }
        .venue-detail-action-bar { display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap; }
        .venue-action-btn { padding: 8px 16px; border-radius: 10px; border: 1px solid #e5e7eb; background: #fff; cursor: pointer; font-size: 0.85rem; font-weight: 600; transition: all 0.2s; }
        .venue-action-btn:hover { background: #f3f4f6; }
        .venue-action-btn-primary { background: #004f4a; color: #fff; border-color: #004f4a; }
        .venue-action-btn-primary:hover { background: #003832; }
        .venue-detail-social-proof { margin-top: 0.75rem; font-size: 0.8rem; color: #6b7280; }
        .venue-detail-gallery-section { margin-bottom: 1.5rem; overflow-x: auto; }
        .venue-detail-gallery-scroll { display: flex; gap: 0.75rem; padding: 0.5rem 0; overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .venue-detail-gallery-item { flex-shrink: 0; width: 260px; height: 180px; border-radius: 12px; overflow: hidden; }
        .venue-detail-gallery-item img { width: 100%; height: 100%; object-fit: cover; }
      `}</style>
    </div>
  );
};

export default VenueDetailPage;
