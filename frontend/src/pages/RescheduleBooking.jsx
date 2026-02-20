import React, { useState, useEffect, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import "../styles/auth.css";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";

const RescheduleBooking = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");

  const bookingTimeRef = useRef(null);

  const todayStr = new Date().toISOString().split("T")[0];

  useEffect(() => {
    if (!booking && id) {
      loadBooking();
    } else if (booking) {
      // Pre-fill with existing date/time; for past bookings use today so user picks a valid date
      if (booking.booking_date) {
        const date = new Date(booking.booking_date);
        const dateStr = date.toISOString().split("T")[0];
        const isPast = dateStr < todayStr;
        setNewDate(isPast ? todayStr : dateStr);
      }
      if (booking.booking_time) {
        setNewTime(booking.booking_time);
      }
    }
  }, [id, booking]);

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
          if (result.data.booking_time) {
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

      if (!newTime) {
        setError("Please select a new time");
        setLoading(false);
        return;
      }

      // Note: Backend may need a specific reschedule endpoint
      // For now, we'll use a PUT to update the booking
      const response = await fetch(`${API_BASE}/api/v1/bookings/${id}`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          booking_date: newDate,
          booking_time: newTime, // Time is now required
        }),
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
              {booking.booking_time && <div>Time: {booking.booking_time}</div>}
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
            <div className="elizian-auth-form-group">
              <label
                className="elizian-auth-label"
                htmlFor="newTime"
                style={{ cursor: newDate ? "pointer" : "not-allowed" }}
                onClick={() => {
                  if (newDate) {
                    document.getElementById("newTime")?.focus();
                    document.getElementById("newTime")?.showPicker?.();
                  }
                }}
              >
                New Booking Time
              </label>

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
              {newDate && !newTime && (
                <small
                  style={{
                    color: "#d97706",
                    fontSize: "0.85rem",
                    marginTop: "0.25rem",
                    display: "block",
                  }}
                >
                  ⚠️ Please select a time. If not provided, it will default to
                  12:00 AM.
                </small>
              )}
            </div>

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
                availability and partner policies. Your booking date and time
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
