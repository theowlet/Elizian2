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

  const fetchDealDetails = async (dealId) => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE}/api/v1/offers?limit=1000&is_active=true`,
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
          const foundDeal = Array.isArray(result.data)
            ? result.data.find((d) => d.id === dealId)
            : null;

          if (foundDeal) {
            console.log("✅ Found deal:", foundDeal);
            setDeal(foundDeal);
          } else {
            setError(
              `Deal not found or no longer available. The deal may have expired or the partner may not be approved.`,
            );
          }
        } else {
          setError(result.error || "Failed to load deal details");
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.error || "Failed to load deal details");
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

      // Add date/time for dining reservations
      if (deal.service_type === "dining" && bookingDate) {
        bookingData.reservation_data = {
          date: bookingDate,
          time: bookingTime || "19:00",
          partySize: numTickets,
          specialRequests: specialRequests,
        };
      }

      // Add date/time for event bookings
      if (deal.service_type === "events" && bookingDate) {
        bookingData.booking_date = bookingDate;
        // CRITICAL: Only use fallback if bookingTime is truly empty, not if it's a valid time string
        bookingData.booking_time = bookingTime || "19:00";
        console.log("📅 Event booking time:", {
          bookingTime,
          final: bookingData.booking_time,
          bookingDate: bookingData.booking_date,
        });
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
          result.error || result.message || "Failed to create booking";
        console.error("❌ Booking failed:", {
          status: response.status,
          error: errorMsg,
          dealId: deal?.id,
          dealTitle: deal?.title,
          partnerId: deal?.partner_id,
        });

        if (
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
            <div style={{ textAlign: "center", padding: "2rem" }}>
              <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>✅</div>
              <h2 className="elizian-auth-modal-title">Booking Confirmed!</h2>

              <div
                style={{
                  background: "#f0f9ff",
                  padding: "1.5rem",
                  borderRadius: "12px",
                  margin: "1.5rem 0",
                  textAlign: "left",
                }}
              >
                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Booking Reference
                  </div>
                  <div
                    style={{
                      fontWeight: "bold",
                      fontSize: "1.1rem",
                      color: "#059669",
                    }}
                  >
                    {bookingResult.booking_reference || bookingResult.id}
                  </div>
                </div>

                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Deal
                  </div>
                  <div style={{ fontWeight: "600" }}>
                    {deal?.title || "N/A"}
                  </div>
                </div>

                {bookingDate && (
                  <div style={{ marginBottom: "1rem" }}>
                    <div
                      style={{
                        color: "#666",
                        fontSize: "0.9rem",
                        marginBottom: "0.25rem",
                      }}
                    >
                      Date & Time
                    </div>
                    <div style={{ fontWeight: "600" }}>
                      {formatDate(bookingDate)} at {formatTime(bookingTime)}
                    </div>
                  </div>
                )}

                <div style={{ marginBottom: "1rem" }}>
                  <div
                    style={{
                      color: "#666",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Guests/Tickets
                  </div>
                  <div style={{ fontWeight: "600" }}>{numTickets}</div>
                </div>

                <div
                  style={{
                    padding: "1rem",
                    background: "#fff",
                    borderRadius: "8px",
                    border: "2px solid #059669",
                    marginTop: "1rem",
                  }}
                >
                  <div
                    style={{
                      fontWeight: "bold",
                      color: "#059669",
                      marginBottom: "0.5rem",
                    }}
                  >
                    💳 Payment Instructions
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#666" }}>
                    Please pay directly at the partner venue when you arrive.
                    Show your booking reference to redeem.
                  </div>
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: "1rem",
                  justifyContent: "center",
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="elizian-auth-button"
                  onClick={() => navigate("/bookings")}
                  style={{
                    background: "linear-gradient(135deg, #059669, #047857)",
                    minWidth: "150px",
                  }}
                >
                  View My Bookings
                </button>
                <button
                  className="elizian-auth-button"
                  onClick={() => navigate("/home")}
                  style={{
                    background: "transparent",
                    color: "#666",
                    border: "1px solid #ddd",
                    minWidth: "150px",
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
                <p
                  style={{
                    margin: "0 0 0.5rem 0",
                    color: "#666",
                    fontSize: "0.9rem",
                  }}
                >
                  {deal.partner_name || deal.location}
                </p>
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
              <input
                id="numTickets"
                type="number"
                className="elizian-auth-input"
                min="1"
                max={deal?.max_redemptions || 10}
                value={numTickets}
                onChange={(e) =>
                  setNumTickets(Math.max(1, parseInt(e.target.value) || 1))
                }
                required
                aria-required="true"
              />
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
