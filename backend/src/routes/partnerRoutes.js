const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const partnerController = require('../controllers/partnerController');
const { checkPartnerOwnership } = require('../../middleware/rbac');

const router = express.Router();

// Public routes
router.get('/', partnerController.listPartners);

// Partner menu images routes (scrollable menu viewer) - MUST be before /:id route
// Uses memoryStorage so files arrive as buffers → uploaded directly to S3
const multer = require('multer');

const menuImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB limit (S3 handles compression)
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

router.get('/:id/menu-images', partnerController.getMenuImages);
// Allow many menu pages per partner (no practical limit; 100 per request to avoid abuse)
router.post('/:id/menu-images', authenticateToken, checkPartnerOwnership, menuImageUpload.array('menuImages', 100), partnerController.uploadMenuImages);
router.delete('/:id/menu-images/:index', authenticateToken, checkPartnerOwnership, partnerController.deleteMenuImage);

// Venue detail page (public): partner profile, menu, hours, reviews summary, active offers
router.get('/:id/venue-detail', partnerController.getVenueDetail);
// Public: today's check-in count for social proof (NFC taps + visit sessions)
router.get('/:id/check-ins-today', partnerController.getCheckInsToday);

// Venue reviews (social proof): list public, submit requires auth
const reviewController = require('../controllers/reviewController');
router.get('/:id/reviews', reviewController.listReviews);
router.post('/:id/reviews', authenticateToken, reviewController.submitReview);

// In-app tips: submit requires auth; list for partner only
const tipController = require('../controllers/tipController');
router.post('/:id/tips', authenticateToken, tipController.createTip);
router.get('/:id/tips', authenticateToken, checkPartnerOwnership, tipController.listForPartner);

// Merchant notification campaigns (partner-only)
const campaignController = require('../controllers/campaignController');
router.get('/:id/campaigns', authenticateToken, checkPartnerOwnership, campaignController.listForPartner);
router.post('/:id/campaigns', authenticateToken, checkPartnerOwnership, campaignController.create);
router.get('/:id/campaigns/:campaignId', authenticateToken, checkPartnerOwnership, campaignController.getOne);
router.put('/:id/campaigns/:campaignId', authenticateToken, checkPartnerOwnership, campaignController.update);
router.post('/:id/campaigns/:campaignId/send', authenticateToken, checkPartnerOwnership, campaignController.sendCampaign);

// Enterprise campaign workflow for partners (tier-gated)
const partnerEnterpriseCampaignController = require('../controllers/partnerEnterpriseCampaignController');
router.get('/:id/enterprise-campaigns/schema', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.getSchema);
router.get('/:id/enterprise-campaigns', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.listCampaigns);
router.get('/:id/enterprise-campaigns/:campaignId', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.getCampaign);
router.post('/:id/enterprise-campaigns', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.createCampaign);
router.put('/:id/enterprise-campaigns/:campaignId', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.updateCampaign);
router.post('/:id/enterprise-campaigns/:campaignId/pause', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.pauseCampaign);
router.post('/:id/enterprise-campaigns/:campaignId/activate', authenticateToken, checkPartnerOwnership, partnerEnterpriseCampaignController.activateCampaign);

// Guest CRM (partner-only, authenticated)
const guestController = require('../controllers/guestController');
router.get('/:id/guests', authenticateToken, checkPartnerOwnership, guestController.listGuests);
router.get('/:id/guests/:userId', authenticateToken, checkPartnerOwnership, guestController.getGuestProfile);
router.post('/:id/guests/:userId/notes', authenticateToken, checkPartnerOwnership, guestController.addGuestNote);

// Per-venue custom tiers (partner-only)
const venueTierController = require('../controllers/venueTierController');
router.get('/:id/tiers', authenticateToken, checkPartnerOwnership, venueTierController.list);
router.post('/:id/tiers', authenticateToken, checkPartnerOwnership, venueTierController.create);
router.put('/:id/tiers/:tierId', authenticateToken, checkPartnerOwnership, venueTierController.update);
router.delete('/:id/tiers/:tierId', authenticateToken, checkPartnerOwnership, venueTierController.remove);

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

// Operating Hours Management (partner-only, authenticated)
const operatingHoursController = require('../controllers/operatingHoursController');
router.get('/me/operating-hours', authenticateToken, operatingHoursController.getHours);
router.put('/me/operating-hours', authenticateToken, operatingHoursController.updateHours);
router.post('/me/special-closures', authenticateToken, operatingHoursController.addClosure);
router.get('/me/special-closures', authenticateToken, operatingHoursController.listClosures);
router.delete('/me/special-closures/:id', authenticateToken, operatingHoursController.deleteClosure);
router.post('/me/accepting-bookings', authenticateToken, operatingHoursController.toggleAccepting);

// Public endpoints for users to see venue hours
router.get('/:id/operating-hours', operatingHoursController.getPublicHours);
router.get('/:id/operating-hours/:date', operatingHoursController.getHoursForDate);

