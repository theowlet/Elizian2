import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCodeModal from '../components/QRCodeModal';
import EmptyState from '../components/EmptyState';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const BookingHistory = () => {
  const navigate = useNavigate();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all'); // all, upcoming, completed, cancelled
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);

  useEffect(() => {
    loadBookings();
  }, []);

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
    
    let filtered = [...bookings];
    
    // Apply status filter
    if (filter === 'upcoming') {
      filtered = filtered.filter(b => {
        const bookingDate = b.booking_date ? new Date(b.booking_date) : null;
        const now = new Date();
        return bookingDate && bookingDate >= now && b.status === 'confirmed';
      });
    } else if (filter === 'completed') {
      filtered = filtered.filter(b => b.status === 'confirmed' || b.status === 'redeemed');
    } else if (filter === 'cancelled') {
      filtered = filtered.filter(b => b.status === 'cancelled');
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

  const getStatusBadge = (status) => {
    const statusMap = {
      'confirmed': { label: 'Confirmed', class: 'status-confirmed' },
      'pending': { label: 'Pending', class: 'status-pending' },
      'cancelled': { label: 'Cancelled', class: 'status-cancelled' },
      'redeemed': { label: 'Redeemed', class: 'status-redeemed' },
      'completed': { label: 'Completed', class: 'status-completed' }
    };
    const statusInfo = statusMap[status] || { label: status, class: 'status-default' };
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
        await loadBookings(); // Reload bookings
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
          {['all', 'upcoming', 'completed', 'cancelled'].map((filterOption) => (
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

        {/* Bookings List */}
        {filteredBookings.length === 0 ? (
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
                  {getStatusBadge(booking.status)}
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
                      {formatDate(booking.booking_date || booking.created_at)}
                      {booking.booking_time ? ` at ${formatTime(booking.booking_time)}` : ''}
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

                {/* QR Code Preview (if available) */}
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
                  onClick={() => {
                    setSelectedBooking(booking);
                    setQrModalOpen(true);
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#1a1f2e'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#111827'}
                  >
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.5rem' }}>Voucher QR Code (Click to view)</div>
                    <img
                      src={booking.qr_code_url}
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
        )}
      </div>

      {/* QR Code Modal */}
      <QRCodeModal
        isOpen={qrModalOpen}
        onClose={() => {
          setQrModalOpen(false);
          setSelectedBooking(null);
        }}
        qrCodeUrl={selectedBooking?.qr_code_url}
        voucherCode={selectedBooking?.voucher_code}
        bookingReference={selectedBooking?.booking_reference || selectedBooking?.id}
      />
    </div>
  );
};

export default BookingHistory;


