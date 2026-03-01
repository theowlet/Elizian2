import React, { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import "../styles/auth.css";
import { inferBookingMode, ONLINE_TIME_SLOT, PARTNER_CONFIRMATION } from "../config/bookingModes";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const isDev = import.meta.env.DEV;

/** Category-specific banner text for PARTNER_CONFIRMATION reschedule */
const getPartnerBannerText = (serviceType) => {
  const st = (serviceType || "").toLowerCase();
  if (st === "spa-and-salon" || st === "spa") return "Select your preferred date. Contact the salon to confirm your appointment time.";
  if (st === "wellness") return "Select your preferred date. Contact the studio to confirm your session time.";
  if (st === "healthcare") return "Select your preferred date. Contact the clinic to schedule your appointment.";
  if (st === "travel") return "Select your preferred date. Contact the travel partner for check-in or pickup details.";
  return "Select your preferred date. Please contact the partner for the available time slot.";
};

const RescheduleBooking = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  // FIX #13: Slot picker state for events/dining
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsLoading, setSlotsLoading] = useState(false);

  const bookingTimeRef = useRef(null);

  const todayStr = new Date().toISOString().split("T")[0];

  // Determine if this is a time-based service (dining, events, shows) or date-only (spa, healthcare, etc.)
  const isPartnerConfirmation = useMemo(
    () => booking ? inferBookingMode(booking) === PARTNER_CONFIRMATION : false,
    [booking]
  );

  useEffect(() => {
    if (!booking && id) {
      loadBooking();
    } else if (booking) {
      // Pre-fill with existing date; for past bookings use today so user picks a valid date
      if (booking.booking_date) {
        const date = new Date(booking.booking_date);
        const dateStr = date.toISOString().split("T")[0];
        const isPast = dateStr < todayStr;
        setNewDate(isPast ? todayStr : dateStr);
      }
      // Pre-fill time only for time-based services (not partner-confirmation / date-only)
      const mode = inferBookingMode(booking);
      if (mode !== PARTNER_CONFIRMATION && booking.booking_time) {
        setNewTime(booking.booking_time);
      }
    }
  }, [id, booking]);

  // FIX #13: Fetch available slots when date changes (for time-based services)
  const offerId = booking?.deal_id || booking?.offer_id || null;
  useEffect(() => {
    if (!offerId || !newDate || isPartnerConfirmation) {
      setAvailableSlots([]);
      return;
    }
    let cancelled = false;
    const prevTime = newTime;
    (async () => {
      setSlotsLoading(true);
      setAvailableSlots([]);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE}/api/v1/offers/${offerId}/available-slots?date=${newDate}&partySize=${booking?.num_tickets || booking?.num_guests || 1}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (cancelled) return;
        const json = await res.json();
        const slots = Array.isArray(json.data?.slots) ? json.data.slots : (Array.isArray(json.data) ? json.data : []);
        if (json.success && slots.length > 0) {
          setAvailableSlots(slots);
          // Preserve selection if still valid
          if (prevTime && slots.some(s => s.time === prevTime && s.available !== false)) {
            setNewTime(prevTime);
          } else {
            setNewTime("");
          }
        } else {
          setNewTime("");
        }
      } catch (e) {
        if (isDev) console.error("Fetch reschedule slots error:", e);
        setNewTime("");
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [offerId, newDate, isPartnerConfirmation]);

  const loadBooking = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      const response = await fetch(`${API_BASE}/api/v1/bookings/${id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setBooking(result.data);
          if (result.data.booking_date) {
            const date = new Date(result.data.booking_date);
            const dateStr = date.toISOString().split("T")[0];
            const today = new Date().toISOString().split("T")[0];
            setNewDate(dateStr < today ? today : dateStr);
          }
          // Pre-fill time only for time-based services
          const mode = inferBookingMode(result.data);
          if (mode !== PARTNER_CONFIRMATION && result.data.booking_time) {
            setNewTime(result.data.booking_time);
          }
        }
      } else {
        setError("Failed to load booking details");
      }
    } catch (err) {
      console.error("Error loading booking:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        setError("Please login to reschedule");
        navigate("/login");
        return;
      }

      if (!newDate) {
        setError("Please select a new date");
        setLoading(false);
        return;
      }

      if (!isPartnerConfirmation && !newTime) {
        setError("Please select a new time");
        setLoading(false);
        return;
      }

      // Build reschedule payload: time-based services send date + time;
      // partner-confirmation (spa, healthcare, etc.) send date only
      const reschedulePayload = { booking_date: newDate };
      if (!isPartnerConfirmation && newTime) {
        reschedulePayload.booking_time = newTime;
      }

      const response = await fetch(`${API_BASE}/api/v1/bookings/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reschedulePayload),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Redirect to booking details
        navigate(`/booking/${id}`, { state: { booking: result.data } });
      } else {
        setError(
          result?.message ?? result?.error ?? "Failed to reschedule booking",
        );
      }
    } catch (err) {
      console.error("Reschedule error:", err);
      setError(err.message || "Network error. Please try again.");
    } finally {
      setLoading(false);
    }
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

  if (loading && !booking) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal">
            <p>Loading booking details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal">
            <h2 className="elizian-auth-modal-title">Error</h2>
            <p className="elizian-auth-error">{error || "Booking not found"}</p>
            <button
              className="elizian-auth-button"
              onClick={() => navigate("/bookings")}
            >
              Back to Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
          <button
            className="elizian-auth-modal-close"
            onClick={() => navigate(`/booking/${id}`)}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="elizian-auth-modal-title">Reschedule Booking</h2>
          <div
            style={{
              background: "#f8f9fa",
              padding: "1rem",
              borderRadius: "8px",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ marginBottom: "0.5rem" }}>
              <strong>Current Booking:</strong>
            </div>
            <div style={{ fontSize: "0.9rem", color: "#666" }}>
              <div
                style={{
                  color: "#047857",
                  fontWeight: 600,
                  fontSize: "14px",
                  textTransform: "capitalize",
                }}
              >
                {booking.status || "N/A"}
              </div>
              <div>Date: {formatDate(booking.booking_date)}</div>
              {!isPartnerConfirmation && booking.booking_time && <div>Time: {booking.booking_time}</div>}
              {isPartnerConfirmation && (
                <div style={{ color: "#92400e", fontStyle: "italic", fontSize: "0.85rem" }}>
                  Contact partner for time slot
                </div>
              )}
            </div>
          </div>
          <form className="elizian-auth-form" onSubmit={handleSubmit}>
            {error && (
              <div className="elizian-auth-error" role="alert">
                {error}
              </div>
            )}
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label" htmlFor="newDate">
                New Booking Date
              </label>
              <input
                id="newDate"
                name="newDate"
                type="date"
                ref={bookingTimeRef}
                className="elizian-auth-input elizian-time-input"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                onClick={() => bookingTimeRef.current?.showPicker?.()}
                min={todayStr}
                required
              />
              <small style={{ color: "#6b7280", fontSize: "0.85rem", marginTop: "0.25rem", display: "block" }}>
                Pick today or a future date. Past bookings can be rescheduled to a new date.
              </small>
            </div>
            {/* Time picker: only for time-based services (dining, events, shows) */}
            {!isPartnerConfirmation && (
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label" htmlFor="newTime">
                New Booking Time
              </label>

              {slotsLoading && (
                <small style={{ color: "#666", fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
                  Loading available slots…
                </small>
              )}

              {/* Slot button grid when slots are available */}
              {!slotsLoading && availableSlots.length > 0 ? (
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "10px 12px",
                  marginTop: "8px",
                  maxHeight: "260px",
                  overflowY: "auto",
                  paddingRight: "6px",
                }}>
                  {availableSlots.map((slot) => (
                    <button
                      key={slot.time || slot.id || slot.label}
                      type="button"
                      onClick={() => slot.available !== false && setNewTime(slot.time)}
                      disabled={slot.available === false}
                      style={{
                        padding: "12px 16px",
                        borderRadius: "10px",
                        border: newTime === slot.time ? "2px solid #004f4a" : "1px solid #d1d5db",
                        background: newTime === slot.time ? "#f0fdf4" : slot.available === false ? "#f3f4f6" : "#fff",
                        color: slot.available === false ? "#9ca3af" : "#1f2937",
                        cursor: slot.available === false ? "not-allowed" : "pointer",
                        fontSize: "0.9rem",
                        fontWeight: 500,
                      }}
                    >
                      {slot.label || slot.time}
                      {slot.available === false && " (Full)"}
                      {slot.remaining_seats != null && slot.remaining_seats <= 10 && slot.available !== false && (
                        <span style={{ display: "block", fontSize: "0.7rem", color: "#dc2626", marginTop: "2px" }}>
                          {slot.remaining_seats} {slot.remaining_seats === 1 ? "seat" : "seats"} left
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ) : !slotsLoading && (
                /* Fallback: raw time input when no slots loaded (e.g., partner hasn't configured operating hours) */
                <input
                  id="newTime"
                  type="time"
                  className="elizian-auth-input"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  required={!!newDate}
                  disabled={!newDate}
                  aria-required="true"
                  aria-disabled={!newDate}
                  onClick={(e) => {
                    if (newDate) {
                      e.currentTarget.showPicker?.();
                    }
                  }}
                />
              )}

              {!newDate && (
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
              {newDate && !newTime && !slotsLoading && (
                <small
                  style={{
                    color: "#d97706",
                    fontSize: "0.85rem",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  ⚠️ Please select a time slot{availableSlots.length > 0 ? "" : ". If not provided, it will default to 12:00 AM"}.
                </small>
              )}
            </div>
            )}

            {/* For partner-confirmation services, show info about contacting partner for time */}
            {isPartnerConfirmation && (
              <div
                style={{
                  background: "#fef3c7",
                  padding: "0.75rem 1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                  border: "1px solid #d97706",
                }}
              >
                <div style={{ fontSize: "0.9rem", color: "#78350f" }}>
                  📅 {getPartnerBannerText(booking?.service_type)}
                </div>
              </div>
            )}

            <div
              style={{
                background: "#fff3cd",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                border: "1px solid #ffc107",
              }}
            >
              <div style={{ fontSize: "0.9rem", color: "#856404" }}>
                <strong>Note:</strong> Rescheduling may be subject to
                availability and partner policies. Your booking {isPartnerConfirmation ? "date" : "date and time"}{" "}
                will be updated; the same voucher remains valid.
              </div>
            </div>

            <div style={{ display: "flex", gap: "1rem" }}>
              <button
                onClick={() => navigate(`/booking/${id}`)}
                style={{
                  padding: "0.5rem 1rem",
                  background: "transparent",
                  color: "#ef4444",
                  border: "1px solid #ef4444",
                  borderRadius: "8px",
                  cursor: "pointer",
                  fontSize: "0.9rem",
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="elizian-auth-button"
                disabled={loading || !newDate}
                style={{
                  padding: "10px 18px",
                  background:
                    loading || !newDate
                      ? "#d1d5db"
                      : "linear-gradient(135deg, #059669, #047857)",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "10px",
                  fontSize: "15px",
                  fontWeight: 600,
                  cursor: loading || !newDate ? "not-allowed" : "pointer",
                  boxShadow:
                    loading || !newDate
                      ? "none"
                      : "0 6px 18px rgba(5, 150, 105, 0.35)",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  if (loading || !newDate) return;
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 10px 24px rgba(5, 150, 105, 0.45)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 18px rgba(5, 150, 105, 0.35)";
                }}
              >
                {loading ? "Processing..." : "Confirm Reschedule"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default RescheduleBooking;
