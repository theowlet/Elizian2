import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import '../styles/auth.css';

const SignupPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const phoneFromOTP = location.state?.phone || '';
  
  const [formData, setFormData] = useState({
    phone_number: phoneFromOTP,
    first_name: '',
    last_name: '',
    email: '',
    password: ''
  });
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
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

    if (!otpVerified) {
      setError('Please verify OTP first');
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
      // Use the verified OTP code for registration
      const response = await fetch(`${API_BASE}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone_number: formData.phone_number,
          first_name: formData.first_name,
          last_name: formData.last_name,
          email: formData.email || null,
          password: formData.password || null,
          otp_code: otp.join(''),
          role: 'user'
        })
      });

      const result = await response.json();

      if (result.success && result.token) {
        localStorage.setItem('token', result.token);
        localStorage.setItem('user', JSON.stringify(result.user));
        navigate('/home');
      } else {
        setError(result.error || 'Registration failed');
      }
    } catch (err) {
      setError('Network error. Please try again.');
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
                  disabled={otpSent && !otpVerified}
                  required
                />
              </div>
            </div>

            {/* OTP Input Section - Shown after OTP is sent */}
            {otpSent && !otpVerified && (
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
                  <input 
                    type="password" 
                    name="password"
                    className="elizian-auth-input" 
                    placeholder="Create a password (min 8 characters)"
                    value={formData.password}
                    onChange={handleChange}
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
              disabled={loading || (otpSent && !otpVerified && otp.join('').length !== 6)}
            >
              {loading 
                ? (otpSent && !otpVerified ? 'Verifying...' : 'Creating Account...')
                : otpSent && !otpVerified 
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

