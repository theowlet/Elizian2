const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const partnerController = require('../controllers/partnerController');

const router = express.Router();

// Public routes
router.get('/', partnerController.listPartners);

// Partner menu images routes (scrollable menu viewer) - MUST be before /:id route
const multer = require('multer');
const path = require('path');

const menuImageStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, '../../uploads/menu'));
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'menu-' + req.params.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const menuImageUpload = multer({
  storage: menuImageStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

router.get('/:id/menu-images', partnerController.getMenuImages);
router.post('/:id/menu-images', menuImageUpload.array('menuImages', 20), partnerController.uploadMenuImages);
router.delete('/:id/menu-images/:index', partnerController.deleteMenuImage);

// Venue detail page (public): partner profile, menu, hours, reviews summary, active offers
router.get('/:id/venue-detail', partnerController.getVenueDetail);

// Venue reviews (social proof): list public, submit requires auth
const reviewController = require('../controllers/reviewController');
router.get('/:id/reviews', reviewController.listReviews);
router.post('/:id/reviews', authenticateToken, reviewController.submitReview);

// In-app tips: submit requires auth; list for partner only
const tipController = require('../controllers/tipController');
router.post('/:id/tips', authenticateToken, tipController.createTip);
router.get('/:id/tips', authenticateToken, tipController.listForPartner);

// Merchant notification campaigns (partner-only)
const campaignController = require('../controllers/campaignController');
router.get('/:id/campaigns', authenticateToken, campaignController.listForPartner);
router.post('/:id/campaigns', authenticateToken, campaignController.create);
router.get('/:id/campaigns/:campaignId', authenticateToken, campaignController.getOne);
router.put('/:id/campaigns/:campaignId', authenticateToken, campaignController.update);
router.post('/:id/campaigns/:campaignId/send', authenticateToken, campaignController.sendCampaign);

// Guest CRM (partner-only, authenticated)
const guestController = require('../controllers/guestController');
router.get('/:id/guests', authenticateToken, guestController.listGuests);
router.get('/:id/guests/:userId', authenticateToken, guestController.getGuestProfile);
router.post('/:id/guests/:userId/notes', authenticateToken, guestController.addGuestNote);

// Per-venue custom tiers (partner-only)
const venueTierController = require('../controllers/venueTierController');
router.get('/:id/tiers', authenticateToken, venueTierController.list);
router.post('/:id/tiers', authenticateToken, venueTierController.create);
router.put('/:id/tiers/:tierId', authenticateToken, venueTierController.update);
router.delete('/:id/tiers/:tierId', authenticateToken, venueTierController.remove);

// In-app messaging: user get-or-create conversation; partner list + get/send messages (partner-scoped)
const messagingController = require('../controllers/messagingController');
router.get('/:id/conversations/me', authenticateToken, messagingController.getOrCreateWithPartner);
router.get('/:id/conversations/unread', authenticateToken, messagingController.getUnreadCountPartner);
router.get('/:id/conversations', authenticateToken, messagingController.listPartnerConversations);
router.get('/:id/conversations/:conversationId/messages', authenticateToken, messagingController.getMessagesForPartner);
router.post('/:id/conversations/:conversationId/messages', authenticateToken, messagingController.sendMessageForPartner);
router.post('/:id/conversations/:conversationId/read', authenticateToken, messagingController.markReadForPartner);

router.post('/:id/passes/redeem', authenticateToken, require('../controllers/subscriptionPassController').redeemAtPartner);

router.get('/:id/prelaunch/check', authenticateToken, require('../controllers/prelaunchController').check);
router.post('/:id/prelaunch/signup', authenticateToken, require('../controllers/prelaunchController').signup);
router.get('/:id/prelaunch/signups', authenticateToken, require('../controllers/prelaunchController').listForPartner);

// Staff / Employee Rewards (partner-only)
const staffController = require('../controllers/staffController');
router.get('/:id/staff', authenticateToken, staffController.list);
router.post('/:id/staff', authenticateToken, staffController.addStaff);
router.delete('/:id/staff/:userId', authenticateToken, staffController.removeStaff);
router.post('/:id/staff/check-in', authenticateToken, staffController.checkIn);
router.get('/:id/staff/check-ins', authenticateToken, staffController.listCheckIns);

// Current partner profile (must be before /:id so "me" is not captured as id)
router.get('/me', authenticateToken, partnerController.getPartnerMe);

// Verify venue location (geocode address → update lat/lon; partner auth)
router.post('/:id/verify-location', authenticateToken, partnerController.verifyLocation);

router.get('/:id', partnerController.getPartner);

// Admin only routes
router.post('/', authenticateToken, requireSuperAdmin, partnerController.createPartner);
router.put('/:id', partnerController.updatePartner);
router.delete('/:id', partnerController.deletePartner);

// Partner auth routes
router.post('/auth/login', partnerController.login);
router.post('/auth/register', partnerController.register);
router.post('/auth/forgot-password', partnerController.forgotPassword);
router.post('/auth/reset-password', partnerController.resetPassword);
router.post('/auth/resend-otp', partnerController.resendOtp);

// Partner dashboard and analytics (authenticated)
router.get('/:id/dashboard', partnerController.getDashboard);
router.get('/:id/analytics', authenticateToken, partnerController.getAnalytics);

// Partner menu routes
const menuController = require('../controllers/menuController');
router.get('/:id/menu', menuController.listMenuItems);
router.post('/:id/menu', menuController.createMenuItem);
router.put('/:id/menu/:itemId', menuController.updateMenuItem);
router.delete('/:id/menu/:itemId', menuController.deleteMenuItem);

// Partner offers routes
const offerController = require('../controllers/offerController');
router.get('/:id/offers', offerController.listOffers);
router.post('/:id/offers', offerController.createOffer);
router.put('/:partnerId/offers/:offerId', offerController.updateOffer);
router.delete('/:partnerId/offers/:offerId', offerController.deleteOffer);

// Partner orders routes (food/pre-orders)
const orderController = require('../controllers/orderController');
router.get('/:id/orders', orderController.listOrders);
router.put('/:id/orders/:orderId', orderController.updateOrderStatus);

// Partner bookings routes (events/deals)
const partnerBookingController = require('../controllers/partnerBookingController');
router.get('/:id/bookings', partnerBookingController.listPartnerBookings);
router.get('/:id/bookings/stats', partnerBookingController.getBookingStats);
router.get('/:id/bookings/:bookingId', partnerBookingController.getPartnerBooking);
router.put('/:id/bookings/:bookingId/status', partnerBookingController.updateBookingStatus);

// Partner rewards analytics
router.get('/:id/rewards/analytics', authenticateToken, partnerController.getRewardsAnalytics);

module.exports = router;

