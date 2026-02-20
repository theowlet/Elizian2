import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

const NotificationsPage = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('token');
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [detailNotification, setDetailNotification] = useState(null);

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
        const list = notifData.data?.notifications ?? (Array.isArray(notifData.data) ? notifData.data : []);
        setNotifications(Array.isArray(list) ? list : []);
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

  const markOneAsRead = async (id) => {
    try {
      await fetch(`${API_BASE}/api/v1/notifications/mark-read`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ notificationIds: [id] }),
      });
      setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (_) {}
  };

  const handleNotificationClick = (n) => {
    if (!n.is_read) markOneAsRead(n.id);
    setDetailNotification(n);
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

  const formatTimeExact = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
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
              <div
                key={n.id}
                role="button"
                tabIndex={0}
                onClick={() => handleNotificationClick(n)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleNotificationClick(n); } }}
                style={{ ...s.notifRow, background: n.is_read ? '#fff' : '#f0fdf4', cursor: 'pointer' }}
              >
                <div style={s.notifIcon}>{getNotifIcon(n.notification_type || n.type)}</div>
                <div style={s.notifContent}>
                  <div style={s.notifTitle}>{n.title || n.message || 'Notification'}</div>
                  {(n.body || (n.message && n.message !== (n.title || 'Notification'))) && (
                  <div style={s.notifBody}>{n.body || n.message}</div>
                )}
                  <div style={s.notifTime} title={n.created_at ? formatTimeExact(n.created_at) : ''}>{formatTime(n.created_at)}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                  style={s.deleteBtn}
                  aria-label="Delete"
                >
                  &times;
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Notification detail modal */}
        {detailNotification && (
          <div style={s.modalOverlay} onClick={() => setDetailNotification(null)}>
            <div style={s.modalBox} onClick={(e) => e.stopPropagation()}>
              <div style={s.modalHeader}>
                <span style={s.modalIcon}>{getNotifIcon(detailNotification.notification_type || detailNotification.type)}</span>
                <h2 style={s.modalTitle}>{detailNotification.title || detailNotification.message || 'Notification'}</h2>
                <button type="button" style={s.modalClose} onClick={() => setDetailNotification(null)} aria-label="Close">&times;</button>
              </div>
              <div style={s.modalBody}>
                {(detailNotification.message || detailNotification.body) && (
                  <div style={s.modalMessage}>{detailNotification.message || detailNotification.body}</div>
                )}
                {(() => {
                  const meta = typeof detailNotification.metadata === 'string' ? (() => { try { return JSON.parse(detailNotification.metadata); } catch { return null; } })() : detailNotification.metadata;
                  return meta && meta.description ? <div style={s.modalMessage}>{meta.description}</div> : null;
                })()}
                {!(detailNotification.message || detailNotification.body) && !(detailNotification.metadata?.description) && (
                  <p style={s.modalPlaceholder}>No additional details for this notification.</p>
                )}
                <div style={s.modalTime}>
                  <span>{formatTime(detailNotification.created_at)}</span>
                  {detailNotification.created_at && <span style={{ color: '#9ca3af', fontSize: '0.8rem' }}> · {formatTimeExact(detailNotification.created_at)}</span>}
                </div>
              </div>
              <div style={s.modalFooter}>
                <button type="button" style={s.modalBtnSecondary} onClick={() => setDetailNotification(null)}>Close</button>
                {(detailNotification.action_url || detailNotification.actionUrl) && (detailNotification.action_url || detailNotification.actionUrl) !== '/notifications' && (
                  <button type="button" style={s.modalBtnPrimary} onClick={() => { setDetailNotification(null); navigate(detailNotification.action_url || detailNotification.actionUrl); }}>Open</button>
                )}
              </div>
            </div>
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

  modalOverlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem' },
  modalBox: { background: '#fff', borderRadius: '16px', maxWidth: '420px', width: '100%', maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 40px rgba(0,0,0,0.15)' },
  modalHeader: { display: 'flex', alignItems: 'flex-start', gap: '0.75rem', padding: '1.25rem 1.25rem 0', flexShrink: 0 },
  modalIcon: { fontSize: '1.5rem', flexShrink: 0 },
  modalTitle: { flex: 1, margin: 0, fontSize: '1.1rem', fontWeight: 700, color: '#1f2937', lineHeight: 1.3 },
  modalClose: { background: 'none', border: 'none', fontSize: '1.5rem', color: '#9ca3af', cursor: 'pointer', padding: 0, lineHeight: 1 },
  modalBody: { padding: '1rem 1.25rem', overflow: 'auto', flex: 1 },
  modalMessage: { fontSize: '0.95rem', color: '#374151', lineHeight: 1.5, whiteSpace: 'pre-wrap', marginBottom: '1rem' },
  modalPlaceholder: { fontSize: '0.9rem', color: '#9ca3af', margin: '0 0 1rem', fontStyle: 'italic' },
  modalTime: { fontSize: '0.8rem', color: '#6b7280', marginTop: '0.5rem' },
  modalFooter: { display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', padding: '1rem 1.25rem 1.25rem', borderTop: '1px solid #f3f4f6', flexShrink: 0 },
  modalBtnSecondary: { padding: '8px 16px', background: '#f3f4f6', color: '#374151', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
  modalBtnPrimary: { padding: '8px 16px', background: '#004f4a', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' },
};

export default NotificationsPage;
