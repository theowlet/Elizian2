import React from 'react';
import '../styles/auth.css';

const QRCodeModal = ({ isOpen, onClose, qrCodeUrl, voucherCode, bookingReference }) => {
  if (!isOpen) return null;

  return (
    <div className="elizian-auth-overlay" onClick={onClose}>
      <div className="elizian-auth-modal-container" onClick={(e) => e.stopPropagation()}>
        <div className="elizian-auth-modal" style={{ maxWidth: '500px' }}>
          <button
            className="elizian-auth-modal-close"
            onClick={onClose}
            aria-label="Close"
          >
            &times;
          </button>
          
          <h2 className="elizian-auth-modal-title" style={{ marginBottom: '1rem' }}>
            Booking Voucher QR Code
          </h2>

          {qrCodeUrl ? (
            <>
              <div style={{
                background: 'white',
                borderRadius: '12px',
                padding: '2rem',
                textAlign: 'center',
                marginBottom: '1rem'
              }}>
                <img
                  src={qrCodeUrl}
                  alt="Booking QR Code"
                  style={{
                    width: '100%',
                    maxWidth: '300px',
                    height: 'auto',
                    margin: '0 auto',
                    display: 'block',
                    borderRadius: '8px',
                    border: '2px solid #e5e7eb'
                  }}
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const errorDiv = e.target.nextSibling;
                    if (errorDiv) errorDiv.style.display = 'flex';
                  }}
                />
                <div style={{
                  display: 'none',
                  width: '300px',
                  height: '300px',
                  margin: '0 auto',
                  background: '#f3f4f6',
                  borderRadius: '8px',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#666',
                  fontSize: '0.9rem',
                  flexDirection: 'column'
                }}>
                  <div>QR Code unavailable</div>
                  <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Please contact support
                  </div>
                </div>
              </div>

              {voucherCode && (
                <div style={{
                  padding: '1rem',
                  background: '#f9fafb',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  textAlign: 'center'
                }}>
                  <div style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '0.25rem' }}>
                    Voucher Code
                  </div>
                  <div style={{
                    fontSize: '1rem',
                    fontFamily: 'monospace',
                    color: '#111827',
                    fontWeight: '600'
                  }}>
                    {voucherCode}
                  </div>
                </div>
              )}

              {bookingReference && (
                <div style={{
                  padding: '0.75rem',
                  background: '#f3f4f6',
                  borderRadius: '8px',
                  marginBottom: '1rem',
                  textAlign: 'center',
                  fontSize: '0.85rem',
                  color: '#6b7280'
                }}>
                  Booking: {bookingReference}
                </div>
              )}

              <div style={{
                padding: '1rem',
                background: '#eff6ff',
                borderRadius: '8px',
                marginBottom: '1rem',
                fontSize: '0.9rem',
                color: '#1e40af',
                textAlign: 'center'
              }}>
                Show this QR code at the venue for redemption
              </div>

              <button
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = qrCodeUrl;
                  link.download = `voucher-${bookingReference || 'booking'}.png`;
                  link.click();
                }}
                className="elizian-auth-submit-btn"
                style={{ marginTop: '1rem' }}
              >
                Download QR Code
              </button>
            </>
          ) : (
            <div style={{
              padding: '2rem',
              textAlign: 'center',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>⏳</div>
              <p>QR code is being generated...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default QRCodeModal;

