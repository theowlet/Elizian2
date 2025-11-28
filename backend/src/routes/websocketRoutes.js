/**
 * WebSocket Health Check Route
 * REST endpoint to check WebSocket status
 */

const express = require('express');
const router = express.Router();
const { getStats, isWebSocketEnabled } = require('../websocket/websocketServer');

/**
 * GET /api/v1/health/websocket
 * Check WebSocket server status
 */
router.get('/health/websocket', (req, res) => {
  try {
    const stats = getStats();
    res.json({
      success: true,
      ...stats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get WebSocket status',
      message: error.message
    });
  }
});

module.exports = router;

