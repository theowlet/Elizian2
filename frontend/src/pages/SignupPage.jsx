import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import PasswordVisibilityToggle from '../components/PasswordVisibilityToggle';
import '../styles/auth.css';
import '../styles/password-toggle.css';

const SignupPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const phoneFromOTP = location.state?.phone || '';
  
  // Check if OTP was already verified (from login screen)
  // Backend marks OTP as verified in otp_sessions table, so we trust that
  // BUT: OTP can expire (30 min timeout), so we need to handle expiration
  const [isOtpPreVerified, setIsOtpPreVerified] = useState(!!phoneFromOTP); // If phone is passed via location.state, OTP was verified
  const [otpExpired, setOtpExpired] = useState(false); // Track if OTP expired after pre-verification
  
  // Store OTP verification timestamp to detect expiration client-side (optional optimization)
  // Note: Backend is source of truth, but we can show warning if user takes too long
  const [otpVerifiedAt, setOtpVerifiedAt] = useState(isOtpPreVerified ? Date.now() : null);
  
  const [formData, setFormData] = useState({
    phone_number: phoneFromOTP,
    first_name: '',
    last_name: '',
    email: '',
    password: ''
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  // If OTP was pre-verified, mark as verified immediately
  const [otpVerified, setOtpVerified] = useState(isOtpPreVerified);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

  // Auto-focus first OTP input when OTP fields appear
  useEffect(() => {
    if (otpSent && !otpVerified) {
      setTimeout(() => {
        document.getElementById('otp-0')?.focus();
      }, 100);
    }
  }, [otpSent, otpVerified]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

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

  const handleOtpKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleSendOTP = async (e) => {
    e.preventDefault();

    // CRITICAL: If OTP was already verified on login screen, skip redundant OTP
    if (isOtpPreVerified && otpVerified) {
      setError('OTP has already been verified. Please complete your profile.');
      return;
    }

    if (!formData.first_name || !formData.phone_number) {
      setError('Name and phone number are required');
      return;
    }

    if (formData.phone_number.length !== 10) {
      setError('Phone number must be 10 digits');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: formData.phone_number })
      });

      const result = await response.json();

      if (result.success) {
        setOtpSent(true);
        setError('');
      } else {
        setError(result.error || 'Failed to send OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('Send OTP error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e) => {
    e.preventDefault();
    const otpCode = otp.join('');
    
    if (otpCode.length !== 6) {
      setError('Please enter the complete 6-digit OTP');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/verify-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          phone_number: formData.phone_number,
          otp_code: otpCode 
        })
      });

      const result = await response.json();

      if (result.success) {
        setOtpVerified(true);
        setOtpVerifiedAt(Date.now()); // Store verification timestamp
        setOtpExpired(false); // Clear expired flag if OTP was re-verified
        setIsOtpPreVerified(false); // After re-verification, treat as on-screen verification
        setError('');
      } else {
        setError(result.error || 'Invalid OTP');
      }
    } catch (err) {
      setError('Network error. Please try again.');
      console.error('OTP verification error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResendOTP = async () => {
    setLoading(true);
    setError('');

    try {
      const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: formData.phone_number })
      });

      const result = await response.json();

      if (result.success) {
        setOtp(['', '', '', '', '', '']);
        setError('');
        alert('OTP resent successfully!');
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

  const handleSubmit = async (e) => {
    e.preventDefault();

    // CRITICAL: If OTP expired, user MUST re-verify before submitting
    if (!otpVerified) {
      if (otpExpired) {
        setError('OTP verification expired. Please verify OTP again before submitting.');
      } else {
        setError('Please verify OTP first');
      }
      return;
    }

    if (!formData.first_name || !formData.phone_number) {
      setError('First name and phone number are required');
      return;
    }

    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      setError('Invalid email format');
      return;
    }

    if (formData.password && formData.password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // Build registration payload
      const registrationPayload = {
        phone_number: formData.phone_number,
        first_name: formData.first_name,
        last_name: formData.last_name,
        email: formData.email || null,
        password: formData.password || null,
        role: 'user'
      };

      // CRITICAL FIX: NEVER send otp_code during registration
      // OTP was already verified (pre-verified or on-screen) - backend trusts verified session
      // Registration must consume that trust, not re-validate OTP
      // Backend checks otp_sessions table for verified OTP (60-min timeout)
      // Do NOT add otp_code to payload - this causes redundant verification and 403/500 errors
      
      // Verify OTP was checked before allowing registration
      if (!otpVerified) {
        setError('OTP verification required. Please verify your phone number first.');
        setLoading(false);
        return;
      }
      
      console.log('[Registration] OTP already verified - trusting verified session (no otp_code sent)');

      const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registrationPayload)
      });

      const result = await response.json();

      // Debug logging
      console.log('[Registration] Response status:', response.status);
      console.log('[Registration] Response data:', result);

      // CRITICAL: Handle OTP expiration (403 Forbidden)
      if (response.status === 403 && (result.error?.includes('OTP verification expired') || result.error?.includes('expired'))) {
        // OTP session expired - reset pre-verified state and allow re-verification
        setError('OTP verification expired. Please verify again.');
        setOtpVerified(false);
        setOtpSent(false);
        setOtp(['', '', '', '', '', '']);
        setOtpExpired(true); // Mark that OTP expired
        setIsOtpPreVerified(false); // Clear pre-verified flag so we send otp_code on next submit
        setOtpVerifiedAt(null); // Clear timestamp
        // User must re-verify OTP before submitting again
        return;
      }

      // Handle non-200 status codes
      if (!response.ok) {
        const errorMsg = result.error || result.message || `Registration failed with status ${response.status}`;
        console.error('[Registration] Error:', errorMsg);
        setError(errorMsg);
        setLoading(false);
        return;
      }

      // Backend returns token in result.data.token (via successResponse)
      const token = result.data?.token || result.token;
      const user = result.data?.user || result.user;

      console.log('[Registration] Extracted token:', token ? 'Present' : 'Missing');
      console.log('[Registration] Extracted user:', user ? 'Present' : 'Missing');
      console.log('[Registration] Result success:', result.success);

      if (result.success && token) {
        console.log('[Registration] ✅ Success - storing token and redirecting to M-PIN setup');
        localStorage.setItem('token', token);
        localStorage.setItem('userToken', token); // Legacy support
        localStorage.setItem('userInfo', JSON.stringify(user));
        localStorage.setItem('user', JSON.stringify(user));
        // Clear loading state before navigation
        setLoading(false);
        // Redirect to M-PIN setup (mandatory for new users)
        // Use setTimeout to ensure state updates complete before navigation
        setTimeout(() => {
          console.log('[Registration] Navigating to /mpin-setup');
          navigate('/mpin-setup', { replace: true });
        }, 100);
      } else {
        const errorMsg = result.error || result.message || 'Registration failed - missing token or success flag';
        console.error('[Registration] ❌ Failed:', errorMsg);
        console.error('[Registration] Full result:', result);
        console.error('[Registration] Response status:', response.status);
        setError(errorMsg);
        setLoading(false);
      }
    } catch (err) {
      // Handle network errors or other exceptions
      if (err.message?.includes('expired') || err.message?.includes('OTP')) {
        setError('OTP verification expired. Please verify again.');
        setOtpVerified(false);
        setOtpSent(false);
        setOtp(['', '', '', '', '', '']);
      } else {
        setError('Network error. Please try again.');
      }
      console.error('Signup error:', err);
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
          <h2 className="elizian-auth-modal-title">Join Elizian today</h2>
          <p className="elizian-auth-modal-subtitle">Create your Elizian account</p>
          
          <form className="elizian-auth-form" onSubmit={otpSent && !otpVerified ? handleVerifyOTP : otpVerified ? handleSubmit : handleSendOTP}>
            {error && <div className="elizian-auth-error">{error}</div>}
            
            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">Name</label>
              <input 
                type="text" 
                name="first_name"
                className="elizian-auth-input" 
                placeholder="Enter your name"
                value={formData.first_name}
                onChange={handleChange}
                disabled={otpSent && !otpVerified}
                required
              />
            </div>

            <div className="elizian-auth-form-group">
              <label className="elizian-auth-label">Mobile Number</label>
              <div className="elizian-phone-input-wrapper">
                <button type="button" className="elizian-country-code-btn" disabled>
                  🇮🇳 +91
                </button>
                <input 
                  type="tel" 
                  name="phone_number"
                  className="elizian-auth-input elizian-phone-input" 
                  placeholder="10-digit mobile number"
                  value={formData.phone_number}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                    handleChange({ ...e, target: { ...e.target, value, name: 'phone_number' } });
                  }}
                  maxLength={10}
                  disabled={(otpSent && !otpVerified) || (isOtpPreVerified && otpVerified && !error?.includes('expired'))}
                  readOnly={isOtpPreVerified && otpVerified && !error?.includes('expired')}
                  required
                />
              </div>
            </div>

            {/* OTP Input Section - Shown after OTP is sent, OR if OTP expired */}
            {((otpSent && !otpVerified && !isOtpPreVerified) || (error?.includes('expired') && isOtpPreVerified)) && (
              <div className="elizian-auth-form-group">
                <label className="elizian-auth-label">Enter OTP</label>
                <p style={{ fontSize: '12px', color: '#666', marginBottom: '12px' }}>
                  We've sent a 6-digit code to +91 {formData.phone_number}
                </p>
                <div className="elizian-otp-inputs-wrapper">
                  {otp.map((digit, index) => (
                    <input
                      key={index}
                      id={`otp-${index}`}
                      type="text"
                      className="elizian-otp-input"
                      value={digit}
                      onChange={(e) => handleOtpChange(index, e.target.value)}
                      onKeyDown={(e) => handleOtpKeyDown(index, e)}
                      maxLength={1}
                      autoFocus={index === 0}
                      inputMode="numeric"
                      pattern="[0-9]*"
                    />
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleResendOTP}
                  disabled={loading}
                  style={{
                    marginTop: '12px',
                    background: 'none',
                    border: 'none',
                    color: '#007bff',
                    cursor: 'pointer',
                    fontSize: '14px',
                    textDecoration: 'underline'
                  }}
                >
                  Resend OTP
                </button>
              </div>
            )}

            {/* Show message if OTP was pre-verified */}
            {isOtpPreVerified && otpVerified && !error?.includes('expired') && (
              <div className="elizian-auth-form-group" style={{ marginBottom: '16px' }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#d1fae5', 
                  border: '1px solid #059669',
                  borderRadius: '8px',
                  color: '#065f46',
                  fontSize: '14px'
                }}>
                  ✅ Phone number verified. Please complete your profile.
                </div>
              </div>
            )}
            
            {/* Show warning if OTP might be expired (client-side check, backend is source of truth) */}
            {isOtpPreVerified && otpVerifiedAt && (Date.now() - otpVerifiedAt > 25 * 60 * 1000) && (
              <div className="elizian-auth-form-group" style={{ marginBottom: '16px' }}>
                <div style={{ 
                  padding: '12px', 
                  backgroundColor: '#fef3c7', 
                  border: '1px solid #f59e0b',
                  borderRadius: '8px',
                  color: '#92400e',
                  fontSize: '14px'
                }}>
                  ⚠️ OTP verification may expire soon. Please complete registration quickly.
                </div>
              </div>
            )}

            {/* Additional fields shown after OTP verification */}
            {otpVerified && (
              <>
                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label">Last Name</label>
                  <input 
                    type="text" 
                    name="last_name"
                    className="elizian-auth-input" 
                    placeholder="Enter your last name (optional)"
                    value={formData.last_name}
                    onChange={handleChange}
                  />
                </div>

                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label">Email (Optional)</label>
                  <input 
                    type="email" 
                    name="email"
                    className="elizian-auth-input" 
                    placeholder="your@email.com"
                    value={formData.email}
                    onChange={handleChange}
                  />
                </div>

                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label">Password (Optional)</label>
                  <PasswordVisibilityToggle
                    id="password"
                    value={formData.password || ''}
                    onChange={(e) => handleChange({ target: { name: 'password', value: e.target.value } })}
                    placeholder="Create a password (min 8 characters)"
                    error={formData.password && formData.password.length > 0 && formData.password.length < 8 ? 'Password must be at least 8 characters' : null}
                  />
                </div>

                <div className="elizian-auth-form-group">
                  <label className="elizian-auth-label">Register as</label>
                  <select 
                    name="role"
                    className="elizian-auth-input"
                    defaultValue="user"
                    disabled
                    style={{ cursor: 'not-allowed' }}
                  >
                    <option value="user">User</option>
                  </select>
                </div>
              </>
            )}
            
            <button 
              type="submit" 
              className="elizian-auth-submit-btn" 
              disabled={loading || (otpSent && !otpVerified && !isOtpPreVerified && otp.join('').length !== 6)}
            >
              {loading 
                ? (otpSent && !otpVerified && !isOtpPreVerified ? 'Verifying...' : 'Creating Account...')
                : isOtpPreVerified && otpVerified
                  ? 'Sign Up'
                  : otpSent && !otpVerified && !isOtpPreVerified
                    ? 'Verify OTP'
                    : otpVerified
                      ? 'Sign Up'
                      : 'Send OTP'
              }
            </button>
          </form>
          
          <div className="elizian-auth-footer">
            <p>Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); navigate('/login'); }}>Login</a></p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SignupPage;

