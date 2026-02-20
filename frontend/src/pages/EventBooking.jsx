import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import "../styles/auth.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

// Screen states
const SCREEN_SELECTION = "selection";
const SCREEN_REVIEW = "review";
const SCREEN_CONFIRMATION = "confirmation";

const EventBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dateRef = useRef(null);
  const bookingTimeRef = useRef(null);
  const [currentScreen, setCurrentScreen] = useState(SCREEN_SELECTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Get deal data from navigation state or sessionStorage
  const [deal, setDeal] = useState(null);
  const [user, setUser] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);

  // Booking form state (Screen 1)
  const [numTickets, setNumTickets] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");

  useEffect(() => {
    // Get user info
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        console.error("Error parsing user data:", e);
      }
    }

    // Get deal data from location state (preferred - already validated)
    if (location.state?.deal) {
      console.log("✅ Using deal from navigation state:", location.state.deal);
      setDeal(location.state.deal);
    } else if (location.state?.dealId) {
      console.log("⚠️ Only dealId provided, fetching details...");
      fetchDealDetails(location.state.dealId);
    } else {
      // Check sessionStorage for pending booking
      const pendingBooking = sessionStorage.getItem("pendingBooking");
      if (pendingBooking) {
        try {
          const bookingData = JSON.parse(pendingBooking);
          console.log("⚠️ Fetching deal from pending booking:", bookingData);
          fetchDealDetails(bookingData.dealId);
          sessionStorage.removeItem("pendingBooking");
        } catch (e) {
          console.error("Error parsing pending booking:", e);
          setError("Failed to load deal information");
        }
      } else {
        setError("No deal selected. Please select a deal to book.");
      }
    }
  }, [location]);

  // STABILIZATION FIX: Fetch single deal by ID instead of loading ALL offers
  // Previously fetched up to 1000 offers and filtered client-side — wasteful
  // on mobile networks and O(n) when O(1) is available via /offers/:id endpoint.
  const fetchDealDetails = async (dealId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE}/api/v1/offers/${dealId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        },
      );

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          console.log("✅ Found deal:", result.data);
          setDeal(result.data);
        } else {
          setError(
            "Deal not found or no longer available. The deal may have expired or the partner may not be approved.",
          );
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData?.message ?? errorData?.error ?? "Failed to load deal details");
      }
    } catch (err) {
      console.error("Error fetching deal:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Screen 1: Handle selection submission -> move to review
  const handleSelectionSubmit = (e) => {
    e.preventDefault();
    setError("");

    // Validate required fields for dining and events
    const needsDateAndTime =
      deal?.service_type === "dining" || deal?.service_type === "events";

    if (needsDateAndTime && !bookingDate) {
      setError("Please select a booking date");
      return;
    }

    if (needsDateAndTime && !bookingTime) {
      setError("Please select a booking time");
      return;
    }

    // Move to review screen
    setCurrentScreen(SCREEN_REVIEW);
  };

  // Screen 2: Handle final booking submission
  const handleBookingSubmit = async () => {
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please login to book deals");
        navigate("/login");
        return;
      }

      if (!deal) {
        setError("Deal information is missing");
        return;
      }

      // Prepare booking data
      const bookingData = {
        offer_id: deal.id,
        num_tickets: numTickets,
        special_requests: specialRequests || null,
      };

      // ALWAYS send booking_date and booking_time for all service types
      // This prevents the backend from defaulting to server time (which can show 12:00 AM)
      if (bookingDate) {
        bookingData.booking_date = bookingDate;
      }
      if (bookingTime) {
        bookingData.booking_time = bookingTime;
      }

      // Add dining-specific reservation data
      if (deal.service_type === "dining" && bookingDate) {
        bookingData.reservation_data = {
          date: bookingDate,
          time: bookingTime || "19:00",
          partySize: numTickets,
          specialRequests: specialRequests,
        };
      }

      console.log("📋 Submitting booking:", bookingData);

      const response = await fetch(`${API_BASE}/api/v1/bookings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingData),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        setBookingResult(result.data);
        setCurrentScreen(SCREEN_CONFIRMATION);
        console.log("✅ Booking created:", result.data);
      } else {
        const errorMsg =
          result?.message ?? result?.error ?? "Failed to create booking";
        console.error("❌ Booking failed:", {
          status: response.status,
          error: errorMsg,
          dealId: deal?.id,
          dealTitle: deal?.title,
          partnerId: deal?.partner_id,
        });

        // Prefer server message when it gives an actionable fix (e.g. "Admin must approve the partner")
        const isActionable = typeof errorMsg === 'string' && (errorMsg.includes('Admin must approve') || errorMsg.includes('Partners section'));
        if (isActionable) {
          setError(errorMsg);
        } else if (
          errorMsg.includes("not found") ||
          errorMsg.includes("expired") ||
          errorMsg.includes("not approved")
        ) {
          setError(
            `This deal is no longer available for booking. It may have expired or the partner is not approved. Please try selecting a different deal.`,
          );
        } else {
          setError(errorMsg);
        }
      }
    } catch (err) {
      console.error("Booking error:", err);
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const calculateTotal = () => {
    if (!deal) return 0;
    const price = parseFloat(
      deal.discounted_price || deal.original_price || deal.price || 0,
    );
    return price * numTickets;
  };

  const formatPrice = (price) => {
    if (!price) return "₹0";
    return `₹${parseFloat(price).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    try {
      return new Intl.DateTimeFormat("en-IN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }).format(new Date(dateString));
    } catch (e) {
      return dateString;
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return "N/A";
    try {
      // Handle both "HH:MM" and full datetime strings
      const time = timeString.includes("T")
        ? new Date(timeString)
        : new Date(`2000-01-01T${timeString}`);
      return new Intl.DateTimeFormat("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(time);
    } catch (e) {
      return timeString;
    }
  };

  // Loading state
  if (loading && !deal) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal">
            <p>Loading deal details...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (error && !deal && currentScreen === SCREEN_SELECTION) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal">
            <h2 className="elizian-auth-modal-title">Booking Error</h2>
            <p className="elizian-auth-error">{error}</p>
            <button
              className="elizian-auth-button"
              onClick={() => navigate("/home")}
            >
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: Confirmation
  if (currentScreen === SCREEN_CONFIRMATION && bookingResult) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
            <div style={{ padding: "1.5rem" }}>
              {/* Header */}
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>✅</div>
                <h2 className="elizian-auth-modal-title" style={{ margin: "0 0 0.25rem 0" }}>Booking Confirmed!</h2>
                <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
                  Your voucher has been generated successfully
                </p>
              </div>

              {/* Voucher Card */}
              <div style={{
                background: "#fff",
                border: "1.5px solid #e5e7eb",
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                marginBottom: "1.25rem",
              }}>
                {/* Voucher Header - Reference */}
                <div style={{
                  background: "linear-gradient(135deg, #004f4a, #059669)",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
                      Booking Reference
                    </div>
                    <div style={{ color: "#fff", fontWeight: "700", fontSize: "1.1rem", fontFamily: "monospace", letterSpacing: "0.04em" }}>
                      {bookingResult.booking_reference || bookingResult.id}
                    </div>
                  </div>
                  <div style={{
                    background: "rgba(255,255,255,0.2)",
                    borderRadius: "6px",
                    padding: "4px 10px",
                    color: "#fff",
                    fontSize: "0.7rem",
                    fontWeight: "600",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}>
                    {bookingResult.voucher_state || bookingResult.status || "Active"}
                  </div>
                </div>

                {/* Deal & Partner Info */}
                <div style={{ padding: "1.25rem" }}>
                  {/* Deal Title */}
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "#1f2937", marginBottom: "2px" }}>
                      {deal?.title || bookingResult.deal_title || "N/A"}
                    </div>
                    {deal?.service_type && (
                      <span style={{
                        display: "inline-block",
                        background: "#f0fdf4",
                        color: "#059669",
                        fontSize: "0.7rem",
                        fontWeight: "600",
                        padding: "2px 8px",
                        borderRadius: "4px",
                        textTransform: "uppercase",
                        letterSpacing: "0.03em",
                      }}>
                        {deal.service_type}
                      </span>
                    )}
                  </div>

                  {/* Partner / Venue Details */}
                  <div style={{
                    background: "#f9fafb",
                    borderRadius: "10px",
                    padding: "0.875rem",
                    marginBottom: "1rem",
                    border: "1px solid #f3f4f6",
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
                      <div style={{ fontSize: "1.25rem", marginTop: "1px" }}>🏢</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: "600", fontSize: "0.95rem", color: "#1f2937", marginBottom: "2px" }}>
                          {deal?.partner_name || deal?.location || "Partner Venue"}
                        </div>
                        {deal?.partner_address && (
                          <div style={{ color: "#6b7280", fontSize: "0.8rem", lineHeight: "1.4", marginBottom: "4px" }}>
                            📍 {deal.partner_address}
                          </div>
                        )}
                        {deal?.partner_phone && (
                          <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                            📞 {deal.partner_phone}
                          </div>
                        )}
                        {deal?.partner_email && (
                          <div style={{ color: "#6b7280", fontSize: "0.8rem" }}>
                            ✉️ {deal.partner_email}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Dashed Divider */}
                  <div style={{
                    borderTop: "1.5px dashed #d1d5db",
                    margin: "0 -1.25rem 1rem -1.25rem",
                    position: "relative",
                  }}>
                    <div style={{
                      position: "absolute", top: "-10px", left: "-10px",
                      width: "20px", height: "20px", borderRadius: "50%",
                      background: "#fff", border: "1.5px solid #e5e7eb", borderLeft: "none", borderBottom: "none",
                    }} />
                    <div style={{
                      position: "absolute", top: "-10px", right: "-10px",
                      width: "20px", height: "20px", borderRadius: "50%",
                      background: "#fff", border: "1.5px solid #e5e7eb", borderRight: "none", borderBottom: "none",
                    }} />
                  </div>

                  {/* Booking Details Grid */}
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "0.875rem",
                    marginBottom: "1rem",
                  }}>
                    {/* Date */}
                    {bookingDate && (
                      <div>
                        <div style={{ color: "#9ca3af", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                          Date
                        </div>
                        <div style={{ fontWeight: "600", fontSize: "0.9rem", color: "#1f2937" }}>
                          {formatDate(bookingDate)}
                        </div>
                      </div>
                    )}

                    {/* Time */}
                    {bookingTime && (
                      <div>
                        <div style={{ color: "#9ca3af", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                          Time
                        </div>
                        <div style={{ fontWeight: "600", fontSize: "0.9rem", color: "#1f2937" }}>
                          {formatTime(bookingTime)}
                        </div>
                      </div>
                    )}

                    {/* Guests */}
                    <div>
                      <div style={{ color: "#9ca3af", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                        {deal?.service_type === "dining" ? "Guests" : "Tickets"}
                      </div>
                      <div style={{ fontWeight: "600", fontSize: "0.9rem", color: "#1f2937" }}>
                        {numTickets}
                      </div>
                    </div>

                    {/* Booked By */}
                    <div>
                      <div style={{ color: "#9ca3af", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                        Booked By
                      </div>
                      <div style={{ fontWeight: "600", fontSize: "0.9rem", color: "#1f2937" }}>
                        {user?.name || user?.full_name || "You"}
                      </div>
                    </div>
                  </div>

                  {/* Special Requests */}
                  {specialRequests && (
                    <div style={{ marginBottom: "1rem" }}>
                      <div style={{ color: "#9ca3af", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "2px" }}>
                        Special Requests
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "#4b5563", fontStyle: "italic" }}>
                        {specialRequests}
                      </div>
                    </div>
                  )}

                  {/* Price Summary */}
                  <div style={{
                    background: "#f0fdf4",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "1rem",
                  }}>
                    <div style={{ fontSize: "0.85rem", color: "#374151" }}>Total Amount</div>
                    <div style={{ fontWeight: "700", fontSize: "1.15rem", color: "#059669" }}>
                      {formatPrice(calculateTotal())}
                    </div>
                  </div>

                  {/* Validity / Expiry */}
                  {bookingResult.expires_at && (
                    <div style={{
                      background: "#fffbeb",
                      borderRadius: "8px",
                      padding: "0.625rem 0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      marginBottom: "1rem",
                      border: "1px solid #fde68a",
                    }}>
                      <span style={{ fontSize: "1rem" }}>⏰</span>
                      <div style={{ fontSize: "0.8rem", color: "#92400e" }}>
                        <strong>Valid until:</strong> {formatDate(bookingResult.expires_at)}
                      </div>
                    </div>
                  )}

                  {/* Payment Instructions */}
                  <div style={{
                    background: "#f0f9ff",
                    borderRadius: "8px",
                    padding: "0.75rem",
                    border: "1px solid #bae6fd",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <span style={{ fontSize: "1rem" }}>💳</span>
                      <span style={{ fontWeight: "600", fontSize: "0.85rem", color: "#0369a1" }}>How to Redeem</span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "#64748b", lineHeight: "1.5" }}>
                      Visit the partner venue and show your booking reference or QR code. Pay the bill amount directly at the venue to redeem your deal.
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="button"
                  className="elizian-auth-button"
                  onClick={() => navigate("/bookings")}
                  style={{
                    background: "linear-gradient(135deg, #059669, #047857)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "10px",
                    padding: "14px 28px",
                    fontSize: "16px",
                    fontWeight: 600,
                    minWidth: "160px",
                    cursor: "pointer",
                    boxShadow: "0 6px 18px rgba(5, 150, 105, 0.35)",
                    transition: "all 0.25s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-2px)";
                    e.currentTarget.style.boxShadow =
                      "0 10px 26px rgba(5, 150, 105, 0.45)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 6px 18px rgba(5, 150, 105, 0.35)";
                  }}
                >
                  View My Bookings
                </button>

                <button
                  type="button"
                  className="elizian-auth-button"
                  onClick={() => navigate("/home")}
                  style={{
                    background: "#fff",
                    color: "#374151",
                    border: "1.5px solid #d1d5db",
                    borderRadius: "10px",
                    padding: "14px 28px",
                    fontSize: "16px",
                    fontWeight: 600,
                    minWidth: "160px",
                    cursor: "pointer",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
                    transition: "all 0.25s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f9fafb";
                    e.currentTarget.style.borderColor = "#059669";
                    e.currentTarget.style.color = "#059669";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "#fff";
                    e.currentTarget.style.borderColor = "#d1d5db";
                    e.currentTarget.style.color = "#374151";
                  }}
                >
                  Browse More Deals
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Review & Confirm
  if (currentScreen === SCREEN_REVIEW) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
            <button
              className="elizian-auth-modal-close"
              onClick={() => setCurrentScreen(SCREEN_SELECTION)}
              aria-label="Go back"
            >
              ← Back
            </button>

            <h2 className="elizian-auth-modal-title">Review & Confirm</h2>

            {error && (
              <div className="elizian-auth-error" role="alert">
                {error}
              </div>
            )}

            {/* Deal Summary */}
            {deal && (
              <div
                style={{
                  background: "#f8f9fa",
                  padding: "1.5rem",
                  borderRadius: "12px",
                  marginBottom: "1.5rem",
                  borderLeft: "4px solid #059669",
                }}
              >
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#333" }}>
                  {deal.title}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.25rem 0", color: "#4b5563", fontSize: "0.9rem" }}>
                  <span>🏢</span>
                  <span style={{ fontWeight: "500" }}>{deal.partner_name || deal.location}</span>
                </div>
                {deal.partner_address && (
                  <div style={{ color: "#6b7280", fontSize: "0.8rem", margin: "0 0 0.5rem 0", paddingLeft: "1.5rem" }}>
                    📍 {deal.partner_address}
                  </div>
                )}
                <div
                  style={{
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    color: "#059669",
                  }}
                >
                  {formatPrice(
                    deal.discounted_price || deal.original_price || deal.price,
                  )}
                </div>
              </div>
            )}

            {/* Booking Details */}
            <div
              style={{
                background: "#f0f9ff",
                padding: "1.5rem",
                borderRadius: "12px",
                marginBottom: "1.5rem",
              }}
            >
              <h4 style={{ margin: "0 0 1rem 0", color: "#333" }}>
                Booking Details
              </h4>

              {bookingDate && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Date
                  </div>
                  <div style={{ fontWeight: "600" }}>
                    {formatDate(bookingDate)}
                  </div>
                </div>
              )}

              {bookingTime && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Time
                  </div>
                  <div style={{ fontWeight: "600" }}>
                    {formatTime(bookingTime)}
                  </div>
                </div>
              )}

              <div style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    color: "#666",
                    fontSize: "0.9rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {deal?.service_type === "dining"
                    ? "Number of Guests"
                    : "Number of Tickets"}
                </div>
                <div style={{ fontWeight: "600" }}>{numTickets}</div>
              </div>

              {specialRequests && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Special Requests
                  </div>
                  <div style={{ fontWeight: "600" }}>{specialRequests}</div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid #ddd",
                  paddingTop: "0.75rem",
                  marginTop: "0.75rem",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: "1.2rem",
                    fontWeight: "bold",
                    color: "#059669",
                  }}
                >
                  <span>Total Amount:</span>
                  <span>{formatPrice(calculateTotal())}</span>
                </div>
              </div>
            </div>

            {/* Payment Notice */}
            <div
              style={{
                background: "#fff3cd",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                border: "1px solid #ffc107",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  color: "#856404",
                  marginBottom: "0.5rem",
                }}
              >
                💳 Payment at Venue
              </div>
              <div style={{ fontSize: "0.9rem", color: "#856404" }}>
                You will pay directly at the partner venue when you arrive. This
                booking reserves your spot.
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                type="button"
                onClick={() => setCurrentScreen(SCREEN_SELECTION)}
                style={{
                  flex: 1,
                  background: "transparent",
                  color: "#6b7280",
                  border: "1.5px solid #d1d5db",
                  borderRadius: "10px",
                  padding: "14px 20px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f9fafb";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 14px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                Edit Details
              </button>

              <button
                type="button"
                onClick={handleBookingSubmit}
                disabled={loading}
                style={{
                  flex: 1,
                  background: loading
                    ? "#d1d5db"
                    : "linear-gradient(135deg, #059669, #047857)",
                  color: "#fff",
                  border: "none",
                  borderRadius: "10px",
                  padding: "14px 20px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: loading ? "not-allowed" : "pointer",
                  transition: "all 0.25s ease",
                  boxShadow: loading
                    ? "none"
                    : "0 6px 18px rgba(5, 150, 105, 0.35)",
                }}
              >
                {loading ? "Processing..." : "Confirm Booking"}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Screen 1: Selection (default)
  return (
    <div className="elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
          <button
            className="elizian-auth-modal-close"
            onClick={() => navigate("/home")}
            aria-label="Close"
          >
            &times;
          </button>

          <h2 className="elizian-auth-modal-title">Book Your Experience</h2>

          {deal && (
            <div
              style={{
                background: "#f8f9fa",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                borderLeft: "4px solid #059669",
              }}
            >
              <h3 style={{ margin: "0 0 0.5rem 0", color: "#333" }}>
                {deal.title || deal.name}
              </h3>
              <p
                style={{
                  margin: "0 0 0.5rem 0",
                  color: "#666",
                  fontSize: "0.9rem",
                }}
              >
                {deal.partner_name || deal.location}
              </p>
              {deal.description && (
                <p
                  style={{
                    margin: "0 0 0.5rem 0",
                    color: "#666",
                    fontSize: "0.85rem",
                  }}
                >
                  {deal.description.substring(0, 100)}...
                </p>
              )}
              <div
                style={{
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#059669",
                }}
              >
                {formatPrice(
                  deal.discounted_price || deal.original_price || deal.price,
                )}
                {deal.original_price && deal.discounted_price && (
                  <span
                    style={{
                      fontSize: "0.9rem",
                      color: "#999",
                      textDecoration: "line-through",
                      marginLeft: "0.5rem",
                    }}
                  >
                    {formatPrice(deal.original_price)}
                  </span>
                )}
              </div>
            </div>
          )}

          {user && (
            <div
              style={{
                background: "#e3f2fd",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  fontWeight: "600",
                  marginBottom: "0.5rem",
                  color: "#333",
                }}
              >
                Booking for:
              </div>
              <div style={{ fontSize: "0.9rem", color: "#666" }}>
                <div>
                  <strong>Name:</strong> {user.first_name || ""}{" "}
                  {user.last_name || ""}
                </div>
                <div>
                  <strong>Email:</strong> {user.email || "N/A"}
                </div>
                <div>
                  <strong>Phone:</strong> {user.phone_number || "N/A"}
                </div>
              </div>
            </div>
          )}

          <form className="elizian-auth-form" onSubmit={handleSelectionSubmit}>
            {error && (
              <div className="elizian-auth-error" role="alert">
                {error}
              </div>
            )}
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label" htmlFor="numTickets">
                {deal?.service_type === "dining"
                  ? "Number of Guests"
                  : "Number of Tickets"}
              </label>
              <div style={{
                display: "flex",
                alignItems: "center",
                gap: "0",
                border: "1.5px solid #d1d5db",
                borderRadius: "10px",
                overflow: "hidden",
                background: "#fff",
                width: "fit-content",
              }}>
                <button
                  type="button"
                  aria-label="Decrease"
                  disabled={numTickets <= 1}
                  onClick={() => setNumTickets(Math.max(1, numTickets - 1))}
                  style={{
                    width: "48px",
                    height: "48px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    borderRight: "1.5px solid #d1d5db",
                    fontSize: "1.35rem",
                    fontWeight: "300",
                    color: numTickets <= 1 ? "#d1d5db" : "#004f4a",
                    cursor: numTickets <= 1 ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { if (numTickets > 1) e.currentTarget.style.background = "#f3f4f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
                <div
                  id="numTickets"
                  role="spinbutton"
                  aria-valuenow={numTickets}
                  aria-valuemin={1}
                  aria-valuemax={deal?.max_redemptions || 10}
                  aria-label={deal?.service_type === "dining" ? "Number of guests" : "Number of tickets"}
                  style={{
                    minWidth: "56px",
                    textAlign: "center",
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "#1f2937",
                    padding: "0 8px",
                    lineHeight: "48px",
                    userSelect: "none",
                  }}
                >
                  {numTickets}
                </div>
                <button
                  type="button"
                  aria-label="Increase"
                  disabled={numTickets >= (deal?.max_redemptions || 10)}
                  onClick={() => setNumTickets(Math.min(deal?.max_redemptions || 10, numTickets + 1))}
                  style={{
                    width: "48px",
                    height: "48px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    borderLeft: "1.5px solid #d1d5db",
                    fontSize: "1.35rem",
                    fontWeight: "300",
                    color: numTickets >= (deal?.max_redemptions || 10) ? "#d1d5db" : "#004f4a",
                    cursor: numTickets >= (deal?.max_redemptions || 10) ? "not-allowed" : "pointer",
                    transition: "background 0.15s",
                    userSelect: "none",
                  }}
                  onMouseEnter={(e) => { if (numTickets < (deal?.max_redemptions || 10)) e.currentTarget.style.background = "#f3f4f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                </button>
              </div>
            </div>
            {(deal?.service_type === "dining" ||
              deal?.service_type === "events") && (
              <>
                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label" htmlFor="bookingDate">
                    {deal?.service_type === "events"
                      ? "Event Date"
                      : "Booking Date"}
                  </label>
                  <input
                    id="bookingDate"
                    ref={dateRef}
                    onClick={() => dateRef.current?.showPicker()}
                    type="date"
                    className="elizian-auth-input"
                    value={bookingDate}
                    onChange={(e) => setBookingDate(e.target.value)}
                    min={new Date().toISOString().split("T")[0]}
                    required
                    aria-required="true"
                  />
                </div>

                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label" htmlFor="bookingTime">
                    {deal?.service_type === "events"
                      ? "Event Time"
                      : "Booking Time"}
                  </label>

                  <input
                    id="bookingTime"
                    name="bookingTime"
                    type="time"
                    ref={bookingTimeRef}
                    className="elizian-auth-input elizian-time-input"
                    value={bookingTime}
                    onChange={(e) => setBookingTime(e.target.value)}
                    onClick={() => bookingTimeRef.current?.showPicker?.()}
                    required={Boolean(bookingDate)}
                    disabled={!bookingDate}
                    aria-required={Boolean(bookingDate)}
                    aria-disabled={!bookingDate}
                    aria-label="Select booking time"
                  />

                  {!bookingDate && (
                    <small
                      style={{
                        color: "#666",
                        fontSize: "0.85rem",
                        marginTop: "0.25rem",
                        display: "block",
                      }}
                    >
                      Please select a date first
                    </small>
                  )}
                </div>
              </>
            )}
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label" htmlFor="specialRequests">
                Special Requests (Optional)
              </label>
              <textarea
                id="specialRequests"
                className="elizian-auth-input"
                rows="3"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
                placeholder="Any special requests or dietary requirements..."
                aria-label="Special requests"
              />
            </div>
            <div
              style={{
                background: "#f0f9ff",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span>
                  Price per{" "}
                  {deal?.service_type === "dining" ? "guest" : "ticket"}:
                </span>
                <span>
                  {formatPrice(
                    deal?.discounted_price ||
                      deal?.original_price ||
                      deal?.price ||
                      0,
                  )}
                </span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                }}
              >
                <span>Quantity:</span>
                <span>{numTickets}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#059669",
                  borderTop: "1px solid #ddd",
                  paddingTop: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                <span>Total:</span>
                <span>{formatPrice(calculateTotal())}</span>
              </div>
            </div>
            <button
              type="submit"
              style={{
                background: "linear-gradient(135deg, #059669, #047857)",
                color: "#fff",
                border: "none",
                borderRadius: "10px",
                padding: "14px 24px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                boxShadow: "0 6px 18px rgba(5, 150, 105, 0.35)",
                transition: "all 0.25s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow =
                  "0 10px 26px rgba(5, 150, 105, 0.45)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow =
                  "0 6px 18px rgba(5, 150, 105, 0.35)";
              }}
            >
              Continue to Review
            </button>
            <button
              type="button"
              onClick={() => navigate("/home")}
              style={{
                background: "transparent",
                color: "#6b7280",
                border: "1.5px solid #d1d5db",
                borderRadius: "10px",
                padding: "14px 24px",
                fontSize: "16px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all 0.25s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#f9fafb";
                e.currentTarget.style.color = "#374151";
                e.currentTarget.style.transform = "translateY(-2px)";
                e.currentTarget.style.boxShadow = "0 6px 14px rgba(0,0,0,0.08)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "#6b7280";
                e.currentTarget.style.transform = "translateY(0)";
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default EventBooking;
