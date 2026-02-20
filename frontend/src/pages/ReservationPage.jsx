import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const ReservationPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const { partnerId, partnerName, bookingId } = location.state || {};

  const [step, setStep] = useState(1); // 1=form, 2=confirm, 3=success
  const [loading, setLoading] = useState(false);
  const [slots, setSlots] = useState([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [reservation, setReservation] = useState(null);

  // Form fields
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [partySize, setPartySize] = useState(2);
  const [occasion, setOccasion] = useState('');
  const [seating, setSeating] = useState('');
  const [specialReqs, setSpecialReqs] = useState('');

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) navigate('/login');
    if (!partnerId) navigate('/home');
  }, []);

  // Load time slots when date or partySize changes
  useEffect(() => {
    if (date && partnerId) loadTimeSlots();
  }, [date, partySize]);

  const loadTimeSlots = async () => {
    setLoadingSlots(true);
    try {
      const params = new URLSearchParams({ partnerId, date, partySize: String(partySize) });
      const res = await fetch(`${API_BASE}/api/v1/reservations/time-slots?${params}`, { headers });
      const data = await res.json();
      if (data.success) {
        setSlots(Array.isArray(data.data) ? data.data : []);
      } else {
        setSlots([]);
      }
    } catch (_) {
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleConfirm = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/reservations`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          bookingId: bookingId || null,
          partnerId,
          reservationDate: date,
          reservationTime: time,
          partySize,
          occasion: occasion || undefined,
          specialRequests: specialReqs || undefined,
          seatingPreference: seating || undefined,
        })
      });
      const data = await res.json();
      if (data.success) {
        setReservation(data.data);
        setStep(3);
      } else {
        alert(data.message || 'Failed to create reservation');
      }
    } catch (err) {
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const occasions = ['Birthday', 'Anniversary', 'Date Night', 'Business', 'Celebration', 'Casual'];
  const seatings = ['Indoor', 'Outdoor', 'Bar', 'Private Room', 'No Preference'];

  const todayStr = new Date().toISOString().split('T')[0];

  /* ---- STEP 3: SUCCESS ---- */
  if (step === 3) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.successWrap}>
            <div style={s.successCheckBg}>
              <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
                <circle cx="24" cy="24" r="24" fill="#10b981" />
                <path d="M14 24L21 31L34 18" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 style={s.successTitle}>Reservation Confirmed!</h2>
            <p style={s.successSub}>You're all set. See you there!</p>

            <div style={s.confirmCard}>
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Venue</span>
                <span style={s.confirmValue}>{partnerName || 'Restaurant'}</span>
              </div>
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Date</span>
                <span style={s.confirmValue}>
                  {new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long' })}
                </span>
              </div>
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Time</span>
                <span style={s.confirmValue}>{time}</span>
              </div>
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Party Size</span>
                <span style={s.confirmValue}>{partySize} {partySize === 1 ? 'guest' : 'guests'}</span>
              </div>
              {occasion && (
                <div style={s.confirmRow}>
                  <span style={s.confirmLabel}>Occasion</span>
                  <span style={s.confirmValue}>{occasion}</span>
                </div>
              )}
              {seating && (
                <div style={s.confirmRow}>
                  <span style={s.confirmLabel}>Seating</span>
                  <span style={s.confirmValue}>{seating}</span>
                </div>
              )}
            </div>

            <button onClick={() => navigate('/bookings')} style={s.primaryBtn}>View My Bookings</button>
            <button onClick={() => navigate('/home')} style={s.ghostBtn}>Back to Home</button>
          </div>
        </div>
      </div>
    );
  }

  /* ---- STEP 2: REVIEW ---- */
  if (step === 2) {
    return (
      <div style={s.page}>
        <div style={s.container}>
          <div style={s.header}>
            <button onClick={() => setStep(1)} style={s.backBtn}>← Back</button>
            <h1 style={s.headerTitle}>Confirm Reservation</h1>
            <div style={{ width: '60px' }} />
          </div>

          <div style={s.confirmCard}>
            <div style={s.confirmRow}>
              <span style={s.confirmLabel}>Venue</span>
              <span style={s.confirmValue}>{partnerName || 'Restaurant'}</span>
            </div>
            <div style={s.confirmRow}>
              <span style={s.confirmLabel}>Date</span>
              <span style={s.confirmValue}>
                {new Date(date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
              </span>
            </div>
            <div style={s.confirmRow}>
              <span style={s.confirmLabel}>Time</span>
              <span style={s.confirmValue}>{time}</span>
            </div>
            <div style={s.confirmRow}>
              <span style={s.confirmLabel}>Guests</span>
              <span style={s.confirmValue}>{partySize}</span>
            </div>
            {occasion && (
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Occasion</span>
                <span style={s.confirmValue}>{occasion}</span>
              </div>
            )}
            {seating && (
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Seating</span>
                <span style={s.confirmValue}>{seating}</span>
              </div>
            )}
            {specialReqs && (
              <div style={s.confirmRow}>
                <span style={s.confirmLabel}>Requests</span>
                <span style={s.confirmValue}>{specialReqs}</span>
              </div>
            )}
          </div>

          <button onClick={handleConfirm} disabled={loading} style={{ ...s.primaryBtn, opacity: loading ? 0.6 : 1 }}>
            {loading ? 'Reserving...' : 'Confirm Reservation'}
          </button>
          <button onClick={() => setStep(1)} style={s.ghostBtn}>Edit Details</button>
        </div>
      </div>
    );
  }

  /* ---- STEP 1: FORM ---- */
  return (
    <div style={s.page}>
      <div style={s.container}>
        <div style={s.header}>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.headerTitle}>Book a Table</h1>
          <div style={{ width: '60px' }} />
        </div>

        {/* Venue info */}
        <div style={s.venueBar}>
          <div style={s.venueAvatar}>{partnerName?.charAt(0)?.toUpperCase() || '🍽️'}</div>
          <div style={s.venueName}>{partnerName || 'Restaurant'}</div>
        </div>

        {/* Date */}
        <label style={s.label}>Date *</label>
        <input
          type="date"
          value={date}
          min={todayStr}
          onChange={(e) => setDate(e.target.value)}
          style={s.input}
        />

        {/* Party Size */}
        <label style={s.label}>Number of Guests *</label>
        <div style={s.counterRow}>
          <button onClick={() => setPartySize(Math.max(1, partySize - 1))} style={s.counterBtn}>−</button>
          <span style={s.counterVal}>{partySize}</span>
          <button onClick={() => setPartySize(Math.min(20, partySize + 1))} style={s.counterBtn}>+</button>
        </div>

        {/* Time Slots */}
        <label style={s.label}>Time *</label>
        {!date ? (
          <p style={s.hint}>Select a date first</p>
        ) : loadingSlots ? (
          <p style={s.hint}>Loading available times...</p>
        ) : slots.length === 0 ? (
          <div>
            <p style={s.hint}>No pre-defined slots. Enter your preferred time:</p>
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} style={s.input} />
          </div>
        ) : (
          <div style={s.slotsGrid}>
            {slots.map((slot) => (
              <button
                key={slot.time || slot}
                onClick={() => setTime(slot.time || slot)}
                style={{
                  ...s.slotBtn,
                  ...(time === (slot.time || slot) ? { background: '#004f4a', color: '#fff', borderColor: '#004f4a' } : {}),
                  ...(slot.available === false ? { opacity: 0.4, pointerEvents: 'none' } : {}),
                }}
              >
                {slot.time || slot}
              </button>
            ))}
          </div>
        )}

        {/* Occasion */}
        <label style={s.label}>Occasion</label>
        <div style={s.chipsRow}>
          {occasions.map((o) => (
            <button
              key={o}
              onClick={() => setOccasion(occasion === o ? '' : o)}
              style={{
                ...s.chip,
                ...(occasion === o ? { background: '#004f4a', color: '#fff', borderColor: '#004f4a' } : {}),
              }}
            >
              {o}
            </button>
          ))}
        </div>

        {/* Seating */}
        <label style={s.label}>Seating Preference</label>
        <div style={s.chipsRow}>
          {seatings.map((seat) => (
            <button
              key={seat}
              onClick={() => setSeating(seating === seat ? '' : seat)}
              style={{
                ...s.chip,
                ...(seating === seat ? { background: '#004f4a', color: '#fff', borderColor: '#004f4a' } : {}),
              }}
            >
              {seat}
            </button>
          ))}
        </div>

        {/* Special requests */}
        <label style={s.label}>Special Requests</label>
        <textarea
          value={specialReqs}
          onChange={(e) => setSpecialReqs(e.target.value)}
          placeholder="Allergies, accessibility needs, high chair..."
          style={s.textarea}
          rows={3}
        />

        {/* Submit */}
        <button
          onClick={() => setStep(2)}
          disabled={!date || !time}
          style={{ ...s.primaryBtn, opacity: (!date || !time) ? 0.5 : 1 }}
        >
          Review Reservation
        </button>
      </div>
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', paddingBottom: '5rem' },
  container: { maxWidth: '480px', margin: '0 auto', padding: '0 1rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' },
  backBtn: { background: 'none', border: 'none', color: '#004f4a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' },
  headerTitle: { fontSize: '1.15rem', fontWeight: 700, color: '#1f2937', margin: 0 },

  venueBar: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.75rem 1rem', background: '#fff', borderRadius: '12px', marginBottom: '1.25rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  venueAvatar: { width: '40px', height: '40px', borderRadius: '10px', background: 'linear-gradient(135deg, #004f4a, #059669)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '1.1rem' },
  venueName: { fontWeight: 600, fontSize: '1rem', color: '#1f2937' },

  label: { display: 'block', fontWeight: 600, fontSize: '0.85rem', color: '#374151', marginBottom: '0.4rem', marginTop: '1rem' },
  input: { width: '100%', padding: '0.7rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' },
  textarea: { width: '100%', padding: '0.7rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: '10px', fontSize: '0.9rem', outline: 'none', fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box' },
  hint: { fontSize: '0.8rem', color: '#9ca3af', margin: '0.25rem 0' },

  counterRow: { display: 'flex', alignItems: 'center', gap: '1rem', background: '#fff', padding: '0.5rem 1rem', borderRadius: '10px', border: '1px solid #e5e7eb', width: 'fit-content' },
  counterBtn: { width: '32px', height: '32px', borderRadius: '50%', border: '1px solid #e5e7eb', background: '#fff', fontSize: '1.1rem', cursor: 'pointer', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  counterVal: { fontSize: '1.1rem', fontWeight: 700, minWidth: '30px', textAlign: 'center' },

  slotsGrid: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  slotBtn: { padding: '0.5rem 0.85rem', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', fontSize: '0.85rem', cursor: 'pointer', fontWeight: 500, transition: 'all 0.15s' },

  chipsRow: { display: 'flex', flexWrap: 'wrap', gap: '0.4rem' },
  chip: { padding: '0.4rem 0.75rem', border: '1px solid #e5e7eb', borderRadius: '20px', background: '#fff', fontSize: '0.8rem', cursor: 'pointer', transition: 'all 0.15s' },

  primaryBtn: { width: '100%', padding: '0.85rem', background: '#004f4a', color: '#fff', border: 'none', borderRadius: '12px', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', marginTop: '1.5rem' },
  ghostBtn: { width: '100%', padding: '0.7rem', background: 'transparent', color: '#6b7280', border: '1px solid #e5e7eb', borderRadius: '12px', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.5rem' },

  /* Confirm */
  confirmCard: { background: '#fff', borderRadius: '14px', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', marginBottom: '1rem' },
  confirmRow: { display: 'flex', justifyContent: 'space-between', padding: '0.6rem 0', borderBottom: '1px solid #f3f4f6' },
  confirmLabel: { fontSize: '0.8rem', color: '#6b7280' },
  confirmValue: { fontSize: '0.85rem', fontWeight: 600, color: '#1f2937', textAlign: 'right', maxWidth: '60%' },

  /* Success */
  successWrap: { textAlign: 'center', paddingTop: '3rem' },
  successCheckBg: { marginBottom: '1rem' },
  successTitle: { fontSize: '1.5rem', fontWeight: 800, color: '#1f2937', margin: '0 0 0.25rem' },
  successSub: { color: '#6b7280', fontSize: '0.9rem', marginBottom: '1.5rem' },
};

export default ReservationPage;
