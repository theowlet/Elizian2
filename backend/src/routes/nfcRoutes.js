const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const nfcController = require('../controllers/nfcController');

const router = express.Router();

// ─── Public tap endpoint (no auth required, but user is extracted if logged in) ───
// Optional auth: try to extract userId but don't block if no token
function optionalAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.userId = null;
    return next();
  }
  // Delegate to authenticateToken but catch failures
  authenticateToken(req, res, (err) => {
    if (err) {
      req.userId = null;
    }
    next();
  });
}

// Consumer taps NFC puck — public but with optional auth
router.post('/tap/:puckCode', optionalAuth, nfcController.handleTap);
router.get('/tap/:puckCode', optionalAuth, nfcController.handleTap); // GET for NFC URL redirect

// ─── Partner management endpoints (require partner auth) ───
router.get('/pucks', authenticateToken, nfcController.listPucks);
router.post('/pucks', authenticateToken, nfcController.registerPuck);
router.put('/pucks/:puckId', authenticateToken, nfcController.updatePuck);
router.delete('/pucks/:puckId', authenticateToken, nfcController.deletePuck);
router.get('/pucks/analytics', authenticateToken, nfcController.getPuckAnalytics);

module.exports = router;
