import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';

const OTPScreen = () => {
  const navigate = useNavigate();
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

  useEffect(() => {
    const phone = sessionStorage.getItem('phoneForOTP');
    if (!phone) {
      navigate('/login');
    } else {
      setPhoneNumber(phone);
    }
  }, [navigate]);

  const handleOtpChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    setError('');

    // Auto-focus next input
    if (value && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleVerify = async () => {
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Verify OTP
      const verifyResponse = await fetch(`${API_BASE}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone_number: phoneNumber, 
          otp_code: otpCode 
        })
      });

      const verifyResult = await verifyResponse.json();
      
      // Debug logging
      console.log('OTP Verification Response:', verifyResult);

      if (verifyResult.success) {
        // If token is returned, user exists and is logged in
        if (verifyResult.data.token && verifyResult.data.user) {
          console.log('✅ User exists, saving token and redirecting to home');
          localStorage.setItem('token', verifyResult.data.token);
          localStorage.setItem('user', JSON.stringify(verifyResult.data.user));
          sessionStorage.removeItem('phoneForOTP');
          navigate('/home');
        } 
        // If requiresRegistration flag is set, user doesn't exist yet
        else if (verifyResult.requiresRegistration) {
          console.log('⚠️ User not found, redirecting to signup');
          navigate('/signup', { state: { phone: phoneNumber } });
        } 
        // Fallback: if no token but no requiresRegistration flag, redirect to signup
        else {
          console.log('⚠️ No token in response, redirecting to signup');
          navigate('/signup', { state: { phone: phoneNumber } });
        }
      } else {
        console.error('❌ OTP verification failed:', verifyResult.error);
        setError(verifyResult.error || 'Invalid OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('OTP verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });

      const result = await response.json();

      if (result.success) {
        setError('');
        alert('OTP resent successfully!');
        setOtp(['', '', '', '', '', '']);
        document.getElementById('otp-0')?.focus();
      } else {
        setError(result.error || 'Failed to resend OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
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
            onClick={() => navigate('/login')}
            aria-label="Close"
          >
            &times;
          </button>
          <h2 className="elizian-auth-modal-title">Verify OTP</h2>
          <p className="elizian-auth-modal-subtitle">
            Enter the 6-digit code sent to +91 {phoneNumber}
          </p>
          
          <form className="elizian-auth-form" onSubmit={(e) => { e.preventDefault(); handleVerify(); }}>
            {error && <div className="elizian-auth-error">{error}</div>}
            
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">OTP Code</label>
              <div className="elizian-otp-inputs-wrapper">
                {otp.map((digit, index) => (
                  <input
                    key={index}
                    id={`otp-${index}`}
                    type="text"
                    className="elizian-otp-input"
                    value={digit}
                    onChange={(e) => handleOtpChange(index, e.target.value)}
                    onKeyDown={(e) => handleKeyDown(index, e)}
                    maxLength={1}
                    autoFocus={index === 0}
                    inputMode="numeric"
                    pattern="[0-9]*"
                  />
                ))}
              </div>
            </div>
            
            <button 
              type="submit" 
              className="elizian-auth-submit-btn" 
              disabled={loading || otp.join('').length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>

            <div className="elizian-auth-footer">
              <button
                type="button"
                onClick={handleResend}
                disabled={loading}
                className="elizian-resend-btn"
              >
                Resend OTP
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default OTPScreen;

