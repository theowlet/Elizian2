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

// Partner offers routes
const offerController = require('../controllers/offerController');
router.get('/:id/offers', offerController.listOffers);
router.post('/:id/offers', offerController.createOffer);
router.put('/:partnerId/offers/:offerId', offerController.updateOffer);
router.delete('/:partnerId/offers/:offerId', offerController.deleteOffer);

// Partner orders routes
const orderController = require('../controllers/orderController');
router.get('/:id/orders', orderController.listOrders);
router.put('/:id/orders/:orderId', orderController.updateOrderStatus);

module.exports = router;

