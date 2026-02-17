import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Desktop Top Navigation Bar
 * Visible only on screens >= 769px (hidden on mobile via CSS)
 * Replaces the BottomNav on desktop
 */
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

const DesktopTopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const token = localStorage.getItem('token');
  const [unreadCount, setUnreadCount] = useState(0);
  const [userName, setUserName] = useState(() => getUserDisplayName());

  // Pages where nav should NOT appear
  const hiddenPaths = [
    '/login', '/otp', '/signup', '/mpin-setup', '/mpin-login',
    '/onboarding', '/', '/partner/login', '/partner/console',
    '/admin/login',
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
    setUserName(getUserDisplayName());
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

  const isActive = (path) => {
    if (path === '/home') return location.pathname === '/home';
    return location.pathname.startsWith(path);
  };

  const navLinks = [
    { path: '/home', label: 'Home', icon: '🏠' },
    { path: '/exclusives', label: 'Exclusives', icon: '✨' },
    { path: '/events', label: 'Events', icon: '🎭' },
    { path: '/venues/map', label: 'Map', icon: '🗺️' },
    { path: '/messages', label: 'Messages', icon: '💬' },
    { path: '/bookings', label: 'Bookings', icon: '📋' },
  ];

  const rightLinks = [
    { path: '/wallet', label: 'Wallet', icon: '💰' },
    { path: '/notifications', label: 'Notifications', icon: '🔔', badge: unreadCount },
    { path: '/profile', label: userName || 'Profile', icon: '👤' },
  ];

  return (
    <nav className="desktop-top-nav">
      <a className="desktop-top-nav__logo" href="/home" onClick={(e) => { e.preventDefault(); navigate('/home'); }}>
        <img src="/assets/z.png" alt="Elizian" />
        <span>Elizian</span>
      </a>

      <div className="desktop-top-nav__links">
        {navLinks.map(link => (
          <button
            key={link.path}
            className={`desktop-top-nav__link ${isActive(link.path) ? 'desktop-top-nav__link--active' : ''}`}
            onClick={() => navigate(link.path)}
          >
            <span style={{ marginRight: 6 }}>{link.icon}</span>
            {link.label}
          </button>
        ))}
      </div>

      <div className="desktop-top-nav__right">
        {rightLinks.map(link => (
          <div key={link.path} className="desktop-top-nav__badge">
            <button
              className={`desktop-top-nav__link ${isActive(link.path) ? 'desktop-top-nav__link--active' : ''}`}
              onClick={() => navigate(link.path)}
            >
              <span style={{ marginRight: 4 }}>{link.icon}</span>
              {link.label}
            </button>
            {link.badge > 0 && (
              <span className="desktop-top-nav__badge-count">
                {link.badge > 99 ? '99+' : link.badge}
              </span>
            )}
          </div>
        ))}
      </div>
    </nav>
  );
};

export default DesktopTopNav;
