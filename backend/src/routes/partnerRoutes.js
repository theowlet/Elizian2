const express = require('express');
const authenticateToken = require('../../middleware/authenticateToken');
const requireSuperAdmin = require('../middleware/requireSuperAdmin');
const partnerController = require('../controllers/partnerController');

const router = express.Router();

// Public routes
router.get('/', partnerController.listPartners);
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

// Partner menu images routes (scrollable menu viewer)
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

router.post('/:id/menu-images', menuImageUpload.array('menuImages', 20), partnerController.uploadMenuImages);
router.delete('/:id/menu-images/:index', partnerController.deleteMenuImage);

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

module.exports = router;

