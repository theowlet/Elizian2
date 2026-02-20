import React, { useState, useEffect } from 'react';
import '../styles/operatingHours.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

/**
 * Operating Hours Manager Component
 *
 * Partner Console UI for managing:
 * - Weekly operating hours (open/close times, break periods)
 * - Special closures (holidays, temporary closures)
 * - Accepting bookings toggle
 *
 * Usage in PartnerConsole.jsx:
 * <OperatingHoursManager partnerId={partner.id} token={token} />
 */

const DAYS_OF_WEEK = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' }
];

/** Normalize time to HH:MM (no seconds) for display and API */
function toHHMM(v) {
  if (v == null || v === '') return v;
  const s = String(v).trim();
  return s.length >= 5 ? s.slice(0, 5) : v;
}

const DEFAULT_HOURS = DAYS_OF_WEEK.map(day => ({
  day_of_week: day.value,
  day_label: day.label,
  is_closed: false,
  opens_at: '09:00',
  closes_at: '21:00',
  breaks: []
}));

export default function OperatingHoursManager({ partnerId, token }) {
  const [activeTab, setActiveTab] = useState('hours'); // 'hours' | 'closures'
  const [hours, setHours] = useState(DEFAULT_HOURS);
  const [closures, setClosures] = useState([]);
  const [acceptingBookings, setAcceptingBookings] = useState(true);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  // Closure form
  const [showClosureForm, setShowClosureForm] = useState(false);
  const [closureForm, setClosureForm] = useState({
    closure_date: '',
    closure_reason: '',
    is_full_day: true,
    custom_opens_at: '',
    custom_closes_at: ''
  });

  useEffect(() => {
    if (activeTab === 'hours') {
      fetchHours();
    } else if (activeTab === 'closures') {
      fetchClosures();
    }
  }, [activeTab]);

  const dayFromApi = (dayLabel, dayValue) => ({
    day_of_week: dayValue,
    day_label: dayLabel,
    is_closed: false,
    opens_at: '09:00',
    closes_at: '21:00',
    breaks: []
  });

  const mapApiDayToState = (dayLabel, dayValue, apiDay) => {
    if (!apiDay) return dayFromApi(dayLabel, dayValue);
    const breaks = Array.isArray(apiDay.breaks)
      ? apiDay.breaks.map(b => ({ start: b?.start ?? '', end: b?.end ?? '' }))
      : [];
    return {
      day_of_week: dayValue,
      day_label: dayLabel,
      is_closed: Boolean(apiDay.is_closed),
      opens_at: apiDay.opens_at ?? '09:00',
      closes_at: apiDay.closes_at ?? '21:00',
      breaks
    };
  };

  // Fetch operating hours
  const fetchHours = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/me/operating-hours`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));

      if (data.success && data.data && typeof data.data === 'object') {
        const hoursArray = DAYS_OF_WEEK.map(day => mapApiDayToState(day.label, day.value, data.data[day.label]));
        setHours(hoursArray);
      } else {
        // Always show 7-day grid; use defaults if API failed or returned no data
        setHours(DAYS_OF_WEEK.map(day => dayFromApi(day.label, day.value)));
        if (!res.ok || !data.success) {
          showMessage(data.message || data.error || 'Could not load hours. You can still edit and save below.', 'error');
        }
      }

      // Get accepting bookings status from partner profile
      try {
        const partnerRes = await fetch(`${API_BASE}/api/v1/partners/me`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        const partnerData = await partnerRes.json();
        if (partnerData.success && partnerData.data) {
          setAcceptingBookings(partnerData.data.accepting_bookings !== false);
        }
      } catch (_) {
        // non-blocking
      }
    } catch (error) {
      console.error('Error fetching hours:', error);
      const msg = error?.message === 'Failed to fetch' ? 'Cannot reach server. Is the backend running? (Check VITE_API_BASE_URL)' : 'Failed to load operating hours';
      showMessage(msg, 'error');
      setHours(DAYS_OF_WEEK.map(day => dayFromApi(day.label, day.value)));
    } finally {
      setLoading(false);
    }
  };

  // Fetch special closures
  const fetchClosures = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/me/special-closures?future_only=true`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.success) {
        setClosures(data.data || []);
      }
    } catch (error) {
      console.error('Error fetching closures:', error);
      const msg = error?.message === 'Failed to fetch' ? 'Cannot reach server. Is the backend running? (Check VITE_API_BASE_URL)' : 'Failed to load closures';
      showMessage(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleHourChange = (dayIndex, field, value) => {
    const normalized = ['opens_at', 'closes_at'].includes(field) ? (toHHMM(value) || value) : value;
    setHours(prev => {
      const updated = [...prev];
      updated[dayIndex] = { ...updated[dayIndex], [field]: normalized };
      return updated;
    });
  };

  const handleBreakChange = (dayIndex, breakIndex, field, value) => {
    const normalized = toHHMM(value) || value;
    setHours(prev => {
      const updated = [...prev];
      const day = updated[dayIndex];
      const breaks = [...(day.breaks || [])];
      if (!breaks[breakIndex]) breaks[breakIndex] = { start: '', end: '' };
      breaks[breakIndex] = { ...breaks[breakIndex], [field]: normalized };
      updated[dayIndex] = { ...day, breaks };
      return updated;
    });
  };

  const handleAddBreak = (dayIndex) => {
    setHours(prev => {
      const updated = [...prev];
      const day = updated[dayIndex];
      const breaks = [...(day.breaks || []), { start: '', end: '' }];
      updated[dayIndex] = { ...day, breaks };
      return updated;
    });
  };

  const handleRemoveBreak = (dayIndex, breakIndex) => {
    setHours(prev => {
      const updated = [...prev];
      const day = updated[dayIndex];
      const breaks = (day.breaks || []).filter((_, i) => i !== breakIndex);
      updated[dayIndex] = { ...day, breaks };
      return updated;
    });
  };

  // Save hours
  const saveHours = async () => {
    setSaving(true);
    try {
      const payload = hours.map(h => ({
        day_of_week: h.day_of_week,
        opens_at: h.is_closed ? null : (toHHMM(h.opens_at) || null),
        closes_at: h.is_closed ? null : (toHHMM(h.closes_at) || null),
        is_closed: h.is_closed,
        breaks: (h.breaks || [])
          .filter(b => b && b.start && b.end)
          .map(b => ({ start: toHHMM(b.start), end: toHHMM(b.end) }))
      }));

      const res = await fetch(`${API_BASE}/api/v1/partners/me/operating-hours`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ hours: payload })
      });

      const data = await res.json().catch(() => ({}));
      if (data.success) {
        showMessage('Operating hours updated successfully', 'success');
      } else {
        showMessage(data.message || data.error || 'Failed to update hours', 'error');
      }
    } catch (error) {
      console.error('Error saving hours:', error);
      const msg = error?.message === 'Failed to fetch' ? 'Cannot reach server. Is the backend running? (Check VITE_API_BASE_URL)' : (error?.message || 'Failed to save hours');
      showMessage(msg, 'error');
    } finally {
      setSaving(false);
    }
  };

  // Toggle accepting bookings
  const toggleAcceptingBookings = async () => {
    try {
      const newValue = !acceptingBookings;
      const res = await fetch(`${API_BASE}/api/v1/partners/me/accepting-bookings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ accepting: newValue })
      });

      const data = await res.json();
      if (data.success) {
        setAcceptingBookings(newValue);
        showMessage(
          newValue ? 'Bookings resumed' : 'Bookings paused',
          'success'
        );
      } else {
        showMessage(data.message || 'Failed to update status', 'error');
      }
    } catch (error) {
      console.error('Error toggling accepting bookings:', error);
      showMessage('Failed to update status', 'error');
    }
  };

  // Add closure
  const addClosure = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/me/special-closures`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          ...closureForm,
          custom_opens_at: toHHMM(closureForm.custom_opens_at) || closureForm.custom_opens_at,
          custom_closes_at: toHHMM(closureForm.custom_closes_at) || closureForm.custom_closes_at
        })
      });

      const data = await res.json();
      if (data.success) {
        showMessage('Closure added successfully', 'success');
        setShowClosureForm(false);
        setClosureForm({
          closure_date: '',
          closure_reason: '',
          is_full_day: true,
          custom_opens_at: '',
          custom_closes_at: ''
        });
        fetchClosures();
      } else {
        showMessage(data.message || 'Failed to add closure', 'error');
      }
    } catch (error) {
      console.error('Error adding closure:', error);
      showMessage('Failed to add closure', 'error');
    }
  };

  // Delete closure
  const deleteClosure = async (closureId) => {
    if (!confirm('Delete this closure?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/v1/partners/me/special-closures/${closureId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      const data = await res.json();
      if (data.success) {
        showMessage('Closure deleted', 'success');
        fetchClosures();
      } else {
        showMessage(data.message || 'Failed to delete closure', 'error');
      }
    } catch (error) {
      console.error('Error deleting closure:', error);
      showMessage('Failed to delete closure', 'error');
    }
  };

  const showMessage = (text, type = 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  };

  return (
    <div className="operating-hours-manager">
      {/* Header */}
      <div className="oh-header">
        <h2>Operating Hours & Availability</h2>
        <div className="oh-header-actions">
          <div className="oh-toggle">
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={acceptingBookings}
                onChange={toggleAcceptingBookings}
              />
              <span className="toggle-slider"></span>
            </label>
            <span className={`toggle-label ${acceptingBookings ? 'active' : 'paused'}`}>
              {acceptingBookings ? '✅ Accepting Bookings' : '⏸️ Bookings Paused'}
            </span>
          </div>
        </div>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`oh-message oh-message-${message.type}`}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="oh-tabs">
        <button
          className={`oh-tab ${activeTab === 'hours' ? 'active' : ''}`}
          onClick={() => setActiveTab('hours')}
        >
          Weekly Hours
        </button>
        <button
          className={`oh-tab ${activeTab === 'closures' ? 'active' : ''}`}
          onClick={() => setActiveTab('closures')}
        >
          Special Closures
        </button>
      </div>

      {/* Content */}
      <div className="oh-content">
        {loading ? (
          <div className="oh-loading">Loading...</div>
        ) : activeTab === 'hours' ? (
          <WeeklyHoursTab
            hours={hours}
            onHourChange={handleHourChange}
            onBreakChange={handleBreakChange}
            onAddBreak={handleAddBreak}
            onRemoveBreak={handleRemoveBreak}
            onSave={saveHours}
            saving={saving}
          />
        ) : (
          <ClosuresTab
            closures={closures}
            showForm={showClosureForm}
            setShowForm={setShowClosureForm}
            closureForm={closureForm}
            setClosureForm={setClosureForm}
            onAddClosure={addClosure}
            onDeleteClosure={deleteClosure}
          />
        )}
      </div>
    </div>
  );
}

