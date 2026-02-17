import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const getUserDisplayName = () => {
  try {
    const raw = localStorage.getItem('user');
    if (!raw) return null;
    const user = JSON.parse(raw);
    const first = (user.first_name || '').trim();
    const last = (user.last_name || '').trim();
    if (first || last) return [first, last].filter(Boolean).join(' ');
    if (user.name) return String(user.name).trim();
    return null;
  } catch {
    return null;
  }
};

/**
 * Mobile Bottom Navigation Bar
 * Shows on authenticated user pages only
 */
const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [unreadCount, setUnreadCount] = useState(0);
  const [profileLabel, setProfileLabel] = useState(() => getUserDisplayName() || 'Profile');

  // Pages where bottom nav should NOT appear
  const hiddenPaths = [
    '/login', '/otp', '/signup', '/mpin-setup', '/mpin-login',
    '/onboarding', '/', '/partner/login', '/partner/console',
    '/admin/login', '/admin',
  ];

  const shouldHide = hiddenPaths.some(p =>
    location.pathname === p || location.pathname.startsWith('/admin') || location.pathname.startsWith('/partner/')
  ) || !token;

  useEffect(() => {
    if (!token) return;
    fetchUnread();
    const interval = setInterval(fetchUnread, 30000);
    return () => clearInterval(interval);
  }, [token]);

  useEffect(() => {
    setProfileLabel(getUserDisplayName() || 'Profile');
  }, [location.pathname]);

  const fetchUnread = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/v1/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) setUnreadCount(data.data?.count || data.data?.unreadCount || 0);
    } catch (_) {}
  };

  if (shouldHide) return null;

  const tabs = [
    { path: '/home', icon: '🏠', label: 'Home' },
    { path: '/exclusives', icon: '✨', label: 'Exclusives' },
    { path: '/wallet', icon: '💰', label: 'Wallet' },
    { path: '/notifications', icon: '🔔', label: 'Notifications', badge: unreadCount },
    { path: '/profile', icon: '👤', label: profileLabel },
  ];

  const isActive = (path) => {
    if (path === '/home') return location.pathname === '/home';
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="bottom-nav" style={styles.nav}>
      {tabs.map((tab) => {
        const active = isActive(tab.path);
        return (
          <button
            type="button"
            key={tab.path}
            onClick={() => navigate(tab.path)}
            style={{
              ...styles.tab,
              color: active ? '#004f4a' : '#9ca3af',
            }}
            aria-label={tab.label}
          >
            <div style={styles.iconWrap}>
              <span style={{ fontSize: '1.25rem' }}>{tab.icon}</span>
              {tab.badge > 0 && (
                <span style={styles.badge}>{tab.badge > 99 ? '99+' : tab.badge}</span>
              )}
            </div>
            <span style={{
              ...styles.label,
              fontWeight: active ? 700 : 500,
              color: active ? '#004f4a' : '#9ca3af',
            }}>
              {tab.label}
            </span>
            {active && <div style={styles.activeIndicator} />}
          </button>
        );
      })}
    </nav>
  );
};

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    background: '#fff',
    borderTop: '1px solid #f3f4f6',
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '0.35rem 0 env(safe-area-inset-bottom, 0.35rem)',
    zIndex: 10002,
    boxShadow: '0 -1px 8px rgba(0,0,0,0.04)',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '4px 0',
    position: 'relative',
    transition: 'color 0.15s',
    WebkitTapHighlightColor: 'transparent',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
    minHeight: 44,
  },
  iconWrap: {
    position: 'relative',
    display: 'inline-flex',
  },
  badge: {
    position: 'absolute',
    top: '-4px',
    right: '-8px',
    background: '#ef4444',
    color: '#fff',
    fontSize: '0.55rem',
    fontWeight: 700,
    minWidth: '14px',
    height: '14px',
    borderRadius: '7px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '0 3px',
    lineHeight: 1,
  },
  label: {
    fontSize: '0.6rem',
    letterSpacing: '0.01em',
    lineHeight: 1,
  },
  activeIndicator: {
    position: 'absolute',
    top: '-1px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '20px',
    height: '2px',
    background: '#004f4a',
    borderRadius: '1px',
  },
};

export default BottomNav;
