import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import DealMenuPane from "../components/DealMenuPane";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const gold = "#D4AF37";
const fontSerif = "'Playfair Display', 'DM Serif Display', Georgia, serif";

const formatDealFromApi = (item) => ({
  id: item.id,
  title: item.title || item.name,
  description: item.description,
  price: item.discounted_price || item.original_price || 0,
  originalPrice: item.original_price,
  image: item.image_url || "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
  service_type: item.service_type || "others",
  is_trending: item.is_trending || false,
  rating: item.rating ?? item.partner_rating ?? null,
  latitude: item.latitude || item.partner_latitude,
  longitude: item.longitude || item.partner_longitude,
  partner_id: item.partner_id,
  partner_name: item.partner_name,
  partner_address: item.partner_address || null,
  category_name: item.category_name,
  perk_type: item.perk_type || "discount",
  perk_description: item.perk_description,
  min_tier_name: item.min_tier_name || null,
  distance_km: item.distance_km != null ? Number(item.distance_km) : null,
  partner_cuisine_types: item.partner_cuisine_types || null,
  partner_avg_cost_for_two: item.partner_avg_cost_for_two != null ? Number(item.partner_avg_cost_for_two) : null,
  co_pay_percentage: item.co_pay_percentage != null ? Number(item.co_pay_percentage) : null,
});

const formatPrice = (n) => (n != null ? `₹${Number(n).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—");
const formatDistance = (km) => (km != null ? (km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(1)} km`) : "");

const TrendingExperiencesPage = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [offers, setOffers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [isMenuPaneOpen, setIsMenuPaneOpen] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    if (!token) {
      navigate("/login");
      return;
    }
    const params = new URLSearchParams({ is_active: "true", limit: "100" });
    fetch(`${API_BASE}/api/v1/offers?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.success && Array.isArray(data.data)) {
          setOffers(data.data.filter((o) => o.is_trending === true));
        }
      })
      .catch(() => setOffers([]))
      .finally(() => setLoading(false));
  }, [navigate]);

  const deals = useMemo(() => offers.map(formatDealFromApi), [offers]);

  const formatPriceLabel = (deal) => {
    const price = deal?.price != null ? Number(deal.price) : 0;
    const original = deal?.originalPrice != null ? Number(deal.originalPrice) : 0;
    const coPay = deal?.co_pay_percentage != null ? Number(deal.co_pay_percentage) : null;
    if (price > 0 && original > price) {
      return (
        <span>
          <span style={{ textDecoration: "line-through", marginRight: "0.35rem", color: "#9CA3AF" }}>{formatPrice(original)}</span>
          <span>{formatPrice(price)} with EZT</span>
        </span>
      );
    }
    if (price === 0 && coPay != null && coPay > 0) {
      return <span>Co-pay {coPay}% with EZT</span>;
    }
    if (deal?.partner_avg_cost_for_two != null) {
      return `${formatPrice(deal.partner_avg_cost_for_two)} for two`;
    }
    return formatPrice(price) || "—";
  };

  const handleDealCardClick = (deal, e) => {
    e?.stopPropagation();
    setSelectedDeal(deal);
    setIsMenuPaneOpen(true);
  };

  const handleBookDeal = (deal) => {
    if (deal?.partner_id) navigate(`/venue/${deal.partner_id}`);
    else setSelectedDeal(deal);
    setIsMenuPaneOpen(true);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#0B0F1A", color: "#F3F4F6", paddingBottom: "5rem" }}>
      {/* Header: back | Trending Experiences (gold) | avatar */}
      <header style={{
        position: "sticky",
        top: 0,
        zIndex: 10,
        background: "rgba(11, 15, 26, 0.9)",
        backdropFilter: "blur(12px)",
        borderBottom: "1px solid rgba(212, 175, 55, 0.15)",
        padding: "12px 16px",
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: "800px", margin: "0 auto" }}>
          <button
            type="button"
            onClick={() => navigate(-1)}
            style={{
              padding: "8px",
              background: "transparent",
              border: "none",
              color: gold,
              cursor: "pointer",
              fontSize: "1.25rem",
            }}
            aria-label="Back"
          >
            ←
          </button>
          <h1 style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            color: gold,
            fontFamily: fontSerif,
            flex: 1,
            textAlign: "center",
          }}>
            Trending Experiences
          </h1>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              border: `1px solid ${gold}`,
              background: "rgba(212, 175, 55, 0.15)",
              color: gold,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              fontSize: "0.9rem",
              fontWeight: 600,
            }}
            aria-label="Profile"
          >
            {user?.first_name ? String(user.first_name[0]).toUpperCase() : "👤"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: "800px", margin: "0 auto", padding: "1rem 1rem 2rem" }}>
        {loading ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#9CA3AF" }}>Loading trending experiences…</div>
        ) : deals.length === 0 ? (
          <div style={{ textAlign: "center", padding: "3rem", color: "#9CA3AF" }}>
            <p>No trending experiences right now.</p>
            <button
              type="button"
              onClick={() => navigate("/home")}
              style={{
                marginTop: "1rem",
                padding: "0.6rem 1.2rem",
                background: "transparent",
                color: gold,
                border: `1px solid ${gold}`,
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Back to Home
            </button>
          </div>
        ) : (
          <div className="trending-grid" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
            {deals.map((item) => (
              <div
                key={item.id}
                className="trending-card"
                onClick={(e) => handleDealCardClick(item, e)}
                style={{ cursor: "pointer", maxWidth: "100%" }}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleDealCardClick(item, e);
                  }
                }}
                aria-label={`View ${item.title}`}
              >
                <div
                  className="card-image"
                  style={{
                    backgroundImage: `url(${item.image})`,
                    height: "200px",
                    borderRadius: "12px 12px 0 0",
                  }}
                  role="img"
                  aria-label={item.title}
                >
                  <div className="card-badge trending">TRENDING</div>
                  {item.min_tier_name && (
                    <div className="card-badge" style={{ background: "rgba(167, 139, 250, 0.9)", color: "#fff" }}>
                      Unlock at {item.min_tier_name}
                    </div>
                  )}
                  <div className="card-rating">
                    <span className="rating-star">⭐</span>
                    <span>{Number(item.rating).toFixed(1)}</span>
                  </div>
                </div>
                <div className="card-content" style={{ marginTop: "-32px", position: "relative" }}>
                  <div className="card-meta-row">
                    {item.category_name && <span className="card-category">{item.category_name}</span>}
                    {item.distance_km != null && <span className="card-distance">{formatDistance(item.distance_km)}</span>}
                  </div>
                  <h3 className="card-title">{item.title}</h3>
                  {(item.perk_type && item.perk_type !== "discount") || item.perk_description ? (
                    <p className="card-perks">{item.perk_description || item.perk_type}</p>
                  ) : null}
                  <p className="card-description">{item.description}</p>
                  <div className="card-footer">
                    <div className="card-price">{formatPriceLabel(item)}</div>
                    <div className="card-actions">
                      {item.partner_id && (
                        <button
                          type="button"
                          className="card-link-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/venue/${item.partner_id}`);
                          }}
                        >
                          View venue
                        </button>
                      )}
                      <button
                        type="button"
                        className="card-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleBookDeal(item);
                        }}
                      >
                        Book Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {selectedDeal && (
        <DealMenuPane
          deal={selectedDeal}
          isOpen={isMenuPaneOpen}
          onClose={() => {
            setIsMenuPaneOpen(false);
            setSelectedDeal(null);
          }}
        />
      )}
    </div>
  );
};

export default TrendingExperiencesPage;
