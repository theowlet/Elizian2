import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';

const LoginPage = () => {
  const navigate = useNavigate();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const API_BASE = process.env.REACT_APP_API_BASE_URL || 'http://localhost:5001';

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
      console.log('🔄 Sending OTP request to:', `${API_BASE}/api/v1/auth/send-otp`);
      
      const response = await fetch(`${API_BASE}/api/v1/auth/send-otp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone_number: phoneNumber })
      });

      console.log('📥 Response status:', response.status);
      
      const result = await response.json();
      console.log('📥 Response data:', result);

      if (result.success) {
        console.log('✅ OTP sent successfully');
        // Store phone number for OTP verification page
        sessionStorage.setItem('phoneForOTP', phoneNumber);
        
        // Show success message if in development
        if (result.data?.otp) {
          console.log('🔐 Development OTP:', result.data.otp);
          alert(`Development Mode: Your OTP is ${result.data.otp}`);
        }
        
        // Navigate to OTP screen
        navigate('/otp');
      } else {
        console.error('❌ OTP send failed:', result.error);
        setError(result.error || 'Failed to send OTP. Please try again.');
      }
    } catch (err) {
      console.error('💥 Network error:', err);
      setError('Network error. Please check your connection and try again.');
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