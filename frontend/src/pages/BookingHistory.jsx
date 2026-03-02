import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import QRCodeModal from '../components/QRCodeModal';
import EmptyState from '../components/EmptyState';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const BookingHistory = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, upcoming, completed, cancelled, waitlist
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [waitlistEntries, setWaitlistEntries] = useState([]);
  const [waitlistLoading, setWaitlistLoading] = useState(false);

  useEffect(() => {
    loadBookings();
  }, []);

  // Reload when returning from cancel (ensures fresh data)
  useEffect(() => {
    if (!location.state?.fromCancel) return;
    const run = async () => {
      await loadBookings();
      if (location.state?.showCancelled) setFilter('cancelled');
      navigate(location.pathname, { replace: true, state: {} });
    };
    run();
  }, [location.state?.fromCancel, location.state?.showCancelled]);

  const loadWaitlistEntries = async () => {
    try {
      setWaitlistLoading(true);
      const token = localStorage.getItem('token');
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/v1/bookings/waitlist/my-entries`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const result = await res.json();
        const data = result.data ?? result;
        const entries = Array.isArray(data) ? data : [];
        setWaitlistEntries(entries.filter((e) => ['waiting', 'notified'].includes(e.status)));
      } else {
        setWaitlistEntries([]);
      }
    } catch (e) {
      console.error('Waitlist load error:', e);
      setWaitlistEntries([]);
    } finally {
      setWaitlistLoading(false);
    }
  };

  useEffect(() => {
    if (filter === 'waitlist') loadWaitlistEntries();
  }, [filter]);

  const loadBookings = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      
      if (!token) {
        setError('Please login to view bookings');
        navigate('/login');
        return;
      }

      const response = await fetch(`${API_BASE}/api/v1/bookings`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          setBookings(Array.isArray(result.data) ? result.data : []);
        } else {
          setBookings([]);
        }
      } else {
        if (response.status === 401) {
          navigate('/login');
          return;
        }
        setError('Failed to load bookings');
      }
    } catch (err) {
      console.error('Error loading bookings:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Filter and sort bookings
  const filteredBookings = useMemo(() => {
    if (!bookings || bookings.length === 0) return [];

    // Build full booking datetime (date + time) for comparison
    const getBookingDatetime = (b) => {
      const dateStr = b.booking_date;
      const timeStr = b.booking_time || '00:00';
      if (!dateStr) return null;
      if (dateStr.includes('T')) return new Date(dateStr);
      const timePart = String(timeStr).trim().match(/^\d{1,2}:\d{2}/)?.[0] || '00:00';
      return new Date(`${dateStr}T${timePart}:00`);
    };

    let filtered = [...bookings];
    const now = new Date();

    // Apply status filter
    if (filter === 'upcoming') {
      filtered = filtered.filter(b => {
        const bookingDt = getBookingDatetime(b);
        return bookingDt && bookingDt >= now && b.status === 'confirmed';
      });
    } else if (filter === 'completed') {
      filtered = filtered.filter(b => {
        const bookingDt = getBookingDatetime(b);
        const isPast = bookingDt && bookingDt < now;
        const isRedeemed = b.status === 'redeemed';
        return (isPast || isRedeemed) && (b.status === 'confirmed' || b.status === 'redeemed');
      });
    } else if (filter === 'cancelled') {
      filtered = filtered.filter(b => b.status === 'cancelled');
    } else if (filter === 'all') {
      // "All" = active bookings only (exclude cancelled - those show in Cancelled tab)
      filtered = filtered.filter(b => b.status !== 'cancelled');
    }
    
    // Sort by date (upcoming first, then by creation date)
    filtered.sort((a, b) => {
      const dateA = a.booking_date ? new Date(a.booking_date) : new Date(a.created_at);
      const dateB = b.booking_date ? new Date(b.booking_date) : new Date(b.created_at);
      return dateB - dateA; // Most recent first
    });
    
    return filtered;
  }, [bookings, filter]);

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    try {
      return new Intl.DateTimeFormat('en-IN', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      }).format(new Date(dateString));
    } catch (e) {
      return dateString;
    }
  };

  const formatTime = (timeString) => {
    if (!timeString) return '';
    try {
      const time = timeString.includes('T')
        ? new Date(timeString)
        : new Date(`2000-01-01T${timeString}`);
      return new Intl.DateTimeFormat('en-IN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      }).format(time);
    } catch (e) {
      return timeString;
    }
  };

  const formatPrice = (price) => {
    if (!price) return '₹0';
    return `₹${parseFloat(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const getStatusBadge = (booking) => {
    let displayStatus = (booking.voucher_state === 'pending_confirmation') ? 'pending_confirmation' : booking.status;
    // Past confirmed bookings should show as "Past" not "Confirmed"
    if (displayStatus === 'confirmed') {
      const dateStr = booking.booking_date;
      const timeStr = booking.booking_time || '00:00';
      const dt = dateStr ? new Date(`${dateStr}T${String(timeStr).trim().slice(0, 5) || '00:00'}:00`) : null;
      if (dt && dt < new Date()) displayStatus = 'past';
    }
    const statusMap = {
      'confirmed': { label: 'Confirmed', class: 'status-confirmed' },
      'past': { label: 'Past', class: 'status-completed' },
      'pending': { label: 'Pending', class: 'status-pending' },
      'pending_confirmation': { label: 'Awaiting Your Confirmation', class: 'status-pending' },
      'cancelled': { label: 'Cancelled', class: 'status-cancelled' },
      'redeemed': { label: 'Redeemed', class: 'status-redeemed' },
      'completed': { label: 'Completed', class: 'status-completed' }
    };
    const statusInfo = statusMap[displayStatus] || { label: displayStatus, class: 'status-default' };
    return (
      <span className={`status-badge ${statusInfo.class}`}>
        {statusInfo.label}
      </span>
    );
  };

  const handleViewDetails = (booking) => {
    navigate(`/booking/${booking.id}`, { state: { booking } });
  };

  const handleCancel = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_BASE}/api/v1/bookings/${bookingId}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      if (response.ok) {
        await loadBookings();
        setSelectedBooking(null);
      } else {
        const result = await response.json();
        alert(result?.message ?? result?.error ?? 'Failed to cancel booking');
      }
    } catch (err) {
      console.error('Error cancelling booking:', err);
      alert('Network error. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="elizian-auth-overlay">
        <div className="elizian-auth-modal-container">
          <div className="elizian-auth-modal">
            <p>Loading your bookings...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f14', color: '#f9fafb', padding: '2rem' }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>My Bookings</h1>
          <button
            onClick={() => navigate('/home')}
            style={{
              padding: '0.5rem 1rem',
              background: '#059669',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            ← Back to Home
          </button>
        </div>

        {error && (
          <div style={{
            background: '#fee',
            color: '#c00',
            padding: '1rem',
            borderRadius: '8px',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {/* Filter Tabs */}
        <div style={{
          display: 'flex',
          gap: '1rem',
          marginBottom: '2rem',
          borderBottom: '1px solid #374151',
          paddingBottom: '1rem'
        }}>
          {['all', 'upcoming', 'completed', 'cancelled', 'waitlist'].map((filterOption) => (
            <button
              key={filterOption}
              onClick={() => setFilter(filterOption)}
              style={{
                padding: '0.5rem 1rem',
                background: filter === filterOption ? '#059669' : 'transparent',
                color: filter === filterOption ? 'white' : '#9ca3af',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                textTransform: 'capitalize',
                fontWeight: filter === filterOption ? 'bold' : 'normal'
              }}
            >
              {filterOption}
            </button>
          ))}
        </div>

        {/* Waitlist Tab */}
        {filter === 'waitlist' && (
          waitlistLoading ? (
            <p style={{ color: '#9ca3af' }}>Loading waitlist…</p>
          ) : waitlistEntries.length === 0 ? (
            <EmptyState
              icon="📋"
              title="No waitlist entries"
              message="You haven't joined any waitlists. When a time slot is full, you can join the waitlist and we'll notify you when a spot opens."
              actionLabel="Explore Deals"
              onAction={() => navigate('/home')}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {waitlistEntries.map((entry) => (
                <div
                  key={entry.id}
                  style={{
                    background: '#1f2937',
                    borderRadius: '12px',
                    padding: '1.5rem',
                    border: '1px solid #d97706',
                    borderLeft: '4px solid #d97706'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '0.75rem' }}>
                    <h3 style={{ margin: 0, fontSize: '1.25rem', color: '#fbbf24' }}>
                      {entry.deal_title || entry.partner_name || 'Event'}
                    </h3>
                    <span style={{
                      background: '#d97706',
                      color: '#fff',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      textTransform: 'uppercase'
                    }}>
                      #{entry.position} {entry.status}
                    </span>
                  </div>
                  {(entry.partner_name || entry.partner_address) && (
                    <div style={{ marginBottom: '0.75rem', color: '#d1d5db', fontSize: '0.9rem' }}>
                      {entry.partner_name && (
                        <div style={{ fontWeight: 500 }}>{entry.partner_name}</div>
                      )}
                      {entry.partner_address && (
                        <div style={{ marginTop: '0.25rem', color: '#9ca3af', fontSize: '0.85rem' }}>
                          📍 {entry.partner_address}
                        </div>
                      )}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem', color: '#d1d5db', fontSize: '0.9rem' }}>
                    <div>
                      <span style={{ color: '#9ca3af' }}>Date:</span> {formatDate(entry.booking_date)}
                    </div>
                    <div>
                      <span style={{ color: '#9ca3af' }}>Time:</span> {formatTime(entry.booking_time)}
                    </div>
                    <div>
                      <span style={{ color: '#9ca3af' }}>Party size:</span> {entry.party_size}
                    </div>
                  </div>
                  <p style={{ margin: '0.75rem 0 0', fontSize: '0.85rem', color: '#9ca3af' }}>
                    We&apos;ll notify you when a spot opens for this time slot.
                  </p>
                </div>
              ))}
            </div>
          )
        )}

        {/* Bookings List (non-waitlist tabs) */}
        {filter !== 'waitlist' && (filteredBookings.length === 0 ? (
          <EmptyState
            icon="📋"
            title="No bookings found"
            message={filter === 'all'
              ? "You haven't made any bookings yet. Start exploring deals!"
              : `No ${filter} bookings found.`}
            actionLabel="Explore Deals"
            onAction={() => navigate('/home')}
          />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {filteredBookings.map((booking) => (
              <div
                key={booking.id}
                style={{
                  background: '#1f2937',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  border: '1px solid #374151'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '1rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 0.5rem 0', fontSize: '1.25rem' }}>
                      {booking.deal_title || booking.title || 'Booking'}
                    </h3>
                    <p style={{ margin: '0 0 0.5rem 0', color: '#9ca3af', fontSize: '0.9rem' }}>
                      Booking ID: {booking.booking_reference || booking.id}
                    </p>
                    {(booking.partner_name || booking.deal_title) && (
                      <p style={{ margin: '0 0 0.5rem 0', color: '#d1d5db', fontSize: '0.9rem' }}>
                        {booking.partner_name && <span>Venue: {booking.partner_name}</span>}
                        {booking.partner_name && booking.deal_title && ' · '}
                        {booking.deal_title && <span>Deal: {booking.deal_title}</span>}
                      </p>
                    )}
                  </div>
                  {getStatusBadge(booking)}
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                  gap: '1rem',
                  marginBottom: '1rem',
                  padding: '1rem',
                  background: '#111827',
                  borderRadius: '8px'
                }}>
                  {(booking.partner_name || booking.deal_title) && (
                    <>
                      {booking.partner_name && (
                        <div>
                          <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Venue</div>
                          <div style={{ fontWeight: '600' }}>{booking.partner_name}</div>
                        </div>
                      )}
                      {booking.deal_title && (
                        <div>
                          <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Deal / Event</div>
                          <div style={{ fontWeight: '600' }}>{booking.deal_title}</div>
                        </div>
                      )}
                    </>
                  )}
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Date & Time</div>
                    <div style={{ fontWeight: '600' }}>
                      {['spa', 'spa-and-salon', 'wellness', 'healthcare', 'travel', 'others'].includes((booking.service_type || '').toLowerCase())
                        ? `${formatDate(booking.booking_date || booking.created_at)} — Contact partner for time slot`
                        : `${formatDate(booking.booking_date || booking.created_at)}${booking.booking_time ? ` at ${formatTime(booking.booking_time)}` : ''}`}
                    </div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Guests/Tickets</div>
                    <div style={{ fontWeight: '600' }}>{booking.num_tickets || booking.num_guests || 1}</div>
                  </div>
                  <div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Amount</div>
                    <div style={{ fontWeight: '600', color: '#059669' }}>
                      {formatPrice(booking.total_price || booking.fiat_amount)}
                    </div>
                  </div>
                  {booking.points_earned > 0 && (
                    <div>
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Points Earned</div>
                      <div style={{ fontWeight: '600', color: '#f59e0b' }}>
                        {parseFloat(booking.points_earned).toFixed(0)} pts
                      </div>
                    </div>
                  )}
                </div>

                {booking.special_requests && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#111827',
                    borderRadius: '8px',
                    marginBottom: '1rem',
                    fontSize: '0.9rem',
                    color: '#d1d5db'
                  }}>
                    <strong>Special Requests:</strong> {booking.special_requests}
                  </div>
                )}

                {/* QR Code Preview – tap opens full voucher (same as after booking); "Show QR popup" for modal only */}
                {booking.qr_code_url && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '8px',
                    textAlign: 'center',
                    cursor: 'pointer',
                    transition: 'background 0.2s'
                  }}
                  onClick={() => handleViewDetails(booking)}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#1a1f2e'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Voucher (tap to open full view)</div>
                    <img
                      src={booking.qr_code_url.startsWith('http') ? booking.qr_code_url : `${API_BASE}${booking.qr_code_url.startsWith('/') ? '' : '/'}${booking.qr_code_url}`}
                      alt="Booking QR Code"
                      style={{
                        width: '120px',
                        height: '120px',
                        margin: '0 auto',
                        display: 'block',
                        borderRadius: '8px',
                        border: '2px solid #374151'
                      }}
                      onError={(e) => {
                        e.target.style.display = 'none';
                        const errorDiv = e.target.nextSibling;
                        if (errorDiv) errorDiv.style.display = 'block';
                      }}
                    />
                    <div style={{
                      display: 'none',
                      color: '#9ca3af',
                      fontSize: '0.85rem',
                      padding: '1rem'
                    }}>
                      QR Code unavailable
                    </div>
                    {booking.voucher_code && (
                      <div style={{
                        marginTop: '0.5rem',
                        color: '#9ca3af',
                        fontSize: '0.75rem',
                        fontFamily: 'monospace'
                      }}>
                        Code: {booking.voucher_code.substring(0, 8)}...
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedBooking(booking);
                        setQrModalOpen(true);
                      }}
                      style={{
                        marginTop: '0.5rem',
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        background: 'transparent',
                        color: '#9ca3af',
                        border: '1px solid #374151',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      Show QR popup
                    </button>
                  </div>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <button
                    onClick={() => handleViewDetails(booking)}
                    style={{
                      padding: '0.5rem 1rem',
                      background: '#059669',
                      color: 'white',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    View Details
                  </button>
                  {booking.status === 'confirmed' && (
                    <>
                      <button
                        onClick={() => navigate(`/booking/${booking.id}/reschedule`, { state: { booking } })}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'transparent',
                          color: '#059669',
                          border: '1px solid #059669',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Reschedule
                      </button>
                      <button
                        onClick={() => handleCancel(booking.id)}
                        style={{
                          padding: '0.5rem 1rem',
                          background: 'transparent',
                          color: '#ef4444',
                          border: '1px solid #ef4444',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '0.9rem'
                        }}
                      >
                        Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => {
          setQrModalOpen(false);
          setSelectedBooking(null);
        }}
        qrCodeUrl={selectedBooking?.qr_code_url ? (selectedBooking.qr_code_url.startsWith('http') ? selectedBooking.qr_code_url : `${API_BASE}${selectedBooking.qr_code_url.startsWith('/') ? '' : '/'}${selectedBooking.qr_code_url}`) : null}
        voucherCode={selectedBooking?.voucher_code}
        bookingReference={selectedBooking?.booking_reference || selectedBooking?.id}
      />
    </div>
  );
};

export default BookingHistory;


