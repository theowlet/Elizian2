import React, { useState } from 'react';
import '../styles/auth.css';

/**
 * Reusable Password Visibility Toggle Component
 * 
 * Provides an eye icon toggle to show/hide password/PIN input
 * - Accessible (keyboard + screen reader friendly)
 * - Secure (never logs values)
 * - Resets visibility on form submit/error
 */
const PasswordVisibilityToggle = ({ 
  id, 
  value, 
  onChange, 
  onBlur,
  placeholder = '',
  maxLength = null,
  inputMode = 'text',
  className = '',
  disabled = false,
  error = null,
  autoFocus = false,
  onPaste = null
}) => {
  const [isVisible, setIsVisible] = useState(false);

  const toggleVisibility = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsVisible(!isVisible);
  };

  const handleInputChange = (e) => {
    // Never log sensitive values
    onChange(e);
  };

  // Reset visibility when value is cleared (e.g., on error)
  React.useEffect(() => {
    if (!value) {
      setIsVisible(false);
    }
  }, [value]);

  return (
    <div className={`password-input-wrapper ${className}`}>
      <input
        id={id}
        type={isVisible ? 'text' : 'password'}
        value={value}
        onChange={handleInputChange}
        onBlur={onBlur}
        onPaste={onPaste}
        placeholder={placeholder}
        maxLength={maxLength}
        inputMode={inputMode}
        autoComplete="off"
        autoFocus={autoFocus}
        disabled={disabled}
        className={`elizian-auth-input ${error ? 'error' : ''}`}
        aria-label={placeholder}
        aria-invalid={error ? 'true' : 'false'}
        aria-describedby={error ? `${id}-error` : undefined}
      />
      <button
        type="button"
        className="password-toggle-btn"
        onClick={toggleVisibility}
        onMouseDown={(e) => e.preventDefault()} // Prevent input focus loss
        aria-label={isVisible ? 'Hide password' : 'Show password'}
        aria-pressed={isVisible}
        tabIndex={0}
        disabled={disabled}
      >
        {isVisible ? (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
            <line x1="1" y1="1" x2="23" y2="23"/>
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        )}
      </button>
      {error && (
        <div id={`${id}-error`} className="elizian-auth-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
};

export default PasswordVisibilityToggle;

