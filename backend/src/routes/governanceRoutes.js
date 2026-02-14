const router = require('express').Router();
const governanceController = require('../controllers/governanceController');
const authenticateToken = require('../../middleware/authenticateToken');

router.get('/proposals', governanceController.listProposals);
router.get('/proposals/:id', governanceController.getProposal);
router.post('/proposals', authenticateToken, governanceController.createProposal);
router.post('/proposals/:id/vote', authenticateToken, governanceController.castVote);
router.get('/proposals/:id/voted', authenticateToken, governanceController.hasVoted);

module.exports = router;
