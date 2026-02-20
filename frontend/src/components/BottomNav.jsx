import React, { useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';

function getUserDisplayName(user) {
  if (!user) return null;
  const first = (user.first_name || '').trim();
  const last = (user.last_name || '').trim();
  if (first || last) return [first, last].filter(Boolean).join(' ');
  if (user.name) return String(user.name).trim();
  return null;
}

/**
 * Mobile Bottom Navigation Bar
 * Shows on authenticated user pages only. Uses AuthContext + NotificationContext.
 */
const BottomNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { token, user } = useAuth();
  const { unreadCount } = useNotifications();
  const profileLabel = useMemo(() => getUserDisplayName(user) || 'Profile', [user]);

  // Pages where bottom nav should NOT appear
  const hiddenPaths = [
    '/login', '/otp', '/signup', '/mpin-setup', '/mpin-login',
    '/onboarding', '/', '/partner/login', '/partner/console',
    '/admin/login', '/admin',
  ];

  const shouldHide = hiddenPaths.some(p =>
    location.pathname === p || location.pathname.startsWith('/admin') || location.pathname.startsWith('/partner/')
  ) || !token;

  if (shouldHide) return null;

  const tabs = [
    { path: '/home', icon: '🏠', label: 'Home' },
    { path: '/bookings', icon: '📋', label: 'Bookings' },
    { path: '/messages', icon: '💬', label: 'Messages', badge: unreadCount },
    { path: '/profile', icon: '👤', label: 'Profile' },
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
              color: active ? gold : inactive,
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
              fontWeight: active ? 600 : 500,
              color: active ? gold : inactive,
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

const gold = '#D4AF37';
const bgNav = 'rgba(11, 15, 26, 0.95)';
const borderNav = 'rgba(212, 175, 55, 0.12)';
const inactive = '#9CA3AF';

const styles = {
  nav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    width: '100%',
    background: bgNav,
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderTop: `1px solid ${borderNav}`,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    padding: '0.35rem 0 env(safe-area-inset-bottom, 0.35rem)',
    zIndex: 10002,
    boxShadow: '0 -4px 24px rgba(0,0,0,0.3)',
    pointerEvents: 'auto',
    touchAction: 'manipulation',
  },
  tab: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    padding: '6px 0',
    position: 'relative',
    transition: 'color 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
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
    background: gold,
    color: '#0B0F1A',
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
    letterSpacing: '0.02em',
    lineHeight: 1,
  },
  activeIndicator: {
    position: 'absolute',
    top: '-1px',
    left: '50%',
    transform: 'translateX(-50%)',
    width: '24px',
    height: '2px',
    background: gold,
    borderRadius: '1px',
  },
};

export default BottomNav;
