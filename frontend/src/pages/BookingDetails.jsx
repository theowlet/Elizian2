import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const BookingDetails = () => {
  const navigate = useNavigate();
  const { id } = useParams();
  const location = useLocation();
  const [booking, setBooking] = useState(location.state?.booking || null);
  const [loading, setLoading] = useState(!booking);
  const [error, setError] = useState('');
  const [qrCodeLoading, setQrCodeLoading] = useState(false);

  useEffect(() => {
    if (!booking && id) {
      loadBookingDetails();
    }
  }, [id, booking]);

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
          setBooking(result.data);
          setQrCodeLoading(false);
          // If QR code was just generated, it will be in the response
          if (result.data.qr_code_url) {
            setQrCodeLoading(false);
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
          setError('Failed to load booking details');
        }
      }
    } catch (err) {
      console.error('Error loading booking:', err);
      setError('Network error. Please try again.');
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

  return (
    <div style={{ minHeight: '100vh', background: '#0b0f14', color: '#f9fafb', padding: '2rem' }}>
      <div style={{ maxWidth: '800px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: 'bold' }}>Booking Details</h1>
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

        {/* Voucher Card */}
        <div style={{
          background: 'linear-gradient(135deg, #059669, #047857)',
          borderRadius: '16px',
          padding: '2rem',
          marginBottom: '2rem',
          color: 'white',
          boxShadow: '0 10px 30px rgba(5, 150, 105, 0.3)'
        }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ marginBottom: '0.5rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
              <img 
                src="/assets/z.png" 
                alt="Elizian Logo" 
                style={{ 
                  width: '60px', 
                  height: '60px', 
                  objectFit: 'contain',
                  filter: 'brightness(0) invert(1)' // Make logo white on green background
                }}
                onError={(e) => {
                  // Fallback to text if image fails to load
                  e.target.style.display = 'none';
                  const fallback = document.createElement('div');
                  fallback.textContent = 'Elizian';
                  fallback.style.cssText = 'font-size: 1.5rem; font-weight: bold; color: white;';
                  e.target.parentNode.appendChild(fallback);
                }}
              />
            </div>
            <h2 style={{ margin: 0, fontSize: '1.5rem' }}>Booking Voucher</h2>
          </div>
          
          <div style={{
            background: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '12px',
            padding: '1.5rem',
            marginBottom: '1rem'
          }}>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Booking Reference</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 'bold', letterSpacing: '0.05em' }}>
                {booking.booking_reference || booking.id}
              </div>
            </div>
            
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Deal / Event</div>
              <div style={{ fontSize: '1.1rem', fontWeight: '600' }}>
                {booking.deal_title || booking.title || 'N/A'}
              </div>
            </div>
            
            {booking.partner_name && (
              <div style={{ marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Partner</div>
                <div style={{ fontSize: '1rem', fontWeight: '600' }}>
                  {booking.partner_name}
                </div>
              </div>
            )}
          </div>

          {/* QR Code Display */}
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '2rem',
            textAlign: 'center',
            marginBottom: '1rem'
          }}>
            {booking.qr_code_url ? (
              <>
                <img
                  src={booking.qr_code_url}
                  alt="Booking QR Code"
                  style={{
                    width: '250px',
                    height: '250px',
                    margin: '0 auto',
                    display: 'block',
                    borderRadius: '8px',
                    border: '2px solid #e5e7eb'
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const errorDiv = e.target.nextSibling;
                    if (errorDiv) errorDiv.style.display = 'flex';
                  }}
                />
                <div style={{
                  display: 'none',
                  width: '250px',
                  height: '250px',
                  margin: '0 auto',
                  background: '#f3f4f6',
                  borderRadius: '8px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  fontSize: '0.9rem',
                  flexDirection: 'column'
                }}>
                  <div>QR Code unavailable</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Please contact support
                  </div>
                </div>
                <div style={{ marginTop: '1rem', color: '#333', fontSize: '0.85rem', fontWeight: '500' }}>
                  Show this QR code at the venue for redemption
                </div>
                {booking.voucher_code && (
                  <div style={{
                    marginTop: '0.75rem',
                    padding: '0.5rem',
                    background: '#f9fafb',
                    borderRadius: '6px',
                    color: '#666',
                    fontSize: '0.8rem',
                    fontFamily: 'monospace'
                  }}>
                    Voucher Code: {booking.voucher_code}
                  </div>
                )}
                <button
                  onClick={() => {
                    // Download QR code
                    const link = document.createElement('a');
                    link.href = booking.qr_code_url;
                    link.download = `voucher-${booking.booking_reference || booking.id}.png`;
                    link.click();
                  }}
                  style={{
                    marginTop: '1rem',
                    padding: '0.5rem 1rem',
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '0.85rem'
                  }}
                >
                  Download QR Code
                </button>
              </>
            ) : (
              <div style={{
                width: '200px',
                height: '200px',
                margin: '0 auto',
                background: '#f3f4f6',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#666',
                fontSize: '0.9rem',
                flexDirection: 'column'
              }}>
                <div>QR Code</div>
                {qrCodeLoading ? (
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#9ca3af' }}>
                    Generating...
                  </div>
                ) : (
                  <>
                    <div style={{ fontSize: '0.75rem', marginTop: '0.5rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      QR code not available
                    </div>
                    {booking.voucher_code && (
                      <button
                        onClick={async () => {
                          setQrCodeLoading(true);
                          await loadBookingDetails();
                        }}
                        style={{
                          padding: '0.5rem 1rem',
                          background: '#059669',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '0.8rem',
                          marginTop: '0.5rem'
                        }}
                      >
                        Generate QR Code
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Redemption Status */}
          <div style={{
            background: booking.status === 'redeemed' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.1)',
            borderRadius: '8px',
            padding: '1rem',
            textAlign: 'center'
          }}>
            <div style={{ fontSize: '0.9rem', opacity: 0.9, marginBottom: '0.25rem' }}>Redemption Status</div>
            <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
              {booking.status === 'redeemed' ? '✅ Redeemed' : '⏳ Not Redeemed'}
            </div>
            {booking.status === 'redeemed' && booking.voucher_code && (
              <div style={{
                marginTop: '0.5rem',
                fontSize: '0.8rem',
                opacity: 0.8,
                fontFamily: 'monospace'
              }}>
                Redeemed with code: {booking.voucher_code.substring(0, 8)}...
              </div>
            )}
          </div>
        </div>

        {/* Booking Information */}
        <div style={{
          background: '#1f2937',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: '1px solid #374151'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Booking Information</h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Date & Time</div>
              <div style={{ fontWeight: '600' }}>
                {/* CRITICAL: Always use booking_date if available, never fallback to created_at for display */}
                {booking.booking_date ? (
                  <>
                    {formatDate(booking.booking_date)}
                    {booking.booking_time ? (
                      <span style={{ marginLeft: '0.5rem', color: '#6b7280' }}>
                        at {formatTime(booking.booking_time)}
                      </span>
                    ) : (
                      <span style={{ marginLeft: '0.5rem', color: '#ef4444', fontSize: '0.85rem' }}>
                        (Time not set)
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ color: '#ef4444' }}>
                    Date not set (using: {formatDate(booking.created_at)})
                  </span>
                )}
              </div>
            </div>
            
            <div>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Guests/Tickets</div>
              <div style={{ fontWeight: '600' }}>{booking.num_tickets || booking.num_guests || 1}</div>
            </div>
            
            <div>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Status</div>
              {getStatusBadge(booking.status)}
            </div>
            
            <div>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Total Amount</div>
              <div style={{ fontWeight: '600', color: '#059669' }}>
                {formatPrice(booking.total_price || booking.fiat_amount)}
              </div>
            </div>
          </div>

          {booking.special_requests && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#111827',
              borderRadius: '8px'
            }}>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Special Requests</div>
              <div style={{ color: '#d1d5db' }}>{booking.special_requests}</div>
            </div>
          )}

          {booking.points_earned > 0 && (
            <div style={{
              marginTop: '1rem',
              padding: '1rem',
              background: '#111827',
              borderRadius: '8px'
            }}>
              <div style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '0.25rem' }}>Loyalty Points Earned</div>
              <div style={{ color: '#f59e0b', fontWeight: '600', fontSize: '1.1rem' }}>
                {parseFloat(booking.points_earned).toFixed(0)} points
              </div>
            </div>
          )}
        </div>

        {/* Redemption Instructions */}
        <div style={{
          background: '#1f2937',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '1.5rem',
          border: '1px solid #374151'
        }}>
          <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.25rem' }}>Redemption Instructions</h3>
          <div style={{ color: '#d1d5db', lineHeight: '1.6' }}>
            <ol style={{ paddingLeft: '1.5rem', margin: 0 }}>
              <li style={{ marginBottom: '0.5rem' }}>Arrive at the partner venue on the scheduled date and time</li>
              <li style={{ marginBottom: '0.5rem' }}>Show your booking reference or QR code to the staff</li>
              <li style={{ marginBottom: '0.5rem' }}>Pay the amount directly at the venue</li>
              <li style={{ marginBottom: '0.5rem' }}>Enjoy your experience!</li>
            </ol>
          </div>
        </div>

        {/* Actions */}
        {booking.status === 'confirmed' && (
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <button
              onClick={() => navigate(`/booking/${booking.id}/reschedule`, { state: { booking } })}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'transparent',
                color: '#059669',
                border: '1px solid #059669',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Reschedule Booking
            </button>
            <button
              onClick={async () => {
                if (!window.confirm('Are you sure you want to cancel this booking?')) return;
                try {
                  const token = localStorage.getItem('token');
                  const response = await fetch(`${API_BASE}/api/v1/bookings/${booking.id}/cancel`, {
                    method: 'PUT',
                    headers: {
                      'Authorization': `Bearer ${token}`,
                      'Content-Type': 'application/json'
                    }
                  });
                  if (response.ok) {
                    navigate('/bookings');
                  } else {
                    const result = await response.json();
                    alert(result.error || 'Failed to cancel booking');
                  }
                } catch (err) {
                  alert('Network error. Please try again.');
                }
              }}
              style={{
                padding: '0.75rem 1.5rem',
                background: 'transparent',
                color: '#ef4444',
                border: '1px solid #ef4444',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '0.9rem'
              }}
            >
              Cancel Booking
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookingDetails;