// Waitlist management (partner-only, authenticated)
const waitlistController = require('../controllers/waitlistController');
router.get('/me/waitlist', authenticateToken, waitlistController.getPartnerWaitlist);
router.post('/me/waitlist/notify-next', authenticateToken, waitlistController.notifyNext);
router.get('/me/waitlist/stats', authenticateToken, waitlistController.getWaitlistStats);
router.get('/:id/waitlist', authenticateToken, checkPartnerOwnership, waitlistController.getPartnerWaitlist);
router.post('/:id/waitlist/notify-next', authenticateToken, checkPartnerOwnership, waitlistController.notifyNext);
router.get('/:id/waitlist/stats', authenticateToken, checkPartnerOwnership, waitlistController.getWaitlistStats);

// Verify venue location (geocode address → update lat/lon; partner auth)
router.post('/:id/verify-location', authenticateToken, checkPartnerOwnership, partnerController.verifyLocation);

router.get('/:id', partnerController.getPartner);

// Admin only routes
router.post('/', authenticateToken, requireSuperAdmin, partnerController.createPartner);
router.put('/:id', authenticateToken, requireSuperAdmin, partnerController.updatePartner);
router.delete('/:id', authenticateToken, requireSuperAdmin, partnerController.deletePartner);

// Partner auth routes
router.post('/auth/login', partnerController.login);
router.post('/auth/register', partnerController.register);
router.post('/auth/forgot-password', partnerController.forgotPassword);
router.post('/auth/reset-password', partnerController.resetPassword);
router.post('/auth/resend-otp', partnerController.resendOtp);

// Partner dashboard and analytics (authenticated)
router.get('/:id/dashboard', authenticateToken, checkPartnerOwnership, partnerController.getDashboard);
router.get('/:id/analytics', authenticateToken, checkPartnerOwnership, partnerController.getAnalytics);

// Enterprise Analytics Dashboard (filter-driven, saved views, export)
const partnerAnalyticsController = require('../controllers/partnerAnalyticsController');
router.get('/:id/analytics/dashboard', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.getDashboard);
router.get('/:id/analytics/widgets/:widgetKey', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.getWidget);
router.get('/:id/analytics/drill-down', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.getDrillDown);
router.get('/:id/analytics/export/csv', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.exportCsv);
router.get('/:id/analytics/views', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.listViews);
router.post('/:id/analytics/views', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.saveView);
router.get('/:id/analytics/views/:viewId', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.getView);
router.put('/:id/analytics/views/:viewId/default', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.setDefaultView);
router.delete('/:id/analytics/views/:viewId', authenticateToken, checkPartnerOwnership, partnerAnalyticsController.deleteView);

// Enterprise Reporting (micro-level, partner-scoped; all via reportingEngineService)
const reportController = require('../controllers/reportController');
router.get('/:id/reports', authenticateToken, checkPartnerOwnership, reportController.partnerReport);
router.get('/:id/reports/drill-down', authenticateToken, checkPartnerOwnership, reportController.partnerDrillDown);
router.get('/:id/reports/export/csv', authenticateToken, checkPartnerOwnership, reportController.exportReportCsv);
router.get('/:id/reports/reconciliation', authenticateToken, checkPartnerOwnership, reportController.reconciliationCheck);

// Partner menu routes
const menuController = require('../controllers/menuController');
router.get('/:id/menu', menuController.listMenuItems);
router.post('/:id/menu', authenticateToken, checkPartnerOwnership, menuController.createMenuItem);
router.put('/:id/menu/:itemId', authenticateToken, checkPartnerOwnership, menuController.updateMenuItem);
router.delete('/:id/menu/:itemId', authenticateToken, checkPartnerOwnership, menuController.deleteMenuItem);

// Partner custom taxonomy (categories) route
const taxonomyController = require('../controllers/taxonomyController');
router.post('/:id/taxonomy', authenticateToken, checkPartnerOwnership, taxonomyController.createCustomCategory);

// Partner offers routes
const offerController = require('../controllers/offerController');
router.get('/:id/offers', offerController.listOffers);
router.get('/:id/offers/:offerId', offerController.getOffer);
router.post('/:id/offers', authenticateToken, checkPartnerOwnership, offerController.createOffer);
router.put('/:partnerId/offers/:offerId', authenticateToken, checkPartnerOwnership, offerController.updateOffer);
router.delete('/:partnerId/offers/:offerId', authenticateToken, checkPartnerOwnership, offerController.deleteOffer);

// Partner orders routes (food/pre-orders)
const orderController = require('../controllers/orderController');
router.get('/:id/orders', authenticateToken, checkPartnerOwnership, orderController.listOrders);
router.put('/:id/orders/:orderId', authenticateToken, checkPartnerOwnership, orderController.updateOrderStatus);

// Partner bookings routes (events/deals)
const partnerBookingController = require('../controllers/partnerBookingController');
router.get('/:id/vouchers/lookup', authenticateToken, checkPartnerOwnership, partnerBookingController.lookupVoucher);
router.get('/:id/bookings', authenticateToken, checkPartnerOwnership, partnerBookingController.listPartnerBookings);
router.get('/:id/bookings/stats', authenticateToken, checkPartnerOwnership, partnerBookingController.getBookingStats);
router.get('/:id/bookings/:bookingId', authenticateToken, checkPartnerOwnership, partnerBookingController.getPartnerBooking);
router.put('/:id/bookings/:bookingId/status', authenticateToken, checkPartnerOwnership, partnerBookingController.updateBookingStatus);

// Partner rewards analytics
router.get('/:id/rewards/analytics', authenticateToken, checkPartnerOwnership, partnerController.getRewardsAnalytics);

module.exports = router;
