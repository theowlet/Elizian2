import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import Swal from "sweetalert2";
import "sweetalert2/dist/sweetalert2.min.css";
import "../styles/auth.css";
import { getBookingModeFromServiceType, ONLINE_TIME_SLOT, PARTNER_CONFIRMATION } from "../config/bookingModes";

const getServiceType = (deal) =>
  (deal?.service_type || deal?.serviceType || "").toString().toLowerCase().trim();

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const isDev = import.meta.env.DEV;

// Screen states
const SCREEN_SELECTION = "selection";
const SCREEN_REVIEW = "review";
const SCREEN_CONFIRMATION = "confirmation";

/**
 * Category-specific labels for party size and special requests.
 * Maps service_type to contextually appropriate labels.
 */
const getPartySizeLabel = (serviceType) => {
  const st = (serviceType || "").toLowerCase();
  if (st === "dining" || st === "restaurant") return "Number of Guests";
  if (st === "events") return "Number of Tickets";
  if (st === "spa-and-salon" || st === "spa") return "Number of Guests";
  if (st === "wellness") return "Number of Participants";
  if (st === "healthcare") return "Number of Patients";
  if (st === "travel") return "Number of Travellers";
  return "Quantity";
};

const getPartnerConfirmationBanner = (serviceType) => {
  const st = (serviceType || "").toLowerCase();
  if (st === "spa-and-salon" || st === "spa") return {
    title: "Contact the salon for appointment",
    description: "Appointment time is not available for online selection. Contact the salon to confirm your preferred time."
  };
  if (st === "wellness") return {
    title: "Contact the studio for session time",
    description: "Session time is not available for online selection. Contact the studio to confirm your preferred session."
  };
  if (st === "healthcare") return {
    title: "Contact the clinic for appointment",
    description: "Appointment time is not available for online selection. Contact the clinic to schedule your appointment."
  };
  if (st === "travel") return {
    title: "Contact partner for booking details",
    description: "Contact the travel partner for check-in, pickup, or activity timing details."
  };
  return {
    title: "Contact partner for time slot",
    description: "Time slot is not available for online selection. Contact the partner to confirm your preferred time."
  };
};

const getSpecialRequestsPlaceholder = (serviceType) => {
  const st = (serviceType || "").toLowerCase();
  if (st === "dining" || st === "restaurant") return "Any special requests or dietary requirements...";
  if (st === "events") return "Any special requirements or accessibility needs...";
  if (st === "spa-and-salon" || st === "spa") return "Pressure preference, skin sensitivity, allergies...";
  if (st === "wellness") return "Fitness level or health conditions...";
  if (st === "healthcare") return "Medical conditions or special requirements...";
  if (st === "travel") return "Travel preferences or accessibility requirements...";
  return "Any special requirements...";
};

const isTokenExpired = (token) => {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
};

