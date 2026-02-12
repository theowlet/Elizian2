import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import PasswordVisibilityToggle from '../components/PasswordVisibilityToggle';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

/**
 * M-PIN Login Screen
 * 
 * Shown when user has M-PIN set
 * Provides "Forgot M-PIN? Login using OTP" option
 */
const MPinLoginScreen = () => {
  const navigate = useNavigate();
  const [mpin, setMpin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [failedAttempts, setFailedAttempts] = useState(0);

  useEffect(() => {
    // Get phone number from sessionStorage (set during login flow)
    const phone = sessionStorage.getItem('phoneForMPin') || sessionStorage.getItem('phoneForOTP');
    if (!phone) {
      navigate('/login');
    } else {
      setPhoneNumber(phone);
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (mpin.length !== 4) {
      setError('Please enter 4-digit M-PIN');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/verify-mpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: phoneNumber,
          mpin
        })
      });

      let result;
      try {
        result = await response.json();
      } catch (_) {
        setError(response.ok ? 'Invalid response from server.' : `Server error (${response.status}). Check API at ${API_BASE}.`);
        setMpin('');
        return;
      }

      if (result.success && result.token) {
        // Login successful
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        sessionStorage.removeItem('phoneForMPin');
        sessionStorage.removeItem('phoneForOTP');
        
        // Check for pending booking
        const pendingBooking = sessionStorage.getItem('pendingBooking');
        if (pendingBooking) {
          try {
            const bookingData = JSON.parse(pendingBooking);
            console.log('📋 Resuming booking after M-PIN login:', bookingData);
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
        
        // No pending booking - go to home
        navigate('/home');
      } else {
        const newAttempts = failedAttempts + 1;
        setFailedAttempts(newAttempts);
        
        if (newAttempts >= 5) {
          setError('Too many failed attempts. Account locked. Please use OTP login.');
        } else {
          setError(result?.message ?? result?.error ?? `Invalid M-PIN. ${5 - newAttempts} attempt(s) remaining.`);
        }
        setMpin(''); // Clear M-PIN on error
      }
    } catch (err) {
      console.error('M-PIN verification error:', err);
      const isNetwork = err?.message === 'Failed to fetch' || err?.name === 'TypeError';
      setError(isNetwork
        ? `Cannot reach server. Check backend is running and VITE_API_BASE_URL is correct (current: ${API_BASE}).`
        : (err.message || 'Something went wrong. Please try again.'));
      setMpin('');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotMpin = () => {
    // Clear M-PIN attempt and redirect to OTP flow
    sessionStorage.setItem('phoneForOTP', phoneNumber);
    sessionStorage.removeItem('phoneForMPin');
    navigate('/otp');
  };

  return (
    <div className="elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal">
          <button
            className="elizian-auth-modal-close"
            onClick={() => navigate('/login')}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="elizian-auth-modal-title">Enter M-PIN</h2>
          <p className="elizian-auth-modal-subtitle">
            Enter your 4-digit M-PIN to continue
          </p>

          <form className="elizian-auth-form" onSubmit={handleSubmit}>
            {error && <div className="elizian-auth-error" role="alert">{error}</div>}

            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">M-PIN</label>
              <PasswordVisibilityToggle
                id="mpin"
                value={mpin}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setMpin(value);
                  setError('');
                }}
                placeholder="Enter 4-digit M-PIN"
                maxLength={4}
                inputMode="numeric"
                autoFocus={true}
                onPaste={(e) => {
                  // Disable paste for security
                  e.preventDefault();
                }}
              />
            </div>

            <button
              type="submit"
              className="elizian-auth-submit-btn"
              disabled={loading || mpin.length !== 4}
            >
              {loading ? 'Verifying...' : 'Login'}
            </button>

            <div className="elizian-auth-footer">
              <button
                type="button"
                onClick={handleForgotMpin}
                className="elizian-link-btn"
                disabled={loading}
              >
                Forgot M-PIN? Login using OTP
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default MPinLoginScreen;

