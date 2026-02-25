const express = require('express');
const multer = require('multer');
const authenticateToken = require('../../middleware/authenticateToken');
const authController = require('../../controllers/authController');
const membershipCardController = require('../controllers/membershipCardController');
const userVenueStatsController = require('../controllers/userVenueStatsController');

const router = express.Router();

const profilePhotoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

const cardAvatarUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype && file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// User profile endpoint (requires authentication)
router.get('/profile', authenticateToken, authController.getProfile);
router.post('/profile-photo', authenticateToken, profilePhotoUpload.single('photo'), authController.uploadProfilePhoto);

// Venue membership cards (Phase 3 #17 – digital collectibles per venue)
router.get('/membership-cards', authenticateToken, membershipCardController.getMyCards);
// NFT metadata for a specific membership card (for future on-chain minting)
router.get('/membership-cards/:cardId/nft-metadata', authenticateToken, membershipCardController.getCardNftMetadata);
// Card avatar: proxy upload (server uploads to S3; no CORS needed)
router.post('/membership-cards/:cardId/avatar/upload', authenticateToken, cardAvatarUpload.single('avatar'), membershipCardController.uploadCardAvatar);
// S3-native avatar: presigned PUT URL (frontend uploads directly to S3)
router.post('/membership-cards/:cardId/avatar/upload-url', authenticateToken, membershipCardController.getAvatarUploadUrl);
// Save card avatar config (S3 URLs only; no base64)
router.put('/membership-cards/:cardId/avatar', authenticateToken, membershipCardController.updateCardAvatar);

// User's stats at a venue (visit count, EZT earned) for "You & this venue" block
router.get('/venue-stats/:partnerId', authenticateToken, userVenueStatsController.getVenueStats);

// User tip history
const tipController = require('../controllers/tipController');
router.get('/tips', authenticateToken, tipController.listByUser);

module.exports = router;

