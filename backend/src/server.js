// ============================================
// ELIZIAN BACKEND - SERVER BOOTSTRAP
// ============================================

const config = require('./config/env');
const { initializeAllTables, getPool } = require('./config/db');
const validateEnvironment = require('../config/validateEnvironment');
const { log, logError } = require('../utils/logger');
const cache = require('../utils/cache');
const { startBookingAutoCancelJob } = require('./jobs/bookingAutoCancelJob');
const { startEventCleanupJob } = require('./jobs/eventCleanupJob');
const { startRedemptionExpirationJob } = require('./jobs/redemptionExpirationJob');
const { startWaitlistPromotionJob } = require('./jobs/waitlistPromotionJob');

// Validate environment before proceeding
validateEnvironment();

// Initialize database pool
const pool = getPool();

// Initialize Redis cache
cache.initRedis().catch((err) => logError('Redis init failed:', err.message || err));

// Ensure upload directories exist on startup
const fs = require('fs');
const path = require('path');
const uploadsRoot = path.join(__dirname, '..', 'uploads');
const uploadDirs = [
  uploadsRoot,
  path.join(uploadsRoot, 'offers'),
  path.join(uploadsRoot, 'menu'),
  path.join(uploadsRoot, 'events'),
  path.join(uploadsRoot, 'orders'),
  path.join(uploadsRoot, 'vouchers')
];

uploadDirs.forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`📁 Created upload directory: ${dir}`);
  }
});
log(`✅ Upload directories verified`);

// Initialize database tables
initializeAllTables().catch((err) => {
  logError('Failed to initialize database tables:', err);
  // Don't exit - allow server to start even if some tables fail
});

// Start cron jobs
startBookingAutoCancelJob();
startEventCleanupJob();
startRedemptionExpirationJob();
startWaitlistPromotionJob();

// Import app after all initialization
const app = require('./app');

// WebSocket integration (feature-flagged, safe to fail)
let websocketIO = null;
try {
  websocketIO = require('./websocket/websocketServer');
  log('✅ WebSocket module loaded (will initialize if enabled)');
} catch (error) {
  // WebSocket not available - graceful degradation
  log('🟡 WebSocket module not available (optional feature):', error.message);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logError('💥 Unhandled Rejection at:', promise, 'reason:', reason);
});

// Handle process warnings
process.on('warning', (warning) => {
  logError('⚠️ Process Warning:', warning.name, warning.message);
  logError('Stack:', warning.stack);
});

// Graceful shutdown handlers
let server;
let heartbeatInterval = null;

const gracefulShutdown = async (signal) => {
  log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
  
  // Set timeout for forced shutdown
  const forceShutdownTimeout = setTimeout(() => {
    logError('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 30000); // 30 seconds
  
  try {
    // Clear heartbeat
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      log('✅ Heartbeat cleared');
    }
    
    // Close WebSocket connections (if enabled)
    if (websocketIO && websocketIO.getIO) {
      const io = websocketIO.getIO();
      if (io) {
        io.close();
        log('✅ WebSocket server closed');
      }
    }
    
    // Stop accepting new requests
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      log('✅ HTTP server closed (no new connections)');
    }
    
    // Close database connections
    if (pool) {
      await pool.end();
      log('✅ Database connections closed');
    }
    
    // Clear timeout
    clearTimeout(forceShutdownTimeout);
    
    log('✅ Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    clearTimeout(forceShutdownTimeout);
    logError('❌ Error during shutdown:', error);
    process.exit(1);
  }
};

// Register signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Start server (only if not Vercel)
if (!config.isVercel) {
  const PORT = config.server.port;
  server = app.listen(PORT, () => {
    log(`✅ Elizian Backend running on port ${PORT}`);
    log(`📊 Process PID: ${process.pid}`);
    log(`🔄 Auto-restart enabled: ${config.env === 'development' ? 'Yes' : 'No'}`);
    
    // Initialize WebSocket (if enabled and available) - SAFE INTEGRATION
    if (websocketIO && websocketIO.initializeWebSocket) {
      try {
        const io = websocketIO.initializeWebSocket(app, server);
        if (io) {
          log('✅ WebSocket server initialized');
        }
      } catch (error) {
        logError('WebSocket initialization error:', error);
        // Continue without WebSocket - graceful degradation
      }
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logError(`❌ Port ${PORT} is already in use`);
      process.exit(1);
    } else {
      logError('❌ Server error:', error);
    }
  });
} else {
  log('🚀 Express app exported for Vercel serverless (no local listener)');
}

// Keep process alive (heartbeat with actual health check)
if (!config.isVercel) {
  heartbeatInterval = setInterval(() => {
    // Perform actual health check
    if (pool) {
      pool.query('SELECT 1')
        .catch(err => logError('Database health check failed:', err));
    }
  }, 30000); // Every 30 seconds
}

// Export the Express app for Vercel serverless
module.exports = app;

