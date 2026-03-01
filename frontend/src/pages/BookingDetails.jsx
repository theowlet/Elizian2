import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import '../styles/auth.css';
import { inferBookingMode, ONLINE_TIME_SLOT, PARTNER_CONFIRMATION } from '../config/bookingModes';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const BookingDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(!booking);
  const [error, setError] = useState('');
  const [qrCodeLoading, setQrCodeLoading] = useState(false);
  const [checkInStatus, setCheckInStatus] = useState(null); // null | 'locating' | 'success' | 'too_far' | 'error'
  const [checkInMessage, setCheckInMessage] = useState('');
  const [pendingRedemption, setPendingRedemption] = useState(null);
  const [disputableRedemption, setDisputableRedemption] = useState(null); // redeemed but within dispute window
  const [customerEztBalance, setCustomerEztBalance] = useState(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [showDisputeInput, setShowDisputeInput] = useState(false);
  const [confirmLoading, setConfirmLoading] = useState(false);
  const [confirmResult, setConfirmResult] = useState(null); // null | 'confirmed' | 'disputed' | 'error'
  const [confirmMessage, setConfirmMessage] = useState('');
  const [timeLeft, setTimeLeft] = useState(null);

  useEffect(() => {
    if (!booking && id) {
      loadBookingDetails();
    }
  }, [id, booking]);

  // When opened from list, booking may lack venue/deal – fetch once to get full voucher details
  useEffect(() => {
    if (
      booking &&
      id &&
      (
        booking.partner_name == null ||
        booking.deal_title == null ||
        booking.partner_address == null ||
        booking.partner_phone == null ||
        booking.partner_latitude == null ||
        booking.partner_longitude == null
      )
    ) {
      loadBookingDetails();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Load pending redemption for this booking. Pass booking_id so API returns pending for this booking only.
  const loadPendingRedemption = React.useCallback(async (bookingId) => {
    const idToUse = bookingId != null ? Number(bookingId) : (booking?.id != null ? Number(booking.id) : null);
    if (idToUse == null) return;
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const pendingUrl = `${API_BASE}/api/v1/redemptions/pending?booking_id=${idToUse}`;
      const [pendingRes, summaryRes] = await Promise.all([
        fetch(pendingUrl, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE}/api/v1/rewards/summary`, { headers: { Authorization: `Bearer ${token}` } })
      ]);
      const pendingJson = await pendingRes.json();
      if (pendingJson.success && pendingJson.data?.pending) {
        const match = pendingJson.data.pending[0] || null;
        if (match) setPendingRedemption(match);
        else setPendingRedemption(null);
      } else setPendingRedemption(null);
      const summaryJson = await summaryRes.json();
      if (summaryJson.success && summaryJson.data?.ezt?.balance != null) {
        setCustomerEztBalance(parseFloat(summaryJson.data.ezt.balance));
      } else {
        setCustomerEztBalance(null);
      }
    } catch (err) {
      console.error('Load pending redemption error:', err);
      setPendingRedemption(null);
    }
  }, [booking?.id]);

  useEffect(() => {
    if (booking?.id != null) {
      loadPendingRedemption(booking.id);
    }
  }, [booking?.id, loadPendingRedemption]);

  // Countdown timer for pending confirmation
  useEffect(() => {
    if (!pendingRedemption?.confirmation_expires_at) {
      setTimeLeft(null);
      return;
    }
    const update = () => {
      const diff = new Date(pendingRedemption.confirmation_expires_at) - Date.now();
      setTimeLeft(diff > 0 ? diff : 0);
    };
    update();
    const iv = setInterval(update, 1000);
    return () => clearInterval(iv);
  }, [pendingRedemption?.confirmation_expires_at]);

  const handleConfirmRedemption = async () => {
    if (!pendingRedemption) return;
    setConfirmLoading(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_BASE}/api/v1/redemptions/${pendingRedemption.redemption_id}/confirm`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
      });
      const j = await r.json();
      if (j.success) {
        setConfirmResult('confirmed');
        setConfirmMessage('Redemption confirmed! Tokens have been settled.');
        setPendingRedemption(null);
        loadBookingDetails();
      } else {
        setConfirmResult('error');
        setConfirmMessage(j.message || 'Failed to confirm');
      }
    } catch (err) {
      setConfirmResult('error');
      setConfirmMessage('Network error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const handleDisputeRedemption = async () => {
    const redemptionId = pendingRedemption?.redemption_id || disputableRedemption?.redemption_id;
    if (!redemptionId) return;
    if (!showDisputeInput) {
      setShowDisputeInput(true);
      return;
    }
    const reason = (disputeReason && String(disputeReason).trim()) || 'Disputed by customer';
    setConfirmLoading(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`${API_BASE}/api/v1/redemptions/${redemptionId}/dispute`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      const j = await r.json();
      if (j.success) {
        setConfirmResult('disputed');
        setConfirmMessage('Redemption disputed. Our team will review.');
        setPendingRedemption(null);
        setDisputableRedemption(null);
        setShowDisputeInput(false);
        setDisputeReason('');
        loadBookingDetails();
      } else {
        setConfirmResult('error');
        setConfirmMessage(j.message || 'Failed to dispute');
      }
    } catch (err) {
      setConfirmResult('error');
      setConfirmMessage('Network error');
    } finally {
      setConfirmLoading(false);
    }
  };

  const formatTimeLeft = (ms) => {
    if (ms == null || ms <= 0) return 'Expired';
    const mins = Math.floor(ms / 60000);
    const secs = Math.floor((ms % 60000) / 1000);
    return `${mins}m ${secs}s`;
  };

  // Auto-retry QR code generation if missing
  useEffect(() => {
    if (booking && !booking.qr_code_url && booking.voucher_code && !qrCodeLoading && id) {
      // Wait a bit then retry loading booking details to trigger QR regeneration
      const timer = setTimeout(() => {
        setQrCodeLoading(true);
        loadBookingDetails();
      }, 2000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booking?.qr_code_url, booking?.voucher_code, qrCodeLoading, id]);

  const loadBookingDetails = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please login to view booking details');
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/bookings/${id}`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Debug: Log booking date/time to verify correct values
          console.log('📅 Booking details loaded:', {
            booking_date: result.data.booking_date,
            booking_time: result.data.booking_time,
            booking_time_type: typeof result.data.booking_time,
            booking_time_length: result.data.booking_time?.length,
            created_at: result.data.created_at,
            booking_reference: result.data.booking_reference,
            all_booking_fields: Object.keys(result.data)
          });
          // Never overwrite voucher deal/venue with empty – preserve existing if API omits them
          setBooking(prev => ({
            ...result.data,
            deal_title: result.data.deal_title ?? prev?.deal_title,
            partner_name: result.data.partner_name ?? prev?.partner_name
          }));
          setDisputableRedemption(result.data.disputable_redemption || null);
          setQrCodeLoading(false);
          // If QR code was just generated, it will be in the response
          if (result.data.qr_code_url) {
            setQrCodeLoading(false);
          }
          // Fetch pending redemption for this booking so "Confirm your redemption" shows if partner already submitted
          if (result.data.id != null) {
            loadPendingRedemption(result.data.id);
          }
        } else {
          setError('Booking not found');
        }
      } else {
        if (response.status === 401) {
          navigate('/login');
          return;
        }
        if (response.status === 404) {
          setError('Booking not found');
        } else {
          let errMsg = 'Failed to load booking details';
          try {
            const errBody = await response.json();
            if (errBody?.message) errMsg = errBody.message;
            else if (errBody?.error) errMsg = errBody.error;
          } catch (_) {}
          setError(errMsg);
        }
      }
    } catch (err) {
      console.error('Error loading booking:', err);
      setError(err?.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      // Handle DATE type from PostgreSQL (YYYY-MM-DD format)
      // When PostgreSQL returns a DATE, it's a string like "2026-09-12"
      // We need to parse it correctly to avoid timezone issues
      let date;
      if (typeof dateString === 'string' && dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
        // Pure date string (YYYY-MM-DD) - parse as local date to avoid timezone shift
        const [year, month, day] = dateString.split('-').map(Number);
        date = new Date(year, month - 1, day); // month is 0-indexed
      } else {
        // Full datetime string or Date object
        date = new Date(dateString);
      }
      return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      }).format(date);
    } catch (e) {
      return dateString;
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) {
      console.warn('⚠️ formatTime called with null/empty timeString');
      return null;
    }
    try {
      // Handle both "HH:MM" and full datetime strings
      if (timeString.includes('T')) {
        // Full datetime string
        return new Intl.DateTimeFormat('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(new Date(timeString));
      } else {
        // Just time string "HH:MM" (e.g., "19:30" for 7:30 PM)
        const timeParts = timeString.split(':');
        if (timeParts.length < 2) {
          console.warn('⚠️ Invalid time format:', timeString);
          return timeString;
        }
        const hours = parseInt(timeParts[0], 10);
        const minutes = parseInt(timeParts[1], 10);
        
        if (isNaN(hours) || isNaN(minutes)) {
          console.warn('⚠️ Invalid time values:', { hours, minutes, timeString });
          return timeString;
        }
        
        // Create a date object with the time
        const date = new Date();
        date.setHours(hours, minutes, 0, 0);
        
        const formatted = new Intl.DateTimeFormat('en-IN', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: true
        }).format(date);
        
        console.log('🕐 formatTime:', { input: timeString, hours, minutes, output: formatted });
        return formatted;
      }
    } catch (e) {
      console.error('❌ formatTime error:', e, { timeString });
      return timeString;
    }
  };

  const formatPrice = (price) => {
    if (!price) return '₹0';
    return `₹${parseFloat(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Format created_at (ISO datetime) as "27 February 2026, 4:08 pm"
  const formatBookedOn = (isoString) => {
    if (!isoString) return 'N/A';
    try {
      const d = new Date(isoString);
      if (Number.isNaN(d.getTime())) return 'N/A';
      return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      }).format(d);
    } catch (e) {
      return isoString;
    }
  };

  const getStatusBadge = (status) => {
    const statusMap = {
      'confirmed': { label: 'Confirmed', class: 'status-confirmed' },
      'pending': { label: 'Pending', class: 'status-pending' },
      'pending_confirmation': { label: 'Awaiting Your Confirmation', class: 'status-pending' },
      'cancelled': { label: 'Cancelled', class: 'status-cancelled' },
      'redeemed': { label: 'Redeemed', class: 'status-redeemed' },
      'disputed': { label: 'Disputed', class: 'status-cancelled' },
      'completed': { label: 'Completed', class: 'status-completed' }
    };
    const statusInfo = statusMap[status] || { label: status, class: 'status-default' };
    return (
      <span className={`status-badge ${statusInfo.class}`}>
        {statusInfo.label}
      </span>
    );
  };

  const handleCheckIn = async () => {
    if (!navigator.geolocation) {
      setCheckInStatus('error');
      setCheckInMessage('Geolocation is not supported by your browser');
      return;
    }
    setCheckInStatus('locating');
    setCheckInMessage('');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const token = localStorage.getItem('token');
          const response = await fetch(`${API_BASE}/api/v1/bookings/${booking.id}/check-in`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            })
          });
          const result = await response.json();
          if (result.success) {
            setCheckInStatus('success');
            setCheckInMessage(result.data?.message || 'You are checked in at the venue');
          } else if (response.status === 422 || result.error?.includes('far') || result.message?.includes('far')) {
            setCheckInStatus('too_far');
            setCheckInMessage(result.message || result.error || 'You appear to be too far from the venue. Please try again when you arrive.');
          } else {
            setCheckInStatus('error');
            setCheckInMessage(result.message || result.error || 'Check-in failed');
          }
        } catch (err) {
          setCheckInStatus('error');
          setCheckInMessage('Network error. Please try again.');
        }
      },
      (err) => {
        setCheckInStatus('error');
        if (err.code === 1) {
          setCheckInMessage('Location permission denied. Please enable location access in your browser settings.');
        } else if (err.code === 2) {
          setCheckInMessage('Could not determine your location. Please try again.');
        } else {
          setCheckInMessage('Location request timed out. Please try again.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f14', color: '#f9fafb', padding: '2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto', textAlign: 'center' }}>
          <p>Loading booking details...</p>
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div style={{ minHeight: '100vh', background: '#0b0f14', color: '#f9fafb', padding: '2rem' }}>
        <div style={{ maxWidth: '800px', margin: '0 auto' }}>
          <div style={{
            background: '#fee',
            color: '#c00',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {error || 'Booking not found'}
          </div>
          <button
            onClick={() => navigate('/bookings')}
            style={{
              padding: '0.5rem 1rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            ← Back to Bookings
          </button>
        </div>
      </div>
    );
  }

  const theme = {
    bg: '#0B0F1A',
    gold: '#D4AF37',
    goldMuted: 'rgba(212, 175, 55, 0.2)',
    card: '#111827',
    border: 'rgba(212, 175, 55, 0.2)',
    muted: '#9CA3AF',
    confirmedBadge: 'rgba(212, 175, 55, 0.25)',
    confirmedText: '#b89b2e',
    fontSerif: "'Playfair Display', 'DM Serif Display', Georgia, serif",
  };

  // When partner has redeemed but customer has not confirmed, voucher_state is pending_confirmation — show that instead of "Redeemed"
  const displayStatus = (booking.voucher_state === 'pending_confirmation')
    ? 'pending_confirmation'
    : booking.status;
  const statusText = {
    confirmed: 'Voucher Confirmed',
    pending: 'Booking Pending',
    pending_confirmation: 'Awaiting Your Confirmation',
    cancelled: 'Booking Cancelled',
    redeemed: 'Voucher Redeemed',
    completed: 'Booking Completed',
  }[displayStatus] || (displayStatus ? String(displayStatus).replace(/_/g, ' ') : 'Booking Status');

  const statusColor = displayStatus === 'confirmed'
    ? '#16a34a'
    : (displayStatus === 'pending_confirmation' ? '#f59e0b' : displayStatus === 'cancelled' ? '#dc2626' : '#f59e0b');

  // Single source of truth: voucher rendering based on booking_mode only
  const bookingMode = inferBookingMode(booking);
  const isPartnerConfirmation = bookingMode === PARTNER_CONFIRMATION;
  const isOnlineTimeSlot = bookingMode === ONLINE_TIME_SLOT;

  const bookedOnText = booking.booked_on_ist
    ? booking.booked_on_ist
    : (isPartnerConfirmation && booking.booking_date
      ? `${formatDate(booking.booking_date)}${booking.booking_time && booking.booking_time !== '12:00' ? ` at ${formatTime(booking.booking_time)}` : ''}`
      : formatBookedOn(booking.created_at));

  const scheduledText = isPartnerConfirmation
    ? (booking.booking_date
        ? `${formatDate(booking.booking_date)} — Please contact the partner for the available time slot.`
        : 'Please contact the partner for the available time slot.')
    : (booking.booking_date
      ? `${formatDate(booking.booking_date)}${booking.booking_time ? ` at ${formatTime(booking.booking_time)}` : ''}`
      : null);

  const partnerLat = booking.partner_latitude != null ? Number(booking.partner_latitude) : null;
  const partnerLng = booking.partner_longitude != null ? Number(booking.partner_longitude) : null;
  const hasMapLocation = Number.isFinite(partnerLat) && Number.isFinite(partnerLng);
  const mapDelta = 0.005;
  const mapEmbedUrl = hasMapLocation
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${partnerLng - mapDelta},${partnerLat - mapDelta},${partnerLng + mapDelta},${partnerLat + mapDelta}&layer=mapnik&marker=${partnerLat},${partnerLng}`
    : null;

  const partnerAddress = booking.partner_address || 'Address not available';
  const destinationValue = hasMapLocation
    ? `${partnerLat},${partnerLng}`
    : [booking.partner_name, partnerAddress].filter(Boolean).join(', ');
  const directionsUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destinationValue)}`;
  const partnerPhoneRaw = booking.partner_phone ? String(booking.partner_phone) : '';
  const partnerPhoneDial = partnerPhoneRaw.replace(/[^\d+]/g, '');
  const canCallVenue = partnerPhoneDial.length > 0;
  const bookedFor = booking.customer_name || 'You';
  const venueAvatarLabel = (booking.partner_name || booking.deal_title || 'V').slice(0, 1).toUpperCase();

  return (
    <div style={{ minHeight: '100vh', background: theme.bg, color: '#F3F4F6', padding: '1rem 1rem 2rem' }}>
      <div style={{ maxWidth: '480px', margin: '0 auto' }}>
        {/* Confirmation Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: '1rem',
          gap: '0.5rem',
        }}>
          <button
            type="button"
            onClick={() => navigate('/bookings')}
            style={{
              padding: '0.5rem',
              background: 'transparent',
              border: 'none',
              color: '#e5e7eb',
              cursor: 'pointer',
              fontSize: '1.4rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
            aria-label="Back to Bookings"
          >
            ←
          </button>
          <div style={{
            flex: 1,
            minWidth: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.15rem' }}>
              <div style={{ fontSize: '1.5rem', lineHeight: 1 }}>✅</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 800, color: statusColor, lineHeight: 1.2 }}>
                {statusText}
              </div>
            </div>
            <div style={{ fontSize: '0.9rem', color: '#9ca3af', paddingLeft: '2rem' }}>
              Booking ID: {booking.booking_reference || `BK${booking.id}`}
            </div>
          </div>
        </div>

        {/* Voucher Confirmation Card */}
        <div style={{
          background: '#f8fafc',
          borderRadius: '16px',
          border: '1px solid #e2e8f0',
          overflow: 'hidden',
          marginBottom: '1.25rem',
          color: '#0f172a',
          boxShadow: '0 8px 26px rgba(0,0,0,0.2)',
        }}>
          <div style={{ padding: '1.1rem 1.1rem 0.8rem' }}>
            <div style={{ fontSize: '0.9rem', color: '#64748b', marginBottom: '0.15rem' }}>
              {(() => {
                const dateStr = booking.booking_date;
                const timeStr = booking.booking_time || '00:00';
                const dt = dateStr ? new Date(`${dateStr}T${String(timeStr).trim().slice(0, 5) || '00:00'}:00`) : null;
                const isPast = dt && dt < new Date();
                return isPast ? 'Past Booking' : 'Upcoming Booking';
              })()}
            </div>
            <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1.1 }}>
              {booking.deal_title || 'Voucher Confirmation'}
            </div>
          </div>

          {isPartnerConfirmation && (() => {
            const st = (booking.service_type || '').toLowerCase();
            let bannerTitle = 'Contact partner for time slot';
            let bannerDesc = 'Please contact the partner for the available time slot.';
            if (st === 'spa-and-salon' || st === 'spa') {
              bannerTitle = 'Contact the salon for appointment';
              bannerDesc = 'Please contact the salon to confirm your appointment time.';
            } else if (st === 'wellness') {
              bannerTitle = 'Contact the studio for session time';
              bannerDesc = 'Please contact the studio to confirm your session time.';
            } else if (st === 'healthcare') {
              bannerTitle = 'Contact the clinic for appointment';
              bannerDesc = 'Please contact the clinic to schedule your appointment.';
            } else if (st === 'travel') {
              bannerTitle = 'Contact partner for booking details';
              bannerDesc = 'Contact the travel partner for check-in, pickup, or activity timing details.';
            }
            return (
              <div style={{
                margin: '0 1.1rem 1rem',
                padding: '0.75rem 1rem',
                background: '#fef3c7',
                borderRadius: '8px',
                border: '1px solid #d97706',
              }}>
                <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.2rem' }}>
                  {bannerTitle}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#78350f' }}>
                  {bannerDesc}
                </div>
              </div>
            );
          })()}

          <div style={{ height: '190px', background: '#e2e8f0', borderTop: '1px solid #e2e8f0', borderBottom: '1px solid #e2e8f0' }}>
            {mapEmbedUrl ? (
              <iframe
                title="Venue Map"
                src={mapEmbedUrl}
                style={{ width: '100%', height: '100%', border: 0 }}
                loading="lazy"
              />
            ) : (
              <div style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#475569',
                fontWeight: 600,
                padding: '0 1rem',
                textAlign: 'center',
              }}>
                Venue location preview will appear when coordinates are available.
              </div>
            )}
          </div>

          <div style={{ padding: '1rem 1.1rem 1.1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.8rem', marginBottom: '0.8rem' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: '0.2rem' }}>
                  Booked on
                </div>
                <div style={{ fontSize: '1.45rem', fontWeight: 800, lineHeight: 1.25, color: '#111827' }}>
                  {bookedOnText}
                </div>
                {scheduledText && (
                  <>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: '0.5rem', marginBottom: '0.2rem' }}>
                      {isPartnerConfirmation ? 'Booked for' : 'Scheduled for'}
                    </div>
                    <div style={{ fontSize: '1rem', fontWeight: 600, color: '#334155' }}>
                      {scheduledText}
                    </div>
                  </>
                )}
                <div style={{ marginTop: '0.35rem', fontSize: '0.95rem', color: '#334155', fontWeight: 600 }}>
                  {booking.partner_name || 'Partner Venue'}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#64748b' }}>
                  Booked for - {bookedFor}
                </div>
                <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '0.45rem' }}>
                  <span style={{ fontSize: '0.78rem', color: '#0f172a', background: '#e2e8f0', borderRadius: '999px', padding: '0.22rem 0.6rem', fontWeight: 700 }}>
                    {booking.num_tickets || booking.num_guests || 1} {booking.deal_title ? 'Guests' : 'Tickets'}
                  </span>
                  <span style={{ fontSize: '0.78rem', color: '#0f172a', background: '#dcfce7', borderRadius: '999px', padding: '0.22rem 0.6rem', fontWeight: 700 }}>
                    {formatPrice(booking.total_price || booking.fiat_amount)}
                  </span>
                </div>
              </div>
              <div style={{
                width: '58px',
                height: '58px',
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #0f172a, #334155)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                fontSize: '1.1rem',
                flexShrink: 0,
                marginTop: '0.15rem',
              }}>
                {venueAvatarLabel}
              </div>
            </div>

            <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '0.8rem' }}>
              <div style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.3rem', color: '#1e293b' }}>
                {booking.partner_name || 'Venue'}
              </div>
              <div style={{ fontSize: '0.95rem', color: '#475569', lineHeight: 1.45 }}>
                {partnerAddress}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isPartnerConfirmation && canCallVenue ? '1fr 1fr 1fr' : '1fr 1fr', gap: '0.6rem', marginTop: '0.85rem' }}>
                <button
                  type="button"
                  onClick={() => { if (canCallVenue) window.location.href = `tel:${partnerPhoneDial}`; }}
                  disabled={!canCallVenue}
                  style={{
                    padding: '0.68rem 0.75rem',
                    borderRadius: '10px',
                    border: '2px solid #0ea5e9',
                    background: '#fff',
                    color: canCallVenue ? '#0284c7' : '#94a3b8',
                    fontWeight: 700,
                    cursor: canCallVenue ? 'pointer' : 'not-allowed',
                    fontSize: '0.9rem',
                  }}
                >
                  📞 Call
                </button>
                {/* WhatsApp deep link for PARTNER_CONFIRMATION — most Indian businesses use WhatsApp */}
                {isPartnerConfirmation && canCallVenue && (
                  <button
                    type="button"
                    onClick={() => {
                      const phone = partnerPhoneDial.startsWith('+') ? partnerPhoneDial.substring(1) : (partnerPhoneDial.startsWith('0') ? '91' + partnerPhoneDial.substring(1) : (/^\d{10}$/.test(partnerPhoneDial) ? '91' + partnerPhoneDial : partnerPhoneDial));
                      const dateText = booking.booking_date ? formatDate(booking.booking_date) : 'my preferred date';
                      const msg = `Hi, I have an Elizian voucher (Ref: ${booking.booking_reference || 'N/A'}) for ${booking.deal_title || 'your service'} on ${dateText}. What times are available?`;
                      window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
                    }}
                    style={{
                      padding: '0.68rem 0.75rem',
                      borderRadius: '10px',
                      border: '2px solid #25d366',
                      background: '#fff',
                      color: '#128c7e',
                      fontWeight: 700,
                      cursor: 'pointer',
                      fontSize: '0.9rem',
                    }}
                  >
                    💬 WhatsApp
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => window.open(directionsUrl, '_blank', 'noopener,noreferrer')}
                  style={{
                    padding: '0.68rem 0.75rem',
                    borderRadius: '10px',
                    border: '2px solid #0ea5e9',
                    background: '#fff',
                    color: '#0284c7',
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                  }}
                >
                  🧭 Directions
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* QR code + Code line */}
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.25rem',
          border: `1px solid ${theme.border}`,
          textAlign: 'center',
        }}>
          {booking.qr_code_url ? (
            <>
              <div style={{ position: 'relative', display: 'inline-block' }}>
                <img
                  src={booking.qr_code_url.startsWith('http') ? booking.qr_code_url : `${API_BASE}${booking.qr_code_url.startsWith('/') ? '' : '/'}${booking.qr_code_url}`}
                  alt="Booking QR Code"
                  style={{
                    width: '220px',
                    height: '220px',
                    display: 'block',
                    borderRadius: '10px',
                    border: `2px solid ${theme.border}`,
                    background: '#fff',
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const err = e.target.nextSibling;
                    if (err) err.style.display = 'flex';
                  }}
                />
                <div style={{
                  display: 'none',
                  width: '220px',
                  height: '220px',
                  margin: '0 auto',
                  background: 'rgba(255,255,255,0.06)',
                  borderRadius: '10px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: theme.muted,
                  fontSize: '0.85rem',
                  flexDirection: 'column',
                }}>
                  QR Code unavailable
                </div>
              </div>
              {booking.voucher_code && (
                <div style={{
                  marginTop: '1rem',
                  color: theme.muted,
                  fontSize: '0.85rem',
                  fontFamily: 'monospace',
                }}>
                  Code: {String(booking.voucher_code).slice(0, 12)}…
                </div>
              )}
            </>
          ) : (
            <div style={{
              width: '200px',
              height: '200px',
              margin: '0 auto',
              background: 'rgba(255,255,255,0.06)',
              borderRadius: '10px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: theme.muted,
              fontSize: '0.9rem',
              flexDirection: 'column',
            }}>
              {qrCodeLoading ? 'Generating…' : 'QR Code'}
              {!qrCodeLoading && booking.voucher_code && (
                <button
                  type="button"
                  onClick={async () => {
                    setQrCodeLoading(true);
                    await loadBookingDetails();
                  }}
                  style={{
                    marginTop: '0.5rem',
                    padding: '0.5rem 1rem',
                    background: 'transparent',
                    color: theme.gold,
                    border: `1px solid ${theme.gold}`,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                  }}
                >
                  Generate QR Code
                </button>
              )}
            </div>
          )}
        </div>

        {/* Action buttons: View Details, Reschedule, Cancel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {booking.partner_id && (
            <button
              type="button"
              onClick={() => navigate(`/venue/${booking.partner_id}`)}
              style={{
                padding: '0.85rem 1.25rem',
                background: theme.card,
                color: theme.gold,
                border: `1px solid ${theme.gold}`,
                borderRadius: '10px',
                cursor: 'pointer',
                fontSize: '0.95rem',
                fontWeight: 600,
              }}
            >
              View Details
            </button>
          )}
          {booking.status === 'confirmed' && (
            <>
              <button
                type="button"
                onClick={() => navigate(`/booking/${booking.id}/reschedule`, { state: { booking } })}
                style={{
                  padding: '0.85rem 1.25rem',
                  background: theme.card,
                  color: theme.gold,
                  border: `1px solid ${theme.gold}`,
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                }}
              >
                Reschedule
              </button>
              <button
                type="button"
                onClick={async () => {
                  if (!window.confirm('Are you sure you want to cancel this booking?')) return;
                  try {
                    const token = localStorage.getItem('token');
                    const cancelId = id || booking?.id;
                    if (!cancelId) {
                      alert('Cannot cancel: booking ID missing');
                      return;
                    }
                    const response = await fetch(`${API_BASE}/api/v1/bookings/${cancelId}/cancel`, {
                      method: 'PUT',
                      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    });
                    if (response.ok) {
                      navigate('/bookings', { replace: true, state: { fromCancel: true, showCancelled: true } });
                    } else {
                      const result = await response.json();
                      alert(result?.message ?? result?.error ?? 'Failed to cancel booking');
                    }
                  } catch (err) {
                    alert('Network error. Please try again.');
                  }
                }}
                style={{
                  padding: '0.85rem 1.25rem',
                  background: theme.card,
                  color: '#e5a0a0',
                  border: '1px solid rgba(229, 160, 160, 0.5)',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontSize: '0.95rem',
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {/* Extra: Deal / Partner (compact) */}
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          padding: '1rem 1.25rem',
          marginBottom: '1.5rem',
          border: `1px solid ${theme.border}`,
        }}>
          <h3 style={{ margin: '0 0 0.75rem 0', fontSize: '1rem', color: theme.muted }}>Details</h3>
          <div style={{ marginBottom: '0.5rem' }}>
            <div style={{ color: theme.muted, fontSize: '0.8rem' }}>Deal / Event</div>
            <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{booking.deal_title || booking.title || 'N/A'}</div>
          </div>
          {booking.partner_name && (
            <div>
              <div style={{ color: theme.muted, fontSize: '0.8rem' }}>Partner</div>
              <div style={{ fontSize: '0.95rem', fontWeight: 600 }}>{booking.partner_name}</div>
            </div>
          )}
        </div>

        {/* Booking Information (rest of grid: status, special requests, points) */}
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: `1px solid ${theme.border}`,
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: theme.muted }}>Booking Information</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <div style={{ color: theme.muted, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Status</div>
              {getStatusBadge(booking.status)}
            </div>
          </div>

          {booking.special_requests && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ color: theme.muted, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Special Requests</div>
              <div style={{ color: '#d1d5db' }}>{booking.special_requests}</div>
            </div>
          )}

          {booking.points_earned > 0 && (
            <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
              <div style={{ color: theme.muted, fontSize: '0.85rem', marginBottom: '0.25rem' }}>Loyalty Points Earned</div>
              <div style={{ color: theme.gold, fontWeight: 600, fontSize: '1.1rem' }}>
                {parseFloat(booking.points_earned).toFixed(0)} points
              </div>
            </div>
          )}
        </div>

        {/* Redemption Instructions */}
        <div style={{
          background: theme.card,
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: `1px solid ${theme.border}`
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: theme.muted }}>Redemption Instructions</h3>
          <div style={{ color: '#d1d5db', lineHeight: '1.6' }}>
            <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
              <li style={{ marginBottom: '0.5rem' }}>Arrive at the partner venue on the scheduled date and time</li>
              <li style={{ marginBottom: '0.5rem' }}>Show your booking reference or QR code to the staff</li>
              <li style={{ marginBottom: '0.5rem' }}>Pay the amount directly at the venue</li>
              <li style={{ marginBottom: '0.5rem' }}>Enjoy your experience!</li>
            </ol>
          </div>
        </div>

        {/* Check-in Section */}
        {booking.status === 'confirmed' && (
          <div style={{
            background: '#1f2937',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '1px solid #374151'
          }}>
            <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Venue Check-in</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Tap below when you arrive at the venue to confirm your presence. Your location will be verified against the venue address.
            </p>
            {checkInStatus === 'success' ? (
              <div style={{ padding: '1rem', background: 'rgba(16,185,129,0.15)', border: '1px solid #10b981', borderRadius: '8px', color: '#10b981', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
                <div style={{ fontWeight: 600 }}>Checked in!</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem', color: '#6ee7b7' }}>{checkInMessage}</div>
              </div>
            ) : checkInStatus === 'too_far' ? (
              <div style={{ padding: '1rem', background: 'rgba(245,158,11,0.15)', border: '1px solid #f59e0b', borderRadius: '8px', color: '#f59e0b', textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>📍</div>
                <div style={{ fontWeight: 600 }}>Too far from venue</div>
                <div style={{ fontSize: '0.85rem', marginTop: '0.25rem' }}>{checkInMessage}</div>
                <button onClick={handleCheckIn} style={{ marginTop: '0.75rem', padding: '0.5rem 1.5rem', background: '#f59e0b', color: '#000', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                  Retry
                </button>
              </div>
            ) : checkInStatus === 'error' ? (
              <div style={{ padding: '1rem', background: 'rgba(239,68,68,0.15)', border: '1px solid #ef4444', borderRadius: '8px', color: '#ef4444', textAlign: 'center' }}>
                <div style={{ fontWeight: 600 }}>{checkInMessage || 'Check-in failed'}</div>
                <button onClick={handleCheckIn} style={{ marginTop: '0.75rem', padding: '0.5rem 1.5rem', background: '#ef4444', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 }}>
                  Retry
                </button>
              </div>
            ) : (
              <button
                onClick={handleCheckIn}
                disabled={checkInStatus === 'locating'}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: checkInStatus === 'locating' ? '#374151' : 'linear-gradient(135deg, #5E17EB, #24105F)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: checkInStatus === 'locating' ? 'wait' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 600,
                  letterSpacing: '0.3px'
                }}
              >
                {checkInStatus === 'locating' ? '📍 Getting your location...' : '📍 Check in at venue'}
              </button>
            )}
          </div>
        )}

        {/* Redeemed: dispute within window (no confirm step; partner redeem is final) */}
        {disputableRedemption && !pendingRedemption && !confirmResult && (
          <div style={{
            background: 'linear-gradient(135deg, #422006, #78350f)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '2px solid #f59e0b'
          }}>
            <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem', color: '#fcd34d' }}>🔔 Voucher was redeemed</h3>
            <p style={{ color: '#fde68a', fontSize: '0.9rem', marginBottom: '1rem' }}>
              Your voucher was redeemed at the venue. If this wasn&apos;t you or something went wrong, you can raise a dispute before the time limit.
            </p>
            {showDisputeInput && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#fde68a', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reason for disputing (required)</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="e.g. I was not at the venue / Wrong amount charged"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #f59e0b',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#fef3c7',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
            <button
              onClick={handleDisputeRedemption}
              disabled={confirmLoading || (showDisputeInput && !(disputeReason && String(disputeReason).trim()))}
              style={{
                padding: '0.85rem 1.25rem',
                background: showDisputeInput ? '#dc2626' : 'transparent',
                color: '#fca5a5',
                border: '2px solid #ef4444',
                borderRadius: '10px',
                cursor: confirmLoading ? 'wait' : 'pointer',
                fontSize: '1rem',
                fontWeight: 700
              }}
            >
              {confirmLoading ? 'Processing...' : showDisputeInput ? 'Submit dispute' : '❌ Dispute this redemption'}
            </button>
          </div>
        )}

        {/* Pending Redemption Confirmation (legacy: pending_confirmation flow) */}
        {pendingRedemption && !confirmResult && (
          <div style={{
            background: 'linear-gradient(135deg, #1e1b4b, #312e81)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            border: '2px solid #6366f1'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#e0e7ff' }}>🔔 Confirm Your Redemption</h3>
              {timeLeft != null && (
                <div style={{
                  padding: '0.35rem 0.75rem',
                  background: timeLeft > 5 * 60000 ? 'rgba(99,102,241,0.3)' : 'rgba(239,68,68,0.3)',
                  borderRadius: '20px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  color: timeLeft > 5 * 60000 ? '#a5b4fc' : '#fca5a5'
                }}>
                  ⏱ {formatTimeLeft(timeLeft)}
                </div>
              )}
            </div>
            <p style={{ color: '#c7d2fe', fontSize: '0.9rem', marginBottom: '1rem' }}>
              The partner has initiated a redemption for your visit. Please review the details and confirm.
            </p>
            {customerEztBalance != null && (
              <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'rgba(255,255,255,0.06)', borderRadius: '8px', fontSize: '0.9rem' }}>
                <div style={{ color: '#a5b4fc' }}>Current EZT balance</div>
                <div style={{ fontWeight: 700 }}>{Number(customerEztBalance).toFixed(5)} EZT</div>
                <div style={{ color: '#a5b4fc', marginTop: '0.5rem' }}>After this redemption</div>
                <div style={{ fontWeight: 700, color: '#34d399' }}>
                  {Math.max(0, customerEztBalance - parseFloat(pendingRedemption.ezt_tokens_required || (pendingRedemption.ezt_co_pay_amount / 100) || 0)).toFixed(5)} EZT
                </div>
              </div>
            )}
            {(pendingRedemption.co_pay_override === true || pendingRedemption.co_pay_override === 'true') && (
              <div style={{
                marginBottom: '1rem',
                padding: '0.75rem 1rem',
                background: 'rgba(245,158,11,0.2)',
                border: '1px solid #f59e0b',
                borderRadius: '8px',
                color: '#fcd34d',
                fontSize: '0.9rem'
              }}>
                ⚠️ The partner applied less EZT than your deal entitles. Reason on record: {pendingRedemption.override_reason || '—'}
              </div>
            )}
            <div style={{
              background: 'rgba(255,255,255,0.08)',
              borderRadius: '8px',
              padding: '1rem',
              marginBottom: '1rem',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '0.75rem'
            }}>
              <div>
                <div style={{ color: '#a5b4fc', fontSize: '0.8rem' }}>Total Bill</div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>₹{parseFloat(pendingRedemption.total_bill_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
              </div>
              <div>
                <div style={{ color: '#a5b4fc', fontSize: '0.8rem' }}>Discount ({pendingRedemption.offer_discount_percentage || 0}%)</div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem', color: '#34d399' }}>-₹{parseFloat(pendingRedemption.discount_amount || pendingRedemption.ezt_co_pay_amount || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
              </div>
              <div>
                <div style={{ color: '#a5b4fc', fontSize: '0.8rem' }}>EZT to deduct</div>
                <div style={{ fontWeight: 700 }}>{parseFloat(pendingRedemption.ezt_tokens_required || (pendingRedemption.ezt_co_pay_amount / 100) || 0).toFixed(5)} EZT</div>
              </div>
              <div>
                <div style={{ color: '#a5b4fc', fontSize: '0.8rem' }}>You Paid (Cash/Card)</div>
                <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>₹{parseFloat(pendingRedemption.net_amount_from_user || 0).toLocaleString('en-IN', {minimumFractionDigits: 2})}</div>
              </div>
            </div>
            {showDisputeInput && (
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', color: '#c7d2fe', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Reason for disputing (required)</label>
                <textarea
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  placeholder="e.g. I did not authorise this amount"
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.75rem',
                    borderRadius: '8px',
                    border: '1px solid #6366f1',
                    background: 'rgba(0,0,0,0.2)',
                    color: '#e0e7ff',
                    fontSize: '0.9rem',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleConfirmRedemption}
                disabled={confirmLoading || (timeLeft != null && timeLeft <= 0)}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  background: confirmLoading ? '#374151' : '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: confirmLoading ? 'wait' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 700
                }}
              >
                {confirmLoading ? 'Processing...' : '✅ Confirm'}
              </button>
              <button
                onClick={handleDisputeRedemption}
                disabled={confirmLoading || (showDisputeInput && !(disputeReason && String(disputeReason).trim()))}
                style={{
                  flex: 1,
                  padding: '0.85rem',
                  background: showDisputeInput ? '#dc2626' : 'transparent',
                  color: '#ef4444',
                  border: '2px solid #ef4444',
                  borderRadius: '10px',
                  cursor: confirmLoading ? 'wait' : 'pointer',
                  fontSize: '1rem',
                  fontWeight: 700
                }}
              >
                {showDisputeInput ? 'Submit dispute' : '❌ Dispute'}
              </button>
            </div>
          </div>
        )}

        {/* Confirmation Result */}
        {confirmResult && (
          <div style={{
            background: confirmResult === 'confirmed' ? 'rgba(16,185,129,0.15)' : confirmResult === 'disputed' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
            border: `1px solid ${confirmResult === 'confirmed' ? '#10b981' : confirmResult === 'disputed' ? '#f59e0b' : '#ef4444'}`,
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1.5rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>
              {confirmResult === 'confirmed' ? '✅' : confirmResult === 'disputed' ? '⚠️' : '❌'}
            </div>
            <div style={{ fontWeight: 600, fontSize: '1.1rem', color: confirmResult === 'confirmed' ? '#10b981' : confirmResult === 'disputed' ? '#f59e0b' : '#ef4444' }}>
              {confirmResult === 'confirmed' ? 'Redemption Confirmed' : confirmResult === 'disputed' ? 'Redemption Disputed' : 'Error'}
            </div>
            <div style={{ fontSize: '0.9rem', color: '#9ca3af', marginTop: '0.5rem' }}>{confirmMessage}</div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingDetails;
