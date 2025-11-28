const { log, logError } = require('./logger');

let websocketModule = null;
let moduleInitialized = false;

function loadWebsocketModule() {
  if (moduleInitialized) {
    return websocketModule;
  }
  moduleInitialized = true;
  try {
    // Lazy-load to avoid crashing if websocket module not bundled
    // eslint-disable-next-line global-require
    websocketModule = require('../websocket/websocketServer');
  } catch (error) {
    websocketModule = null;
    log('🟡 WebSocket module not available (optional feature).');
  }
  return websocketModule;
}

function getIO() {
  const wsModule = loadWebsocketModule();
  if (!wsModule || typeof wsModule.getIO !== 'function') {
    return null;
  }
  try {
    return wsModule.getIO();
  } catch (error) {
    logError('❌ Failed to get WebSocket IO instance:', error);
    return null;
  }
}

function emitRealtimeEvent(eventName, payload = {}) {
  if (!eventName) return false;
  const io = getIO();
  if (!io) return false;
  try {
    io.emit(eventName, payload);
    log(`[Realtime] Event emitted: ${eventName}`, payload);
    return true;
  } catch (error) {
    logError('❌ Failed to emit realtime event:', error);
    return false;
  }
}

function emitToRoom(room, eventName, payload = {}) {
  if (!room || !eventName) return false;
  const io = getIO();
  if (!io) return false;
  try {
    io.to(room).emit(eventName, payload);
    log(`[Realtime] Event emitted to ${room}: ${eventName}`, payload);
    return true;
  } catch (error) {
    logError('❌ Failed to emit realtime room event:', error);
    return false;
  }
}

const REALTIME_EVENTS = Object.freeze({
  DEAL_UPDATED: 'offers:updated',
  DEAL_TRENDING_CHANGED: 'offers:trending_status_changed',
  BOOKING_CREATED: 'bookings:created',
  BOOKING_STATUS_CHANGED: 'bookings:status_changed',
  BOOKING_REFUNDED: 'bookings:refunded',
  PARTNER_BOOKING_UPDATE: 'partners:booking_update',
  LOYALTY_UPDATED: 'loyalty:updated',
  TOKENS_UPDATED: 'tokens:updated'
});

function getRealtimeStatus() {
  const io = getIO();
  return {
    enabled: Boolean(io),
    connectedClients: loadWebsocketModule()?.getConnectedClientsCount?.() || 0
  };
}

module.exports = {
  emitRealtimeEvent,
  emitToRoom,
  getRealtimeStatus,
  REALTIME_EVENTS
};

