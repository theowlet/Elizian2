/**
 * Socket service: connect on login, subscribe to message_received and notification_received,
 * update NotificationContext in real time. Fallback to polling when socket fails.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import { io } from 'socket.io-client';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
const WS_URL = import.meta.env.VITE_WS_URL || API_BASE;

let socketInstance = null;
let connected = false;

function getSocket() {
  return socketInstance;
}

function isSocketConnected() {
  return connected && socketInstance && socketInstance.connected;
}

/**
 * Connect socket, authenticate with token, join user room, and subscribe to realtime events.
 * onRealtime(messageReceived | notificationReceived) is called when events arrive.
 * setConnectionState(true|false) is called when socket connects or disconnects.
 * Skips connection if backend WebSocket is disabled (avoids console spam).
 * @param {string|null} token - JWT token (null to disconnect)
 * @param {(event: 'message_received' | 'notification_received', payload: any) => void} onRealtime
 * @param {(value: boolean) => void} [setConnectionState]
 */
function connect(token, onRealtime, setConnectionState) {
  if (!token || typeof onRealtime !== 'function') {
    disconnect();
    if (setConnectionState) setConnectionState(false);
    return null;
  }

  if (socketInstance && socketInstance.connected) {
    if (setConnectionState) setConnectionState(true);
    return socketInstance;
  }

  // Check if backend has WebSocket enabled before connecting (avoids repeated failed attempts)
  fetch(`${API_BASE}/api/v1/health/websocket`, { method: 'GET' })
    .then((res) => res.json())
    .then((data) => {
      if (!data.success || !data.enabled) {
        if (setConnectionState) setConnectionState(false);
        if (import.meta.env.DEV) console.log('[Socket] Backend WebSocket disabled, using polling');
        return;
      }
      connectSocket(WS_URL, token, onRealtime, setConnectionState);
    })
    .catch(() => {
      if (setConnectionState) setConnectionState(false);
      if (import.meta.env.DEV) console.log('[Socket] Backend unreachable, using polling');
    });

  return null;
}

function connectSocket(wsUrl, token, onRealtime, setConnectionState) {
  const socket = io(wsUrl, {
    path: '/socket.io',
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 3,
    reconnectionDelay: 2000,
    timeout: 10000,
  });

  socket.on('connect', () => {
    connected = true;
    if (setConnectionState) setConnectionState(true);
    socket.emit('authenticate', { token: token }, (res) => {
      if (res && res.success) {
        socket.emit('join_user_room', (joinRes) => {
          if (joinRes && joinRes.success) {
            if (import.meta.env.DEV) console.log('[Socket] Joined user room');
          }
        });
      }
    });
  });

  socket.on('disconnect', (reason) => {
    connected = false;
    if (setConnectionState) setConnectionState(false);
    if (import.meta.env.DEV) console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    connected = false;
    if (setConnectionState) setConnectionState(false);
    if (import.meta.env.DEV) console.warn('[Socket] Connect error:', err.message);
  });

  socket.on('message_received', (payload) => {
    onRealtime('message_received', payload);
  });

  socket.on('notification_received', (payload) => {
    onRealtime('notification_received', payload);
  });

  socketInstance = socket;
  return socket;
}

function disconnect() {
  connected = false;
  if (socketInstance) {
    socketInstance.removeAllListeners();
    socketInstance.disconnect();
    socketInstance = null;
  }
}

/**
 * Hook: connect when token exists, call onRealtime when message_received or notification_received.
 * Disconnect when token is null or on unmount.
 * Returns socketConnected (boolean) so consumers can skip polling when true.
 * @param {string|null} token - JWT
 * @param {(event: 'message_received' | 'notification_received', payload: any) => void} onRealtime
 */
export function useSocketService(token, onRealtime) {
  const onRealtimeRef = useRef(onRealtime);
  onRealtimeRef.current = onRealtime;
  const [socketConnected, setSocketConnected] = useState(false);

  const stableOnRealtime = useCallback((event, payload) => {
    if (onRealtimeRef.current) onRealtimeRef.current(event, payload);
  }, []);

  useEffect(() => {
    if (!token) {
      disconnect();
      setSocketConnected(false);
      return;
    }
    connect(token, stableOnRealtime, setSocketConnected);
    return () => disconnect();
  }, [token, stableOnRealtime]);

  return { getSocket, isSocketConnected, socketConnected };
}

export { getSocket, isSocketConnected, connect, disconnect };