const EventBooking = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const dateRef = useRef(null);
  const bookingTimeRef = useRef(null);
  const submittingRef = useRef(false);
  const [currentScreen, setCurrentScreen] = useState(SCREEN_SELECTION);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [slotSoldOutCanWaitlist, setSlotSoldOutCanWaitlist] = useState(false);
  const [joiningWaitlist, setJoiningWaitlist] = useState(false);
  const [waitlistSuccess, setWaitlistSuccess] = useState(false);
  const [waitlistEntry, setWaitlistEntry] = useState(null); // { position, estimated_wait_minutes, ... }

  // Get deal data from navigation state or sessionStorage
  const [deal, setDeal] = useState(null);
  const [user, setUser] = useState(null);
  const [bookingResult, setBookingResult] = useState(null);

  // Booking form state (Screen 1)
  const [numTickets, setNumTickets] = useState(1);
  const [specialRequests, setSpecialRequests] = useState("");
  const [bookingDate, setBookingDate] = useState("");
  const [bookingTime, setBookingTime] = useState("");
  const [availableSlots, setAvailableSlots] = useState([]);
  const [slotsEventDate, setSlotsEventDate] = useState(null); // event_date from slots API (for "not available on this day" message)
  const [slotsLoading, setSlotsLoading] = useState(false);

  useEffect(() => {
    // Get user info
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        setUser(JSON.parse(userStr));
      } catch (e) {
        if (isDev) console.error("Error parsing user data:", e);
      }
    }

    // Get deal data from location state (preferred - already validated)
    if (location.state?.deal) {
      if (isDev) console.log("Using deal from navigation state:", location.state.deal);
      setDeal(location.state.deal);
    } else if (location.state?.dealId) {
      if (isDev) console.log("Only dealId provided, fetching details...");
      fetchDealDetails(location.state.dealId);
    } else {
      // Check sessionStorage for pending booking
      const pendingBooking = sessionStorage.getItem("pendingBooking");
      if (pendingBooking) {
        try {
          const bookingData = JSON.parse(pendingBooking);
          if (isDev) console.log("Fetching deal from pending booking:", bookingData);
          fetchDealDetails(bookingData.dealId);
          sessionStorage.removeItem("pendingBooking");
        } catch (e) {
          if (isDev) console.error("Error parsing pending booking:", e);
          setError("Failed to load deal information");
        }
      } else {
        setError("No deal selected. Please select a deal to book.");
      }
    }
  }, [location]);

  // For single-day events: pre-select and lock booking date to event_date
  const eventDate = deal?.event_date || deal?.experience_metadata?.event_date;
  const eventDateStr = eventDate
    ? (typeof eventDate === "string" ? eventDate.split("T")[0] : eventDate instanceof Date ? eventDate.toISOString().split("T")[0] : null)
    : null;
  const isSingleDayEvent = Boolean(eventDateStr && getServiceType(deal) === "events");

  useEffect(() => {
    if (eventDateStr && getServiceType(deal) === "events") {
      setBookingDate(eventDateStr);
    }
  }, [eventDateStr, deal?.id]);

  // Fetch available slots when date changes (Dining: 30-min grid; Events: fixed slots)
  useEffect(() => {
    if (!deal?.id || !bookingDate || getBookingModeFromServiceType(getServiceType(deal)) !== ONLINE_TIME_SLOT) {
      setAvailableSlots([]);
      setSlotsEventDate(null);
      return;
    }
    let cancelled = false;
    // FIX #10: Capture current selection before re-fetch so we can preserve it if still valid
    const prevBookingTime = bookingTime;
    (async () => {
      setSlotsLoading(true);
      setAvailableSlots([]);
      setSlotsEventDate(null);
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(
          `${API_BASE}/api/v1/offers/${deal.id}/available-slots?date=${bookingDate}&partySize=${numTickets}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} }
        );
        if (cancelled) return;
        const json = await res.json();
        const slots = Array.isArray(json.data?.slots) ? json.data.slots : (Array.isArray(json.data) ? json.data : []);
        const eventDateFromApi = json.data?.event_date ? String(json.data.event_date).split("T")[0] : null;
        setSlotsEventDate(eventDateFromApi || null);
        if (json.success && slots.length > 0) {
          setAvailableSlots(slots);
          // FIX #10: Preserve selection if the slot is still available for the new party size
          if (prevBookingTime && slots.some(s => s.time === prevBookingTime && s.available !== false)) {
            setBookingTime(prevBookingTime);
          } else {
            setBookingTime("");
          }
        } else {
          setBookingTime("");
          if (!res.ok && isDev) {
            console.warn("[EventBooking] Slots API error:", res.status, json?.message || json?.error);
          }
        }
      } catch (e) {
        setBookingTime("");
        setSlotsEventDate(null);
        if (isDev) console.error("Fetch slots error:", e);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [deal?.id, bookingDate, numTickets]);

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
          if (isDev) console.log("Found deal:", result.data);
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
      if (isDev) console.error("Error fetching deal:", err);
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // Selected slot is full (available === false) - show only Join waitlist
  const selectedSlot = availableSlots.find((s) => s.time === bookingTime);
  const isSelectedSlotFull = Boolean(selectedSlot?.available === false);

  // Screen 1: Handle selection submission -> move to review
  const handleSelectionSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      const bookingMode = getBookingModeFromServiceType(getServiceType(deal));
      const isOnlineTimeSlot = bookingMode === ONLINE_TIME_SLOT;

      if (isOnlineTimeSlot && !bookingDate) {
        setError("Please select a booking date");
        return;
      }

      if (isOnlineTimeSlot && !bookingTime) {
        setError("Please select a booking time");
        return;
      }

      // Do not proceed to review when selected slot is full - user must join waitlist
      if (isSelectedSlotFull) return;

      if (bookingMode === PARTNER_CONFIRMATION && !bookingDate) {
        await Swal.fire({
          icon: "warning",
          title: "Date required",
          text: "Please select your preferred date for the booking. The voucher will show this date and you'll contact the partner for the time slot.",
          confirmButtonColor: "#059669",
        });
        setError("Please select your preferred date for the booking");
        return;
      }

      // Move to review screen (yellow banner already explains contact-partner flow for PARTNER_CONFIRMATION)
      setCurrentScreen(SCREEN_REVIEW);
    } catch (err) {
      if (isDev) console.error("handleSelectionSubmit error:", err);
      setError("Something went wrong. Please try again.");
    }
  };

  // Screen 2: Handle final booking submission
  const handleBookingSubmit = async () => {
    // Prevent double-submission (React state update is async, so useRef guard is needed)
    if (submittingRef.current) return;
    submittingRef.current = true;
    setError("");
    setSlotSoldOutCanWaitlist(false);
    setLoading(true);

    try {
      const token = localStorage.getItem("token");
      if (!token || isTokenExpired(token)) {
        setError("Please login to book deals");
        navigate("/login");
        return;
      }

      if (!deal) {
        setError("Deal information is missing");
        return;
      }

      const isOnlineTimeSlot = getBookingModeFromServiceType(getServiceType(deal)) === ONLINE_TIME_SLOT;
      if (isOnlineTimeSlot && bookingDate && bookingTime) {
        const bookingDt = new Date(`${bookingDate}T${bookingTime}:00`);
        if (!Number.isNaN(bookingDt.getTime()) && bookingDt.getTime() < Date.now()) {
          setError("Selected date and time have already passed. Please choose a current or future time.");
          setLoading(false);
          return;
        }
      }

      // Prepare booking data
      const bookingData = {
        offer_id: deal.id,
        num_tickets: numTickets,
        special_requests: specialRequests || null,
        booked_at_client: new Date().toISOString(), // Client timestamp for accurate "Booked on" display
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
      if (getServiceType(deal) === "dining" && bookingDate) {
        bookingData.reservation_data = {
          date: bookingDate,
          time: bookingTime || "19:00",
          partySize: numTickets,
          specialRequests: specialRequests,
        };
      }

      if (isDev) console.log("[EventBooking] Submitting booking:", { bookingData, dealServiceType: deal?.service_type });

      const response = await fetch(`${API_BASE}/api/v1/bookings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bookingData),
      });

      let result;
      try {
        result = await response.json();
      } catch (parseErr) {
        console.error("[EventBooking] Failed to parse response:", parseErr);
        setError("Invalid response from server. Check console for details.");
        return;
      }

      if (response.ok && result.success) {
        if (isDev) console.log("Booking created:", result.data);
        // Always show the same voucher view as after reschedule (BookingDetails: map, QR, Booking Time, etc.)
        const bookingId = result.data?.id ?? result.data?.booking_id;
        if (bookingId) {
          navigate(`/booking/${bookingId}`, { state: { booking: result.data }, replace: true });
          return;
        }
        setBookingResult(result.data);
        setCurrentScreen(SCREEN_CONFIRMATION);
      } else {
        const errorMsg =
          result?.message ?? result?.error ?? "Failed to create booking";
        const canWaitlist = response.status === 409 && result?.details?.can_waitlist;

        console.error("[EventBooking] Booking failed:", {
          status: response.status,
          error: errorMsg,
          canWaitlist,
          fullResponse: result,
          dealId: deal?.id,
          dealTitle: deal?.title,
          partnerId: deal?.partner_id,
          serviceType: deal?.service_type,
        });

        if (canWaitlist && deal?.partner_id && bookingDate && bookingTime) {
          setSlotSoldOutCanWaitlist(true);
          setError(errorMsg);
        } else if (
          typeof errorMsg === "string" &&
          (errorMsg.includes("Admin must approve") || errorMsg.includes("Partners section"))
        ) {
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
      console.error("[EventBooking] Booking error:", err, { API_BASE, url: `${API_BASE}/api/v1/bookings` });
      const msg = err.message || "Network error. Please try again.";
      const isNetworkErr = err.name === "TypeError" || /fetch|network/i.test(String(msg));
      setError(isNetworkErr ? `${msg} (API: ${API_BASE})` : msg);
    } finally {
      setLoading(false);
      submittingRef.current = false;
    }
  };

  const handleJoinWaitlist = async () => {
    if (!deal?.partner_id || !bookingDate || !bookingTime || joiningWaitlist) return;
    setJoiningWaitlist(true);
    setError("");
    try {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE}/api/v1/bookings/waitlist/join`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          partner_id: deal.partner_id,
          booking_date: bookingDate,
          booking_time: bookingTime,
          party_size: numTickets,
          special_requests: specialRequests || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setWaitlistSuccess(true);
        setSlotSoldOutCanWaitlist(false);
        const entry = data.waitlist_entry ?? data.data?.waitlist_entry ?? data.data;
        setWaitlistEntry(entry ? { ...entry, estimated_wait_minutes: data.estimated_wait_minutes ?? data.data?.estimated_wait_minutes ?? entry.estimated_wait_minutes } : null);
      } else {
        setError(data?.message ?? data?.error ?? "Failed to join waitlist");
      }
    } catch (err) {
      setError(err.message || "Failed to join waitlist");
    } finally {
      setJoiningWaitlist(false);
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
      <div className="event-booking-overlay elizian-auth-overlay">
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
      <div className="event-booking-overlay elizian-auth-overlay">
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

  // Waitlist success: show waitlisted voucher
  if (waitlistSuccess && deal) {
    return (
      <div className="event-booking-overlay elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
            <div style={{ padding: "1.5rem" }}>
              <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
                <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>📋</div>
                <h2 className="elizian-auth-modal-title" style={{ margin: "0 0 0.25rem 0" }}>You&apos;re on the Waitlist!</h2>
                <p style={{ color: "#6b7280", fontSize: "0.875rem", margin: 0 }}>
                  We&apos;ll notify you when a spot opens for this time slot
                </p>
              </div>

              {/* Waitlisted Voucher Card */}
              <div style={{
                background: "#fff",
                border: "1.5px solid #e5e7eb",
                borderRadius: "14px",
                overflow: "hidden",
                boxShadow: "0 4px 16px rgba(0,0,0,0.06)",
                marginBottom: "1.25rem",
              }}>
                <div style={{
                  background: "linear-gradient(135deg, #d97706, #b45309)",
                  padding: "1rem 1.25rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}>
                  <div>
                    <div style={{ color: "rgba(255,255,255,0.7)", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "2px" }}>
                      Waitlist Position
                    </div>
                    <div style={{ color: "#fff", fontWeight: "700", fontSize: "1.1rem" }}>
                      #{waitlistEntry?.position ?? "—"}
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
                    Waitlisted
                  </div>
                </div>
                <div style={{ padding: "1.25rem" }}>
                  <div style={{ fontWeight: "700", fontSize: "1.1rem", color: "#1f2937", marginBottom: "0.5rem" }}>
                    {deal?.title || "N/A"}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "0.5rem", color: "#374151", fontSize: "0.9rem" }}>
                    <span>🏢</span>
                    <span style={{ fontWeight: "500" }}>{deal?.partner_name || deal?.location}</span>
                  </div>
                  <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px solid #e5e7eb" }}>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Date</div>
                      <div style={{ fontWeight: "600", color: "#1f2937" }}>{formatDate(bookingDate)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.7rem", color: "#6b7280", textTransform: "uppercase", marginBottom: "2px" }}>Time</div>
                      <div style={{ fontWeight: "600", color: "#1f2937" }}>{formatTime(bookingTime)}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center", flexWrap: "wrap" }}>
                <button
                  type="button"
                  className="elizian-auth-button"
                  onClick={() => navigate("/home")}
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

  // Screen 3: Confirmation
  if (currentScreen === SCREEN_CONFIRMATION && bookingResult) {
    return (
      <div className="event-booking-overlay elizian-auth-overlay">
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
      <div className="event-booking-overlay elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal" style={{ maxWidth: "600px" }}>
            <button
              className="elizian-auth-modal-close"
              onClick={() => {
                setSlotSoldOutCanWaitlist(false);
                setWaitlistSuccess(false);
                setCurrentScreen(SCREEN_SELECTION);
              }}
              aria-label="Go back"
            >
              ← Back
            </button>

            <h2 className="elizian-auth-modal-title">Review & Confirm</h2>

            {error && (
              <div
                className="elizian-auth-error"
                role="alert"
                style={{
                  background: "rgba(239, 68, 68, 0.25)",
                  border: "1px solid #ef4444",
                  color: "#fef2f2",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                }}
              >
                {error}
              </div>
            )}

            {slotSoldOutCanWaitlist && (
              <div
                style={{
                  background: "#fef3c7",
                  border: "1px solid #d97706",
                  color: "#92400e",
                  padding: "1rem",
                  borderRadius: "8px",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                  This time slot is sold out
                </div>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.9rem" }}>
                  Join the waitlist and we&apos;ll notify you when a spot opens (e.g. if someone cancels).
                </p>
                <button
                  type="button"
                  onClick={handleJoinWaitlist}
                  disabled={joiningWaitlist}
                  style={{
                    background: "linear-gradient(135deg, #059669, #047857)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: joiningWaitlist ? "not-allowed" : "pointer",
                    opacity: joiningWaitlist ? 0.7 : 1,
                  }}
                >
                  {joiningWaitlist ? "Joining…" : "Join waitlist"}
                </button>
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
                <h3 style={{ margin: "0 0 0.5rem 0", color: "#111827" }}>
                  {deal.title}
                </h3>
                <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "0 0 0.25rem 0", color: "#374151", fontSize: "0.9rem" }}>
                  <span>🏢</span>
                  <span style={{ fontWeight: "500", color: "#374151" }}>{deal.partner_name || deal.location}</span>
                </div>
                {deal.partner_address && (
                  <div style={{ color: "#4b5563", fontSize: "0.8rem", margin: "0 0 0.5rem 0", paddingLeft: "1.5rem" }}>
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
              <h4 style={{ margin: "0 0 1rem 0", color: "#111827" }}>
                Booking Details
              </h4>

              {bookingDate && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#4b5563",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Date
                  </div>
                  <div style={{ fontWeight: "600", color: "#111827" }}>
                    {formatDate(bookingDate)}
                  </div>
                </div>
              )}

              {bookingTime ? (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#4b5563",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Time
                  </div>
                  <div style={{ fontWeight: "600", color: "#111827" }}>
                    {formatTime(bookingTime)}
                  </div>
                </div>
              ) : deal && getBookingModeFromServiceType(getServiceType(deal)) === PARTNER_CONFIRMATION ? (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#4b5563",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Time
                  </div>
                  <div style={{ fontWeight: "600", color: "#92400e", fontStyle: "italic" }}>
                    {getPartnerConfirmationBanner(getServiceType(deal)).title}
                  </div>
                </div>
              ) : null}

              <div style={{ marginBottom: "0.75rem" }}>
                <div
                  style={{
                    color: "#4b5563",
                    fontSize: "0.9rem",
                    marginBottom: "0.25rem",
                  }}
                >
                  {deal?.service_type === "dining"
                    ? "Number of Guests"
                    : "Number of Tickets"}
                </div>
                <div style={{ fontWeight: "600", color: "#111827" }}>{numTickets}</div>
              </div>

              {specialRequests && (
                <div style={{ marginBottom: "0.75rem" }}>
                  <div
                    style={{
                      color: "#4b5563",
                      fontSize: "0.9rem",
                      marginBottom: "0.25rem",
                    }}
                  >
                    Special Requests
                  </div>
                  <div style={{ fontWeight: "600", color: "#111827" }}>{specialRequests}</div>
                </div>
              )}

              <div
                style={{
                  borderTop: "1px solid #bae6fd",
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
                    color: "#047857",
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
                background: "#fef3c7",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                border: "1px solid #d97706",
              }}
            >
              <div
                style={{
                  fontWeight: "bold",
                  color: "#92400e",
                  marginBottom: "0.5rem",
                }}
              >
                💳 Payment at Venue
              </div>
              <div style={{ fontSize: "0.9rem", color: "#78350f" }}>
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
                  background: "rgba(255,255,255,0.08)",
                  color: "#e5e7eb",
                  border: "1.5px solid #d1d5db",
                  borderRadius: "10px",
                  padding: "14px 20px",
                  fontSize: "16px",
                  fontWeight: 600,
                  cursor: "pointer",
                  transition: "all 0.25s ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "#f3f4f6";
                  e.currentTarget.style.color = "#374151";
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.boxShadow =
                    "0 6px 14px rgba(0,0,0,0.08)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                  e.currentTarget.style.color = "#e5e7eb";
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
    <div className="event-booking-overlay elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal" style={{ maxWidth: "600px", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <button
            className="elizian-auth-modal-close"
            onClick={() => navigate("/home")}
            aria-label="Close"
          >
            &times;
          </button>

          {/* Fixed header: title + alert (no scroll) - solid bg so scroll content can't show through */}
          <div style={{ flexShrink: 0, background: "var(--glass-bg, #1f2937)", position: "relative", zIndex: 10 }}>
            <h2 className="elizian-auth-modal-title">Book Your Experience</h2>

            {/* Info banner - always visible at top */}
            {deal && getBookingModeFromServiceType(getServiceType(deal)) === PARTNER_CONFIRMATION && (
              <>
                <div
                  style={{
                    background: "#fef3c7",
                    padding: "1rem",
                    borderRadius: "8px",
                    marginBottom: "1rem",
                    border: "1px solid #d97706",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                    position: "relative",
                    zIndex: 11,
                  }}
                >
                  <div style={{ fontWeight: "600", color: "#92400e", marginBottom: "0.25rem" }}>
                    {getPartnerConfirmationBanner(getServiceType(deal)).title}
                  </div>
                  <div style={{ fontSize: "0.9rem", color: "#78350f", marginBottom: "0.75rem" }}>
                    {getPartnerConfirmationBanner(getServiceType(deal)).description}
                  </div>
                  {/* Date picker in header - always visible for PARTNER_CONFIRMATION */}
                  <div style={{ marginTop: "0.5rem" }}>
                    <label className="elizian-auth-label" htmlFor="bookingDateHeader" style={{ display: "block", marginBottom: "0.35rem", color: "#78350f", fontWeight: 600 }}>
                      Preferred Date (required)
                    </label>
                    {isSingleDayEvent ? (
                      <div style={{ padding: "8px 12px", background: "#f0fdf4", borderRadius: "6px", color: "#065f46", fontWeight: 500 }}>
                        {formatDate(eventDateStr)}
                      </div>
                    ) : (
                      <input
                        id="bookingDateHeader"
                        type="date"
                        className="elizian-booking-date-input"
                        value={bookingDate}
                        onChange={(e) => setBookingDate(e.target.value)}
                        min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
                        aria-required={true}
                      />
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Scrollable body - below header, cannot overlap it */}
          <div style={{ flex: 1, overflowY: "auto", minHeight: 0, position: "relative", zIndex: 1 }}>
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

          <form className="elizian-auth-form" onSubmit={handleSelectionSubmit} noValidate>
            {error && (
              <div className="elizian-auth-error" role="alert">
                {error}
              </div>
            )}
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label" htmlFor="numTickets">
                {getPartySizeLabel(getServiceType(deal))}
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
            {/* Date picker: for ONLINE_TIME_SLOT only (PARTNER_CONFIRMATION has it in header) */}
            {deal && getBookingModeFromServiceType(getServiceType(deal)) === ONLINE_TIME_SLOT && (
              <>
                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label" htmlFor="bookingDate">
                    {getServiceType(deal) === "events"
                      ? "Event Date"
                      : "Booking Date"}
                  </label>
                  {isSingleDayEvent ? (
                    <div style={{ padding: "10px 14px", background: "#f0fdf4", borderRadius: "8px", color: "#065f46", fontWeight: 500, border: "1px solid #a7f3d0" }}>
                      {formatDate(eventDateStr)}
                    </div>
                  ) : (
                    <input
                      id="bookingDate"
                      ref={dateRef}
                      onClick={() => dateRef.current?.showPicker()}
                      type="date"
                      className="elizian-auth-input"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      min={(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; })()}
                      required={true}
                      aria-required={true}
                    />
                  )}
                </div>

                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label" htmlFor="bookingTime">
                    {getServiceType(deal) === "events"
                      ? "Event Time"
                      : "Booking Time"}
                  </label>

                  {slotsLoading && (
                    <small style={{ color: "#666", fontSize: "0.85rem", display: "block", marginBottom: "0.5rem" }}>
                      Loading available slots…
                    </small>
                  )}
                  {!slotsLoading && availableSlots.length > 0 ? (
                    <div style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(3, 1fr)",
                      gap: "10px 12px",
                      marginTop: "8px",
                      maxHeight: "260px",
                      overflowY: "auto",
                      paddingRight: "6px",
                    }}
                      className="event-booking-slots-grid"
                    >
                      {availableSlots.map((slot) => (
                        <button
                          key={slot.time || slot.id || slot.label}
                          type="button"
                          onClick={() => setBookingTime(slot.time)}
                          style={{
                            padding: "12px 16px",
                            borderRadius: "10px",
                            border: bookingTime === slot.time ? "2px solid #004f4a" : "1px solid #d1d5db",
                            background: bookingTime === slot.time ? "#f0fdf4" : slot.available === false ? "#fef3c7" : "#fff",
                            color: slot.available === false ? "#92400e" : "#1f2937",
                            cursor: "pointer",
                            fontSize: "0.9rem",
                            fontWeight: 500,
                          }}
                        >
                          {slot.label || slot.time}
                          {slot.available === false && " (Full)"}
                          {/* FIX #8: Show remaining seats for low-availability slots */}
                          {slot.remaining_seats != null && slot.remaining_seats <= 10 && slot.available !== false && (
                            <span style={{ display: "block", fontSize: "0.7rem", color: "#dc2626", marginTop: "2px" }}>
                              {slot.remaining_seats} {slot.remaining_seats === 1 ? "seat" : "seats"} left
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  ) : !slotsLoading && getServiceType(deal) === "events" && bookingDate && slotsEventDate && slotsEventDate !== bookingDate ? (
                    /* Only block when the API explicitly says the event is on a DIFFERENT date */
                    <div style={{ padding: "1rem", background: "#fef3c7", borderRadius: "8px", marginTop: "4px", color: "#92400e" }}>
                      <strong>Event not available on this day</strong>
                      <p style={{ margin: "0.5rem 0 0", fontSize: "0.9rem" }}>
                        This event is on {formatDate(slotsEventDate)}. Please select that date to book.
                      </p>
                    </div>
                  ) : !slotsLoading && (
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
                  )}

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
                placeholder={getSpecialRequestsPlaceholder(getServiceType(deal))}
                aria-label="Special requests"
              />
            </div>
            <div
              style={{
                background: "#f0f9ff",
                padding: "1rem",
                borderRadius: "8px",
                marginBottom: "1.5rem",
                color: "#111827",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  marginBottom: "0.5rem",
                  color: "#374151",
                }}
              >
                <span style={{ color: "#374151" }}>
                  Price per{" "}
                  {deal?.service_type === "dining" ? "guest" : "ticket"}:
                </span>
                <span style={{ color: "#111827", fontWeight: "600" }}>
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
                  color: "#374151",
                }}
              >
                <span style={{ color: "#374151" }}>Quantity:</span>
                <span style={{ color: "#111827", fontWeight: "600" }}>{numTickets}</span>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: "1.2rem",
                  fontWeight: "bold",
                  color: "#047857",
                  borderTop: "1px solid #bae6fd",
                  paddingTop: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                <span>Total:</span>
                <span>{formatPrice(calculateTotal())}</span>
              </div>
            </div>
            {error && (
              <div role="alert" style={{ background: "rgba(239, 68, 68, 0.2)", border: "1px solid #ef4444", color: "#fef2f2", padding: "0.75rem 1rem", borderRadius: "8px", marginBottom: "1rem" }}>
                {error}
              </div>
            )}
            {isSelectedSlotFull ? (
              <div
                style={{
                  background: "#fef3c7",
                  border: "1px solid #d97706",
                  color: "#92400e",
                  padding: "1rem",
                  borderRadius: "10px",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
                  This time slot is sold out
                </div>
                <p style={{ margin: "0 0 0.75rem 0", fontSize: "0.9rem" }}>
                  Join the waitlist and we&apos;ll notify you when a spot opens (e.g. if someone cancels).
                </p>
                <button
                  type="button"
                  onClick={handleJoinWaitlist}
                  disabled={joiningWaitlist}
                  style={{
                    background: "linear-gradient(135deg, #059669, #047857)",
                    color: "#fff",
                    border: "none",
                    borderRadius: "8px",
                    padding: "10px 20px",
                    fontSize: "0.95rem",
                    fontWeight: 600,
                    cursor: joiningWaitlist ? "not-allowed" : "pointer",
                    opacity: joiningWaitlist ? 0.7 : 1,
                  }}
                >
                  {joiningWaitlist ? "Joining…" : "Join waitlist"}
                </button>
              </div>
            ) : (
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
            )}
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
    </div>
  );
};

export default EventBooking;
