import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useAuth } from "./AuthContext";
import { useSocketService } from "../services/socketService";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
const POLL_INTERVAL_MS = 30000;

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { token } = useAuth();
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchUnread = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_BASE}/api/v1/notifications/unread-count`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        const count = data.data?.count ?? data.data?.unreadCount ?? 0;
        setUnreadCount(count);
      }
    } catch (_) {}
  }, [token]);

  const handleRealtime = useCallback(
    (event, payload) => {
      fetchUnread();
      if (event === "message_received") {
        window.dispatchEvent(new CustomEvent("elizian-message-received", { detail: payload }));
      }
    },
    [fetchUnread]
  );

  const { socketConnected } = useSocketService(token, handleRealtime);

  useEffect(() => {
    if (!token) {
      setUnreadCount(0);
      return;
    }
    fetchUnread();
    const interval = setInterval(fetchUnread, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [token, fetchUnread]);

  const markAsRead = useCallback(() => {
    setUnreadCount((c) => Math.max(0, c - 1));
    fetchUnread();
  }, [fetchUnread]);

  const value = {
    unreadCount,
    refresh: fetchUnread,
    markAsRead,
    socketConnected: socketConnected ?? false,
  };

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationProvider (and AuthProvider)");
  return ctx;
}

export default NotificationContext;
