/**
 * WebSocket Server Wrapper
 * Feature-flagged WebSocket support for Elizian backend
 * 
 * This file wraps the existing Express app with Socket.IO
 * WITHOUT modifying existing REST API functionality
 */

const { log, logError } = require('../../utils/logger');

// Feature flag - can be disabled via environment variable
const ENABLE_WEBSOCKET = process.env.ENABLE_WEBSOCKET === 'true';

let socketIO = null;
let io = null;
let connectedClients = new Set();
let isInitialized = false;

/**
 * Initialize WebSocket server (only if enabled and dependencies available)
 */
function initializeWebSocket(app, server) {
  if (!ENABLE_WEBSOCKET) {
    log('🟡 WebSocket disabled (ENABLE_WEBSOCKET=false)');
    return null;
  }

  try {
    // Try to load socket.io
    socketIO = require('socket.io');
    
    if (!socketIO) {
      throw new Error('socket.io not installed');
    }

    // Create Socket.IO instance
    // Allow all origins in development, specific origin in production
    const allowedOrigins = process.env.FRONTEND_URL 
      ? [process.env.FRONTEND_URL]
      : [
          'http://localhost:3000',
          'http://localhost:8080',
          'http://localhost:5000',
          'http://127.0.0.1:3000',
          'http://127.0.0.1:8080',
          'http://127.0.0.1:5000',
          'file://' // Allow file:// protocol for local development
        ];
    
    io = socketIO(server, {
      cors: {
        origin: (origin, callback) => {
          // Allow requests with no origin (like mobile apps, Postman, or file://)
          if (!origin) return callback(null, true);
          
          // Check if origin is in allowed list
          if (allowedOrigins.some(allowed => origin.startsWith(allowed.replace('file://', '')))) {
            callback(null, true);
          } else {
            // In development, allow all origins
            if (process.env.NODE_ENV !== 'production') {
              callback(null, true);
            } else {
              callback(new Error('Not allowed by CORS'));
            }
          }
        },
        methods: ['GET', 'POST'],
        credentials: true
      },
      transports: ['websocket', 'polling'],
      allowEIO: true,
      pingTimeout: 60000,
      pingInterval: 25000
    });

    // Load WebSocket routes
    try {
      require('./websocketRoutes')(io);
      log('✅ WebSocket server initialized');
      isInitialized = true;
      return io;
    } catch (routeError) {
      logError('Failed to load WebSocket routes:', routeError);
      return null;
    }
  } catch (error) {
    logError('WebSocket initialization failed (dependencies missing?):', error.message);
    log('🟡 Falling back to polling mode');
    return null;
  }
}

/**
 * Get WebSocket instance (returns null if not initialized)
 */
function getIO() {
  return io;
}

/**
 * Check if WebSocket is enabled and initialized
 */
function isWebSocketEnabled() {
  return ENABLE_WEBSOCKET && isInitialized && io !== null;
}

/**
 * Broadcast to all connected clients
 */
function broadcast(event, data) {
  if (!isWebSocketEnabled()) {
    return false;
  }

  try {
    io.emit(event, {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    logError('Broadcast error:', error);
    return false;
  }
}

/**
 * Broadcast to specific room
 */
function broadcastToRoom(room, event, data) {
  if (!isWebSocketEnabled()) {
    return false;
  }

  try {
    io.to(room).emit(event, {
      success: true,
      data: data,
      timestamp: new Date().toISOString()
    });
    return true;
  } catch (error) {
    logError('Room broadcast error:', error);
    return false;
  }
}

/**
 * Get connection statistics
 */
function getStats() {
  return {
    enabled: ENABLE_WEBSOCKET,
    initialized: isInitialized,
    connectedClients: connectedClients.size,
    timestamp: new Date().toISOString()
  };
}

/**
 * Track connected client
 */
function addClient(clientId) {
  connectedClients.add(clientId);
}

/**
 * Remove disconnected client
 */
function removeClient(clientId) {
  connectedClients.delete(clientId);
}

module.exports = {
  initializeWebSocket,
  getIO,
  isWebSocketEnabled,
  broadcast,
  broadcastToRoom,
  getStats,
  addClient,
  removeClient
};

