const express = require('express');
const authenticateToken = require('../middleware/authenticateToken');
const theatreController = require('../controllers/theatreController');

const router = express.Router();

// ============================================
// THEATRE ROUTES (Partner Admin)
// ============================================

router.post('/theatres', authenticateToken, theatreController.createTheatre);
router.get('/theatres', theatreController.listTheatres); // Public listing
router.get('/theatres/:id', theatreController.getTheatre); // Public
router.put('/theatres/:id', authenticateToken, theatreController.updateTheatre);
router.delete('/theatres/:id', authenticateToken, theatreController.deleteTheatre);

// ============================================
// SCREEN ROUTES (Partner Admin)
// ============================================

router.post('/screens', authenticateToken, theatreController.createScreen);
router.get('/screens', theatreController.listScreens); // Public listing
router.get('/screens/:id', theatreController.getScreen); // Public
router.put('/screens/:id', authenticateToken, theatreController.updateScreen);

// ============================================
// SEAT TEMPLATE ROUTES (Partner Admin)
// ============================================

router.post('/seat-templates', authenticateToken, theatreController.createSeatTemplate);
router.post('/seat-templates/bulk', authenticateToken, theatreController.bulkCreateSeatTemplates);
router.get('/screens/:screen_id/seat-templates', theatreController.getSeatTemplates); // Public

// ============================================
// SHOW ROUTES
// ============================================

router.post('/shows', authenticateToken, theatreController.createShow);
router.get('/shows', theatreController.listShows); // Public listing
router.get('/shows/:id', theatreController.getShow); // Public

// ============================================
// SHOW SEAT ROUTES (Customer + Partner)
// ============================================

router.get('/shows/:show_id/seat-map', theatreController.getShowSeatMap); // Public
router.post('/shows/:show_id/reserve-seats', authenticateToken, theatreController.reserveSeats); // Customer
router.post('/shows/:show_id/confirm-booking', authenticateToken, theatreController.confirmSeatBooking); // Partner/System
router.post('/shows/:show_id/release-seats', authenticateToken, theatreController.releaseSeats); // Customer/System

module.exports = router;

