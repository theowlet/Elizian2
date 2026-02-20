/**
 * WebSocket Event Handlers
 * All WebSocket event handlers for real-time updates
 */

const { log, logError } = require('../../utils/logger');
const { addClient, removeClient } = require('./websocketServer');
const { verifyToken } = require('../utils/jwt');

/**
 * Initialize WebSocket routes
 */
function initializeWebSocketRoutes(io) {
  if (!io) {
    logError('Cannot initialize WebSocket routes: io is null');
    return;
  }

  // Connection handler
  io.on('connection', (socket) => {
    const clientId = socket.id;
    addClient(clientId);
    log(`🔌 WebSocket client connected: ${clientId}`);

    // Send welcome message
    socket.emit('connected', {
      success: true,
      message: 'Connected to Elizian real-time service',
      clientId: clientId,
      timestamp: new Date().toISOString()
    });

    // Authenticate: client sends { token }, server sets socket.userId and allows join_user_room
    socket.on('authenticate', (payload, callback) => {
      try {
        const token = payload && payload.token;
        if (!token) {
          if (typeof callback === 'function') callback({ success: false, error: 'Token required' });
          return;
        }
        const decoded = verifyToken(token);
        if (!decoded || !decoded.userId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Invalid token' });
          return;
        }
        socket.userId = decoded.userId;
        if (typeof callback === 'function') callback({ success: true, userId: socket.userId });
      } catch (err) {
        logError('WebSocket authenticate error:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Join the user's private room (must call after authenticate)
    socket.on('join_user_room', (callback) => {
      try {
        if (!socket.userId) {
          if (typeof callback === 'function') callback({ success: false, error: 'Authenticate first' });
          return;
        }
        const room = `users:${socket.userId}`;
        socket.join(room);
        log(`👤 Client ${clientId} joined user room: ${room}`);
        if (typeof callback === 'function') callback({ success: true, room });
      } catch (err) {
        logError('Error joining user room:', err);
        if (typeof callback === 'function') callback({ success: false, error: err.message });
      }
    });

    // Handle client joining rooms
    socket.on('join_room', (room) => {
      try {
        socket.join(room);
        log(`👤 Client ${clientId} joined room: ${room}`);
        socket.emit('room_joined', {
          success: true,
          room: room,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logError('Error joining room:', error);
        socket.emit('error', {
          success: false,
          error: 'Failed to join room',
          timestamp: new Date().toISOString()
        });
      }
    });

    // Handle client leaving rooms
    socket.on('leave_room', (room) => {
      try {
        socket.leave(room);
        log(`👤 Client ${clientId} left room: ${room}`);
        socket.emit('room_left', {
          success: true,
          room: room,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logError('Error leaving room:', error);
      }
    });

    // Handle offer updates subscription
    socket.on('subscribe_offers', (filters) => {
      try {
        const room = `offers:${JSON.stringify(filters || {})}`;
        socket.join(room);
        log(`📦 Client ${clientId} subscribed to offers: ${room}`);
        socket.emit('subscribed', {
          success: true,
          type: 'offers',
          room: room,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logError('Error subscribing to offers:', error);
      }
    });

    // Handle booking updates subscription
    socket.on('subscribe_bookings', (userId) => {
      try {
        const room = `bookings:${userId}`;
        socket.join(room);
        log(`📅 Client ${clientId} subscribed to bookings: ${room}`);
        socket.emit('subscribed', {
          success: true,
          type: 'bookings',
          room: room,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        logError('Error subscribing to bookings:', error);
      }
    });

    // Handle ping/pong for connection health
    socket.on('ping', () => {
      socket.emit('pong', {
        timestamp: new Date().toISOString()
      });
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      removeClient(clientId);
      log(`🔌 WebSocket client disconnected: ${clientId} (reason: ${reason})`);
    });

    // Handle errors
    socket.on('error', (error) => {
      logError(`WebSocket error for client ${clientId}:`, error);
    });
  });

  log('✅ WebSocket routes initialized');
}

module.exports = initializeWebSocketRoutes;

