import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PasswordVisibilityToggle from '../components/PasswordVisibilityToggle';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * M-PIN Setup Screen
 * 
 * Shown immediately after first-time registration/login
 * User must create a 4-digit M-PIN before proceeding
 */
const MPinSetupScreen = () => {
  const navigate = useNavigate();
  const [mpin, setMpin] = useState('');
  const [confirmMpin, setConfirmMpin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user info from localStorage (set after registration)
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    
    if (!token || !userStr) {
      // User not logged in - redirect to login
      navigate('/login');
      return;
    }

    try {
      setUser(JSON.parse(userStr));
    } catch (e) {
      console.error('Error parsing user data:', e);
      navigate('/login');
    }
  }, [navigate]);

  const validateMpin = (pin) => {
    if (!pin) return 'M-PIN is required';
    if (!/^\d{4}$/.test(pin)) return 'M-PIN must be exactly 4 digits';
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    // Validate M-PIN
    const mpinError = validateMpin(mpin);
    if (mpinError) {
      setError(mpinError);
      return;
    }

    // Validate confirmation
    if (mpin !== confirmMpin) {
      setError('M-PINs do not match');
      return;
    }

    setLoading(true);

    try {
      const token = localStorage.getItem('token');
      if (!token) {
        throw new Error('Session expired. Please login again.');
      }

      const response = await fetch(`${API_BASE}/api/v1/auth/set-mpin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ mpin })
      });

      const result = await response.json();

      if (result.success || response.ok) {
        // M-PIN set successfully - check for pending booking
        const pendingBooking = sessionStorage.getItem('pendingBooking');
        if (pendingBooking) {
          try {
            const bookingData = JSON.parse(pendingBooking);
            console.log('📋 Resuming booking after M-PIN setup:', bookingData);
            alert('M-PIN set successfully!');
            navigate('/events/booking', {
              state: {
                dealId: bookingData.dealId,
                serviceType: bookingData.serviceType,
                partnerId: bookingData.partnerId
              }
            });
            sessionStorage.removeItem('pendingBooking');
            return;
          } catch (err) {
            console.error('Error parsing pending booking:', err);
          }
        }
        
        // No pending booking - proceed to home
        alert('M-PIN set successfully!');
        navigate('/home');
      } else {
        throw new Error(result?.message ?? result?.error ?? 'Failed to set M-PIN');
      }
    } catch (err) {
      console.error('M-PIN setup error:', err);
      setError(err.message || 'Failed to set M-PIN. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return null; // Loading or redirecting
  }

  return (
    <div className="elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal">
          <h2 className="elizian-auth-modal-title">Create M-PIN</h2>
          <p className="elizian-auth-modal-subtitle">
            Set a 4-digit M-PIN for faster login
          </p>

          <form className="elizian-auth-form" onSubmit={handleSubmit}>
            {error && <div className="elizian-auth-error" role="alert">{error}</div>}

            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">Enter 4-Digit M-PIN</label>
              <PasswordVisibilityToggle
                id="mpin"
                value={mpin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setMpin(value);
                  setError('');
                }}
                placeholder="Enter 4 digits"
                maxLength={4}
                inputMode="numeric"
                autoFocus={true}
                error={mpin && validateMpin(mpin) ? validateMpin(mpin) : null}
              />
            </div>

            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">Confirm M-PIN</label>
              <PasswordVisibilityToggle
                id="confirmMpin"
                value={confirmMpin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setConfirmMpin(value);
                  setError('');
                }}
                placeholder="Confirm 4 digits"
                maxLength={4}
                inputMode="numeric"
                error={confirmMpin && mpin !== confirmMpin ? 'M-PINs do not match' : null}
              />
            </div>

            <button
              type="submit"
              className="elizian-auth-submit-btn"
              disabled={loading || mpin.length !== 4 || confirmMpin.length !== 4}
            >
              {loading ? 'Setting M-PIN...' : 'Set M-PIN'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MPinSetupScreen;

