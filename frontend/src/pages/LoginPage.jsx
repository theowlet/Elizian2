import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/auth.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  // Check for pending booking after successful login
  useEffect(() => {
    const checkPendingBooking = () => {
      const pendingBooking = sessionStorage.getItem('pendingBooking');
      if (pendingBooking) {
        try {
          const bookingData = JSON.parse(pendingBooking);
          console.log('📋 Resuming booking after login:', bookingData);
          // Navigate to booking page with deal info
          navigate('/events/booking', {
            state: {
              dealId: bookingData.dealId,
              serviceType: bookingData.serviceType,
              partnerId: bookingData.partnerId
            }
          });
          // Clear pending booking
          sessionStorage.removeItem('pendingBooking');
        } catch (err) {
          console.error('Error parsing pending booking:', err);
        }
      } else if (location.state?.bookingDealId) {
        // Alternative: booking info passed via navigation state
        navigate('/events/booking', {
          state: {
            dealId: location.state.bookingDealId
          }
        });
      }
    };

    // Check if user is already logged in (token exists and valid)
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          // Token is valid — go to home (or resume pending booking)
          checkPendingBooking();
          if (!sessionStorage.getItem('pendingBooking') && !location.state?.bookingDealId) {
            navigate('/home', { replace: true });
          }
          return;
        }
      } catch (_) {
        // Malformed token, clear it
        localStorage.removeItem('token');
      }
    }
  }, [navigate, location]);

  const handlePhoneInput = (e) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhoneNumber(value);
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (e.stopPropagation) e.stopPropagation();
    
    console.log('📱 Login form submitted with phone:', phoneNumber);
    
    if (!phoneNumber || phoneNumber.length !== 10) {
      setError('Please enter a valid 10-digit phone number');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // First, check if user has M-PIN
      console.log('🔄 Checking M-PIN status...');
      const checkResponse = await fetch(`${API_BASE}/api/v1/auth/check-mpin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });

      let checkResult;
      try {
        checkResult = await checkResponse.json();
      } catch (_) {
        setError(checkResponse.ok ? 'Invalid response from server.' : `Server error (${checkResponse.status}). Check API is running at ${API_BASE}.`);
        return;
      }
      console.log('📥 M-PIN check result:', checkResult);

      if (!checkResponse.ok) {
        setError(checkResult?.message ?? checkResult?.error ?? `Request failed (${checkResponse.status}).`);
        return;
      }

      // If user has M-PIN, redirect to M-PIN login
      if (checkResult.success && checkResult.data?.has_mpin) {
        console.log('✅ User has M-PIN, redirecting to M-PIN login');
        sessionStorage.setItem('phoneForMPin', phoneNumber);
        navigate('/mpin-login');
        return;
      }

      // User doesn't have M-PIN - proceed with OTP flow
      console.log('🔄 User has no M-PIN, sending OTP...');
      const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });

      console.log('📥 Response status:', response.status);

      let result;
      try {
        result = await response.json();
      } catch (_) {
        setError(response.ok ? 'Invalid response from server.' : `Server error (${response.status}). Check API at ${API_BASE}.`);
        return;
      }
      console.log('📥 Response data:', result);

      if (result.success) {
        console.log('✅ OTP sent successfully');
        sessionStorage.setItem('phoneForOTP', phoneNumber);
        if (result.data?.otp) {
          console.log('🔐 Development OTP:', result.data.otp);
          alert(`Development Mode: Your OTP is ${result.data.otp}`);
        }
        navigate('/otp');
      } else {
        console.error('❌ OTP send failed:', result.error);
        setError(result?.message ?? result?.error ?? 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('💥 Request failed:', err);
      const isNetwork = err?.message === 'Failed to fetch' || err?.name === 'TypeError';
      setError(isNetwork
        ? `Cannot reach server. Check that the backend is running and VITE_API_BASE_URL is correct (current: ${API_BASE}).`
        : (err.message || 'Something went wrong. Please try again.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="elizian-auth-overlay">
      <div className="elizian-auth-modal-container">
        <div className="elizian-auth-modal">
          <button 
            className="elizian-auth-modal-close" 
            onClick={() => navigate('/')}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="elizian-auth-modal-title">Login</h2>
          <p className="elizian-auth-modal-subtitle">Welcome back to Elizian</p>
          
          <form className="elizian-auth-form" onSubmit={handleSubmit}>
            {error && (
              <div className="elizian-auth-error" style={{ 
                background: '#fee', 
                color: '#c00', 
                padding: '12px', 
                borderRadius: '8px',
                marginBottom: '16px',
                fontSize: '14px'
              }}>
                {error}
              </div>
            )}
            
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">Phone Number</label>
              <div className="elizian-phone-input-wrapper">
                <button type="button" className="elizian-country-code-btn" disabled>
                  🇮🇳 +91
                </button>
                <input 
                  type="tel" 
                  className="elizian-auth-input elizian-phone-input" 
                  placeholder="10-digit mobile number"
                  value={phoneNumber}
                  onChange={handlePhoneInput}
                  maxLength={10}
                  disabled={loading}
                  required
                  autoFocus
                />
              </div>
              <p style={{ 
                fontSize: '12px', 
                color: '#666', 
                marginTop: '8px',
                marginLeft: '4px'
              }}>
                Enter your registered mobile number
              </p>
            </div>
            
            <button 
              type="submit" 
              className="elizian-auth-submit-btn" 
              disabled={loading || phoneNumber.length !== 10}
              style={{
                opacity: (loading || phoneNumber.length !== 10) ? 0.6 : 1,
                cursor: (loading || phoneNumber.length !== 10) ? 'not-allowed' : 'pointer'
              }}
            >
              {loading ? (
                <span>
                  <span className="spinner" style={{ 
                    display: 'inline-block', 
                    width: '16px', 
                    height: '16px', 
                    border: '2px solid #fff', 
                    borderTopColor: 'transparent', 
                    borderRadius: '50%', 
                    animation: 'spin 0.6s linear infinite',
                    marginRight: '8px',
                    verticalAlign: 'middle'
                  }}></span>
                  Sending OTP...
                </span>
              ) : 'Send OTP'}
            </button>
          </form>
          
          <div className="elizian-auth-footer" style={{ marginTop: '24px', textAlign: 'center' }}>
            <p style={{ fontSize: '14px', color: '#666' }}>
              Don't have an account?{' '}
              <a 
                href="#" 
                onClick={(e) => { 
                  e.preventDefault(); 
                  navigate('/signup'); 
                }}
                style={{ 
                  color: '#007bff', 
                  textDecoration: 'none',
                  fontWeight: '500'
                }}
              >
                Sign up
              </a>
            </p>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
};

export default LoginPage;