function WeeklyHoursTab({ hours, onHourChange, onBreakChange, onAddBreak, onRemoveBreak, onSave, saving }) {
  return (
    <div className="weekly-hours-tab">
      <div className="hours-grid">
        {hours.map((day, index) => (
          <div key={day.day_of_week} className="hours-row">
            <div className="hours-day">
              <label className="day-checkbox">
                <input
                  type="checkbox"
                  checked={!day.is_closed}
                  onChange={(e) => onHourChange(index, 'is_closed', !e.target.checked)}
                />
                <span className="day-label">{day.day_label}</span>
              </label>
            </div>

            {!day.is_closed ? (
              <>
                <div className="hours-time">
                  <label>Opens</label>
                  <input
                    type="time"
                    step="60"
                    value={toHHMM(day.opens_at) || '09:00'}
                    onChange={(e) => onHourChange(index, 'opens_at', e.target.value)}
                  />
                </div>

                <div className="hours-time">
                  <label>Closes</label>
                  <input
                    type="time"
                    step="60"
                    value={toHHMM(day.closes_at) || '21:00'}
                    onChange={(e) => onHourChange(index, 'closes_at', e.target.value)}
                  />
                </div>

                <div className="hours-breaks">
                  <label>Breaks (optional)</label>
                  {(day.breaks || []).map((brk, breakIndex) => (
                    <div key={breakIndex} className="break-row">
                      <input
                        type="time"
                        step="60"
                        placeholder="Start"
                        aria-label={`Break ${breakIndex + 1} start`}
                        value={toHHMM(brk.start) || ''}
                        onChange={(e) => onBreakChange(index, breakIndex, 'start', e.target.value)}
                      />
                      <span>to</span>
                      <input
                        type="time"
                        step="60"
                        placeholder="End"
                        aria-label={`Break ${breakIndex + 1} end`}
                        value={toHHMM(brk.end) || ''}
                        onChange={(e) => onBreakChange(index, breakIndex, 'end', e.target.value)}
                      />
                      <button
                        type="button"
                        className="btn-remove-break"
                        onClick={() => onRemoveBreak(index, breakIndex)}
                        aria-label="Remove break"
                        title="Remove break"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="btn-add-break"
                    onClick={() => onAddBreak(index)}
                  >
                    + Add break
                  </button>
                </div>
              </>
            ) : (
              <div className="hours-closed">
                <span>Closed</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="hours-actions">
        <button className="btn btn-primary" onClick={onSave} disabled={saving}>
          {saving ? 'Saving...' : 'Save Hours'}
        </button>
      </div>
    </div>
  );
}

function ClosuresTab({ closures, showForm, setShowForm, closureForm, setClosureForm, onAddClosure, onDeleteClosure }) {
  return (
    <div className="closures-tab">
      <div className="closures-header">
        <p>Manage holidays, temporary closures, or modified operating hours</p>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : '+ Add Closure'}
        </button>
      </div>

      {showForm && (
        <form className="closure-form" onSubmit={onAddClosure}>
          <div className="form-row">
            <div className="form-group">
              <label>Date*</label>
              <input
                type="date"
                required
                value={closureForm.closure_date}
                onChange={(e) => setClosureForm({ ...closureForm, closure_date: e.target.value })}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div className="form-group">
              <label>Reason</label>
              <input
                type="text"
                placeholder="e.g., Christmas Day, Maintenance"
                value={closureForm.closure_reason}
                onChange={(e) => setClosureForm({ ...closureForm, closure_reason: e.target.value })}
              />
            </div>
          </div>

          <div className="form-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={closureForm.is_full_day}
                onChange={(e) => setClosureForm({ ...closureForm, is_full_day: e.target.checked })}
              />
              Full Day Closure
            </label>
          </div>

          {!closureForm.is_full_day && (
            <div className="form-row">
              <div className="form-group">
                <label>Custom Opens At*</label>
                <input
                  type="time"
                  step="60"
                  required={!closureForm.is_full_day}
                  value={toHHMM(closureForm.custom_opens_at) || closureForm.custom_opens_at}
                  onChange={(e) => setClosureForm({ ...closureForm, custom_opens_at: toHHMM(e.target.value) || e.target.value })}
                />
              </div>

              <div className="form-group">
                <label>Custom Closes At*</label>
                <input
                  type="time"
                  step="60"
                  required={!closureForm.is_full_day}
                  value={toHHMM(closureForm.custom_closes_at) || closureForm.custom_closes_at}
                  onChange={(e) => setClosureForm({ ...closureForm, custom_closes_at: toHHMM(e.target.value) || e.target.value })}
                />
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary">
            Add Closure
          </button>
        </form>
      )}

      <div className="closures-list">
        {closures.length === 0 ? (
          <div className="empty-state">
            No special closures scheduled
          </div>
        ) : (
          closures.map((closure) => (
            <div key={closure.id} className="closure-card">
              <div className="closure-info">
                <div className="closure-date">
                  {new Date(closure.closure_date).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </div>
                <div className="closure-reason">{closure.closure_reason || 'No reason provided'}</div>
                {closure.is_full_day ? (
                  <div className="closure-type">Full Day Closure</div>
                ) : (
                  <div className="closure-type">
                    Modified Hours: {toHHMM(closure.custom_opens_at)} - {toHHMM(closure.custom_closes_at)}
                  </div>
                )}
              </div>
              <button
                className="btn btn-danger btn-sm"
                onClick={() => onDeleteClosure(closure.id)}
              >
                Delete
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
