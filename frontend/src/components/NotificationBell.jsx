import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { isPushSupported, getPermissionState, requestPermission, subscribeToPush, registerServiceWorker } from '../utils/pushNotifications';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Notification Bell - Floating bell icon with unread count badge
 * Also handles push notification permission request
 */
const NotificationBell = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPushPrompt, setShowPushPrompt] = useState(false);

  useEffect(() => {
    if (!token) return;
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Poll every 30s
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    // Show push permission prompt if supported and not yet granted
    if (isPushSupported() && getPermissionState() === 'default') {
      const prompted = sessionStorage.getItem('push_prompted');
      if (!prompted) {
        setTimeout(() => setShowPushPrompt(true), 10000); // After 10s
      }
    }
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        setUnreadCount(data.data?.count || data.data?.unreadCount || 0);
      }
    } catch (_) {}
  };

  const handleEnablePush = async () => {
    sessionStorage.setItem('push_prompted', 'true');
    const permission = await requestPermission();
    if (permission === 'granted') {
      const registration = await registerServiceWorker();
      if (registration) await subscribeToPush(registration);
    }
    setShowPushPrompt(false);
  };

  const handleDismissPush = () => {
    sessionStorage.setItem('push_prompted', 'true');
    setShowPushPrompt(false);
  };

  if (!token) return null;

  return (
    <>
      {/* Bell icon */}
      <button
        onClick={() => navigate('/notifications')}
        style={styles.bell}
        aria-label="Notifications"
      >
        🔔
        {unreadCount > 0 && (
          <span style={styles.badge}>{unreadCount > 99 ? '99+' : unreadCount}</span>
        )}
      </button>

      {/* Push permission prompt */}
      {showPushPrompt && (
        <div style={styles.pushPrompt}>
          <div style={styles.pushContent}>
            <span style={{ fontSize: '1.25rem' }}>🔔</span>
            <div style={{ flex: 1 }}>
              <div style={styles.pushTitle}>Enable notifications?</div>
              <div style={styles.pushSub}>Get alerts for bookings, rewards & exclusive offers</div>
            </div>
          </div>
          <div style={styles.pushActions}>
            <button onClick={handleDismissPush} style={styles.pushDismiss}>Not now</button>
            <button onClick={handleEnablePush} style={styles.pushEnable}>Enable</button>
          </div>
        </div>
      )}
    </>
  );
};

const styles = {
  bell: {
    position: 'relative',
    background: 'none',
    border: 'none',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '4px',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-6px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.6rem',
    fontWeight: 700,
    minWidth: '16px',
    height: '16px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
  pushPrompt: {
    position: 'fixed',
    top: '1rem',
    left: '50%',
    transform: 'translateX(-50%)',
    background: '#fff',
    borderRadius: '14px',
    padding: '0.85rem 1rem',
    boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
    zIndex: 9999,
    width: '90%',
    maxWidth: '380px',
  },
  pushContent: { display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' },
  pushTitle: { fontWeight: 700, fontSize: '0.9rem', color: '#1f2937' },
  pushSub: { fontSize: '0.75rem', color: '#6b7280' },
  pushActions: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' },
  pushDismiss: { padding: '6px 14px', border: '1px solid #e5e7eb', borderRadius: '8px', background: '#fff', color: '#6b7280', fontSize: '0.8rem', cursor: 'pointer' },
  pushEnable: { padding: '6px 16px', border: 'none', borderRadius: '8px', background: '#004f4a', color: '#fff', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer' },
};

export default NotificationBell;
