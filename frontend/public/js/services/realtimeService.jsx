/**
 * Real-Time Service
 * WebSocket client for real-time updates
 *
 * Feature-flagged and gracefully degrades if disabled or unavailable
 */

(function () {
  "use strict";

  // Feature flag - check config first
  const CONFIG = window.CONFIG || {};
  const FEATURES = CONFIG.FEATURES || {};
  const ENABLE_REALTIME = FEATURES.ENABLE_REALTIME === true;

  // Service state
  let socket = null;
  let isConnected = false;
  let reconnectAttempts = 0;
  let maxReconnectAttempts = 5;
  let reconnectDelay = 3000;
  let reconnectTimer = null;
  let eventHandlers = new Map();
  let subscribedRooms = new Set();
  let pollingFallback = null;
  let pollingInterval = FEATURES.REALTIME_POLLING_INTERVAL || 30000;

  /**
   * Initialize Socket.IO (dynamically loaded)
   */
  function loadSocketIO() {
    return new Promise((resolve, reject) => {
      // Check if already loaded
      if (window.io) {
        resolve(window.io);
        return;
      }

      // Try to load from CDN
      const script = document.createElement("script");
      script.src = "https://cdn.socket.io/4.5.4/socket.io.min.js";
      script.onload = () => {
        if (window.io) {
          resolve(window.io);
        } else {
          reject(new Error("Socket.IO failed to load"));
        }
      };
      script.onerror = () => reject(new Error("Failed to load Socket.IO"));
      document.head.appendChild(script);
    });
  }

  /**
   * Connect to WebSocket server
   */
  // async function connect(serverUrl = null) {
  //   if (!ENABLE_REALTIME) {
  //     console.log('🟡 Real-time disabled (feature flag)');
  //     return false;
  //   }

  //   if (isConnected && socket) {
  //     console.log('✅ Already connected');
  //     return true;
  //   }

  //   try {
  //     // Load Socket.IO
  //     const io = await loadSocketIO();

  //     // Determine server URL
  //     const url = serverUrl ||
  //                 CONFIG.API_BASE?.replace('/api/v1', '') ||
  //                 'http://localhost:5001';

  //     console.log(`🔌 Connecting to real-time server: ${url}`);

  //     // Create socket connection
  //     socket = io(url, {
  //       transports: ['websocket', 'polling'],
  //       reconnection: true,
  //       reconnectionDelay: 1000,
  //       reconnectionDelayMax: 5000,
  //       reconnectionAttempts: maxReconnectAttempts
  //     });

  //     // Connection handlers
  //     socket.on('connect', () => {
  //       isConnected = true;
  //       reconnectAttempts = 0;
  //       console.log('✅ WebSocket connected');
  //       emit('connected', { timestamp: new Date().toISOString() });

  //       // Re-subscribe to previous rooms
  //       subscribedRooms.forEach(room => {
  //         socket.emit('join_room', room);
  //       });
  //     });

  //     socket.on('disconnect', (reason) => {
  //       isConnected = false;
  //       console.warn('🔌 WebSocket disconnected:', reason);
  //       emit('disconnected', { reason, timestamp: new Date().toISOString() });

  //       // Start polling fallback
  //       if (FEATURES.REALTIME_FALLBACK !== false) {
  //         startPollingFallback();
  //       }
  //     });

  //     socket.on('connect_error', (error) => {
  //       console.error('❌ WebSocket connection error:', error);
  //       emit('error', { error: error.message, timestamp: new Date().toISOString() });
  //     });

  //     socket.on('error', (error) => {
  //       console.error('❌ WebSocket error:', error);
  //       emit('error', { error, timestamp: new Date().toISOString() });
  //     });

  //     // Message handlers
  //     socket.on('connected', (data) => {
  //       console.log('📨 Server welcome:', data);
  //       emit('server_connected', data);
  //     });

  //     socket.on('offer_updated', (data) => {
  //       console.log('📦 Offer updated:', data);
  //       emit('offer_updated', data);
  //     });

  //     socket.on('booking_updated', (data) => {
  //       console.log('📅 Booking updated:', data);
  //       emit('booking_updated', data);
  //     });

  //     socket.on('deal_updated', (data) => {
  //       console.log('🎁 Deal updated:', data);
  //       emit('deal_updated', data);
  //     });

  //     socket.on('offers:trending_status_changed', (data) => {
  //       console.log('🔥 Trending status changed:', data);
  //       emit('offers:trending_status_changed', data);
  //     });

  //     socket.on('pong', (data) => {
  //       // Health check response
  //       emit('pong', data);
  //     });

  //     return true;
  //   } catch (error) {
  //     console.error('❌ Failed to connect to WebSocket:', error);
  //     emit('error', { error: error.message, timestamp: new Date().toISOString() });

  //     // Start polling fallback
  //     if (FEATURES.REALTIME_FALLBACK !== false) {
  //       startPollingFallback();
  //     }

  //     return false;
  //   }
  // }
  async function connect(serverUrl = null) {
    if (!ENABLE_REALTIME) return false;
    if (isConnected && socket) return true;

    try {
      const io = await loadSocketIO();
      const url =
        serverUrl ||
        CONFIG.API_BASE?.replace("/api/v1", "") ||
        "http://localhost:3000";

      // 1. Cleanup existing socket if it exists to prevent multiple instances
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }

      socket = io(url, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: maxReconnectAttempts,
        // 2. Add Authentication
        auth: {
          token: localStorage.getItem("token"), // Or your auth logic
        },
      });

      // 3. Centralize Handlers to prevent duplication
      setupSocketListeners();

      return true;
    } catch (error) {
      console.error("❌ WebSocket Initialization Failed:", error);
      if (FEATURES.REALTIME_FALLBACK) startPollingFallback();
      return false;
    }
  }

  function setupSocketListeners() {
    if (!socket) return;

    socket.on("connect", () => {
      isConnected = true;
      console.log("✅ WebSocket connected");

      // Re-join rooms using a Set to ensure uniqueness
      subscribedRooms.forEach((room) => socket.emit("join_room", room));
    });

    socket.on("disconnect", (reason) => {
      isConnected = false;
      // If server disconnected us intentionally, don't auto-fallback immediately
      if (reason === "io server disconnect") {
        socket.connect();
      }
      if (FEATURES.REALTIME_FALLBACK) startPollingFallback();
    });

    // Message mapping - use a generic relay if many events are similar
    const events = ["offer_updated", "booking_updated", "deal_updated"];
    events.forEach((event) => {
      socket.on(event, (data) => {
        console.log(`📨 ${event}:`, data);
        emit(event, data);
      });
    });
  }

  /**
   * Disconnect from WebSocket server
   */
  function disconnect() {
    if (socket) {
      socket.disconnect();
      socket = null;
    }
    isConnected = false;
    subscribedRooms.clear();
    stopPollingFallback();
    console.log("🔌 WebSocket disconnected");
  }

  /**
   * Subscribe to offers updates
   */
  function subscribeOffers(filters = {}) {
    if (!isConnected || !socket) {
      console.warn("⚠️ Cannot subscribe: not connected");
      return false;
    }

    try {
      socket.emit("subscribe_offers", filters);
      const room = `offers:${JSON.stringify(filters)}`;
      subscribedRooms.add(room);
      return true;
    } catch (error) {
      console.error("Error subscribing to offers:", error);
      return false;
    }
  }

  /**
   * Subscribe to booking updates
   */
  function subscribeBookings(userId) {
    if (!isConnected || !socket) {
      console.warn("⚠️ Cannot subscribe: not connected");
      return false;
    }

    try {
      socket.emit("subscribe_bookings", userId);
      const room = `bookings:${userId}`;
      subscribedRooms.add(room);
      return true;
    } catch (error) {
      console.error("Error subscribing to bookings:", error);
      return false;
    }
  }

  /**
   * Join a room
   */
  function joinRoom(room) {
    if (!isConnected || !socket) {
      return false;
    }

    try {
      socket.emit("join_room", room);
      subscribedRooms.add(room);
      return true;
    } catch (error) {
      console.error("Error joining room:", error);
      return false;
    }
  }

  /**
   * Leave a room
   */
  function leaveRoom(room) {
    if (!isConnected || !socket) {
      return false;
    }

    try {
      socket.emit("leave_room", room);
      subscribedRooms.delete(room);
      return true;
    } catch (error) {
      console.error("Error leaving room:", error);
      return false;
    }
  }

  /**
   * Emit event to handlers
   */
  function emit(event, data) {
    const handlers = eventHandlers.get(event) || [];
    handlers.forEach((handler) => {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Subscribe to events
   */
  function on(event, handler) {
    if (typeof handler !== "function") {
      console.error("Handler must be a function");
      return;
    }

    if (!eventHandlers.has(event)) {
      eventHandlers.set(event, []);
    }
    eventHandlers.get(event).push(handler);
  }

  /**
   * Unsubscribe from events
   */
  function off(event, handler) {
    if (!eventHandlers.has(event)) {
      return;
    }

    const handlers = eventHandlers.get(event);
    const index = handlers.indexOf(handler);
    if (index > -1) {
      handlers.splice(index, 1);
    }
  }

  /**
   * Start polling fallback
   */
  function startPollingFallback() {
    if (pollingFallback) {
      return; // Already started
    }

    console.log("🔄 Starting polling fallback");
    pollingFallback = setInterval(() => {
      // Trigger refresh events
      emit("polling_refresh", { timestamp: new Date().toISOString() });
    }, pollingInterval);
  }

  /**
   * Stop polling fallback
   */
  function stopPollingFallback() {
    if (pollingFallback) {
      clearInterval(pollingFallback);
      pollingFallback = null;
      console.log("🛑 Stopped polling fallback");
    }
  }

  /**
   * Track view (for analytics)
   */
  function trackView(type, id) {
    if (!isConnected || !socket) {
      return;
    }

    try {
      socket.emit("track_view", {
        type,
        id,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Error tracking view:", error);
    }
  }

  /**
   * Get connection status
   */
  function getStatus() {
    return {
      enabled: ENABLE_REALTIME,
      connected: isConnected,
      subscribedRooms: Array.from(subscribedRooms),
      reconnectAttempts: reconnectAttempts,
      pollingActive: pollingFallback !== null,
    };
  }

  // Public API
  const realtimeService = {
    connect,
    disconnect,
    subscribeOffers,
    subscribeBookings,
    joinRoom,
    leaveRoom,
    on,
    off,
    trackView,
    getStatus,
    get isConnected() {
      return isConnected;
    },
    get enabled() {
      return ENABLE_REALTIME;
    },
  };

  // Export to window
  window.realtimeService = realtimeService;

  // Auto-connect if enabled
  if (ENABLE_REALTIME) {
    // Wait for DOM to be ready
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => {
        setTimeout(() => connect(), 1000); // Delay to ensure server is ready
      });
    } else {
      setTimeout(() => connect(), 1000);
    }
  }

  console.log(
    ENABLE_REALTIME
      ? "🔴 Real-time service loaded (enabled)"
      : "🟡 Real-time service loaded (disabled)"
  );
})();
