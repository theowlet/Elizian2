const router = require('express').Router();
const developerController = require('../controllers/developerController');
const authenticateToken = require('../../middleware/authenticateToken');
const { authenticateApiKey } = require('../middleware/authenticateApiKey');

// User-scoped: manage API keys (require user JWT)
router.post('/keys', authenticateToken, developerController.createKey);
router.get('/keys', authenticateToken, developerController.listKeys);
router.delete('/keys/:id', authenticateToken, developerController.revokeKey);

module.exports = router;

// Public developer API (API key auth) – mount at /api/developer/v1
const publicRouter = require('express').Router();
publicRouter.get('/vouchers/validate', authenticateApiKey, developerController.validateVoucher);
publicRouter.post('/vouchers/validate', authenticateApiKey, developerController.validateVoucher);

module.exports.publicRouter = publicRouter;
