import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const NotificationsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

  useEffect(() => {
    if (!token) { navigate('/login'); return; }
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    try {
      const [notifRes, countRes] = await Promise.all([
        fetch(`${API_BASE}/api/v1/notifications`, { headers }),
        fetch(`${API_BASE}/api/v1/notifications/unread-count`, { headers }),
      ]);
      const [notifData, countData] = await Promise.all([notifRes.json(), countRes.json()]);

      if (notifData.success) {
        setNotifications(Array.isArray(notifData.data) ? notifData.data : []);
      }
      if (countData.success) {
        setUnreadCount(countData.data?.count || countData.data?.unreadCount || 0);
      }
    } catch (_) {} finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/notifications/mark-all-read`, { method: 'PUT', headers });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (_) {}
  };

  const deleteNotification = async (id) => {
    try {
      await fetch(`${API_BASE}/api/v1/notifications/${id}`, { method: 'DELETE', headers });
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (_) {}
  };

  const deleteAllRead = async () => {
    try {
      await fetch(`${API_BASE}/api/v1/notifications/read/all`, { method: 'DELETE', headers });
      setNotifications(prev => prev.filter(n => !n.is_read));
    } catch (_) {}
  };

  const getNotifIcon = (type) => {
    const icons = {
      booking_confirmation: '📅',
      voucher_created: '🎫',
      redemption_pending: '⏳',
      redemption_confirmed: '✅',
      campaign: '📢',
      achievement_unlocked: '🏆',
      tier_promotion: '🎉',
      referral: '👥',
      message: '💬',
    };
    return icons[type] || '🔔';
  };

  const formatTime = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHrs = Math.floor(diffMins / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div style={s.page}>
      <div style={s.container}>
        {/* Header */}
        <div style={s.header}>
          <button onClick={() => navigate(-1)} style={s.backBtn}>← Back</button>
          <h1 style={s.headerTitle}>
            Notifications
            {unreadCount > 0 && <span style={s.unreadBadge}>{unreadCount}</span>}
          </h1>
          <div style={{ width: '60px' }} />
        </div>

        {/* Actions bar */}
        {notifications.length > 0 && (
          <div style={s.actionsBar}>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={s.actionLink}>Mark all read</button>
            )}
            <button onClick={deleteAllRead} style={s.actionLink}>Clear read</button>
          </div>
        )}

        {/* List */}
        {loading ? (
          <div style={s.emptyState}>
            <div style={s.spinner} />
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div style={s.emptyState}>
            <span style={{ fontSize: '2.5rem' }}>🔔</span>
            <p style={{ fontWeight: 600, color: '#1f2937', margin: '0.75rem 0 0.25rem' }}>All caught up!</p>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem' }}>No notifications right now.</p>
          </div>
        ) : (
          <div style={s.list}>
            {notifications.map((n) => (
              <div key={n.id} style={{ ...s.notifRow, background: n.is_read ? '#fff' : '#f0fdf4' }}>
                <div style={s.notifIcon}>{getNotifIcon(n.notification_type || n.type)}</div>
                <div style={s.notifContent}>
                  <div style={s.notifTitle}>{n.title || n.message || 'Notification'}</div>
                  {n.body && <div style={s.notifBody}>{n.body}</div>}
                  <div style={s.notifTime}>{formatTime(n.created_at)}</div>
                </div>
                <button onClick={() => deleteNotification(n.id)} style={s.deleteBtn} aria-label="Delete">
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Push notification CTA */}
        {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
          <div style={s.pushCta}>
            <div style={{ flex: 1 }}>
              <div style={s.pushTitle}>Enable push notifications</div>
              <div style={s.pushSub}>Get real-time alerts even when the app is closed</div>
            </div>
            <button
              onClick={async () => {
                const perm = await Notification.requestPermission();
                if (perm === 'granted') {
                  const { registerServiceWorker, subscribeToPush } = await import('../utils/pushNotifications');
                  const reg = await registerServiceWorker();
                  if (reg) await subscribeToPush(reg);
                }
              }}
              style={s.enableBtn}
            >
              Enable
            </button>
          </div>
        )}
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};

const s = {
  page: { minHeight: '100vh', background: '#f9fafb', paddingBottom: '5rem' },
  container: { maxWidth: '480px', margin: '0 auto', padding: '0 1rem' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 0' },
  backBtn: { background: 'none', border: 'none', color: '#004f4a', fontWeight: 600, cursor: 'pointer', fontSize: '0.9rem' },
  headerTitle: { fontSize: '1.25rem', fontWeight: 700, color: '#1f2937', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' },
  unreadBadge: { background: '#ef4444', color: '#fff', fontSize: '0.65rem', fontWeight: 700, padding: '2px 6px', borderRadius: '10px', lineHeight: 1 },

  actionsBar: { display: 'flex', justifyContent: 'flex-end', gap: '1rem', marginBottom: '0.75rem' },
  actionLink: { background: 'none', border: 'none', color: '#004f4a', fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' },

  emptyState: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '40vh', textAlign: 'center', color: '#6b7280' },
  spinner: { width: '28px', height: '28px', border: '3px solid #e5e7eb', borderTop: '3px solid #004f4a', borderRadius: '50%', animation: 'spin 1s linear infinite' },

  list: { background: '#fff', borderRadius: '14px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  notifRow: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '0.85rem 1rem', borderBottom: '1px solid #f3f4f6', transition: 'background 0.2s' },
  notifIcon: { fontSize: '1.25rem', flexShrink: 0, marginTop: '2px' },
  notifContent: { flex: 1, minWidth: 0 },
  notifTitle: { fontSize: '0.88rem', fontWeight: 600, color: '#1f2937', lineHeight: 1.3 },
  notifBody: { fontSize: '0.8rem', color: '#6b7280', marginTop: '2px', lineHeight: 1.4, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' },
  notifTime: { fontSize: '0.7rem', color: '#9ca3af', marginTop: '4px' },
  deleteBtn: { background: 'none', border: 'none', color: '#9ca3af', fontSize: '1.25rem', cursor: 'pointer', padding: '0 4px', flexShrink: 0, lineHeight: 1 },

  pushCta: { display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '1rem', background: '#fff', borderRadius: '12px', marginTop: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' },
  pushTitle: { fontWeight: 600, fontSize: '0.85rem', color: '#1f2937' },
  pushSub: { fontSize: '0.7rem', color: '#6b7280', marginTop: '2px' },
  enableBtn: { padding: '6px 16px', background: '#004f4a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem', cursor: 'pointer', flexShrink: 0 },
};

export default NotificationsPage;
