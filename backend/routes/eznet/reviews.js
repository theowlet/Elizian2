const express = require('express');
const { pool } = require('../../config/database');
const { authenticateToken } = require('../auth');

const router = express.Router();

// Helper functions
const successResponse = (res, statusCode, message, data = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
};

const errorResponse = (res, statusCode, message) => {
  return res.status(statusCode).json({ success: false, message });
};

// GET /api/v1/eznet/reviews - Get reviews
router.get('/', async (req, res) => {
  try {
    const { venue_id, event_id, user_id, rating, limit = 20, offset = 0 } = req.query;
    
    let query = `
      SELECT r.*, u.first_name, u.last_name, v.name as venue_name, e.title as event_title
      FROM reviews r
      LEFT JOIN users u ON r.user_id = u.id
      LEFT JOIN venues v ON r.venue_id = v.id
      LEFT JOIN events e ON r.event_id = e.id
      WHERE 1=1
    `;
    let params = [];

    if (venue_id) {
      query += ` AND r.venue_id = $${params.length + 1}`;
      params.push(venue_id);
    }

    if (event_id) {
      query += ` AND r.event_id = $${params.length + 1}`;
      params.push(event_id);
    }

    if (user_id) {
      query += ` AND r.user_id = $${params.length + 1}`;
      params.push(user_id);
    }

    if (rating) {
      query += ` AND r.rating = $${params.length + 1}`;
      params.push(rating);
    }

    query += ` ORDER BY r.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(parseInt(limit), parseInt(offset));

    const result = await pool.query(query, params);

    successResponse(res, 200, 'Reviews retrieved successfully', result.rows);

  } catch (err) {
    console.error('Get reviews error:', err);
    errorResponse(res, 500, 'Failed to retrieve reviews');
  }
});

// GET /api/v1/eznet/reviews/:id - Get review by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      `SELECT r.*, u.first_name, u.last_name, v.name as venue_name, e.title as event_title
       FROM reviews r
       LEFT JOIN users u ON r.user_id = u.id
       LEFT JOIN venues v ON r.venue_id = v.id
       LEFT JOIN events e ON r.event_id = e.id
       WHERE r.id = $1`,
      [id]
    );

    const review = result.rows[0];

    if (!review) {
      return errorResponse(res, 404, 'Review not found');
    }

    successResponse(res, 200, 'Review retrieved successfully', review);

  } catch (err) {
    console.error('Get review error:', err);
    errorResponse(res, 500, 'Failed to retrieve review');
  }
});

// POST /api/v1/eznet/reviews - Create new review (protected)
router.post('/', authenticateToken, async (req, res) => {
  try {
    const { venue_id, event_id, rating, comment, photos } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return errorResponse(res, 400, 'Rating must be between 1 and 5');
    }

    if (!venue_id && !event_id) {
      return errorResponse(res, 400, 'Either venue_id or event_id is required');
    }

    // Check if user has already reviewed this venue/event
    let checkQuery = '';
    let checkParams = [req.userId];

    if (venue_id) {
      checkQuery = 'SELECT id FROM reviews WHERE user_id = $1 AND venue_id = $2';
      checkParams.push(venue_id);
    } else {
      checkQuery = 'SELECT id FROM reviews WHERE user_id = $1 AND event_id = $2';
      checkParams.push(event_id);
    }

    const existingReview = await pool.query(checkQuery, checkParams);

    if (existingReview.rows.length > 0) {
      return errorResponse(res, 400, 'You have already reviewed this venue/event');
    }

    // Verify user has attended the event (if reviewing an event)
    if (event_id) {
      const bookingCheck = await pool.query(
        'SELECT id FROM bookings WHERE user_id = $1 AND event_id = $2 AND status = $3',
        [req.userId, event_id, 'confirmed']
      );

      if (bookingCheck.rows.length === 0) {
        return errorResponse(res, 400, 'You must have attended the event to review it');
      }
    }

    const result = await pool.query(
      `INSERT INTO reviews (user_id, venue_id, event_id, rating, comment, photos)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [req.userId, venue_id, event_id, rating, comment, JSON.stringify(photos || [])]
    );

    successResponse(res, 201, 'Review created successfully', result.rows[0]);

  } catch (err) {
    console.error('Create review error:', err);
    errorResponse(res, 500, 'Failed to create review');
  }
});

// PUT /api/v1/eznet/reviews/:id - Update review (protected)
router.put('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, comment, photos } = req.body;

    if (rating && (rating < 1 || rating > 5)) {
      return errorResponse(res, 400, 'Rating must be between 1 and 5');
    }

    const result = await pool.query(
      `UPDATE reviews 
       SET rating = COALESCE($1, rating),
           comment = COALESCE($2, comment),
           photos = COALESCE($3, photos),
           updated_at = NOW()
       WHERE id = $4 AND user_id = $5
       RETURNING *`,
      [rating, comment, photos ? JSON.stringify(photos) : null, id, req.userId]
    );

    const review = result.rows[0];

    if (!review) {
      return errorResponse(res, 404, 'Review not found or you are not authorized to edit it');
    }

    successResponse(res, 200, 'Review updated successfully', review);

  } catch (err) {
    console.error('Update review error:', err);
    errorResponse(res, 500, 'Failed to update review');
  }
});

// DELETE /api/v1/eznet/reviews/:id - Delete review (protected)
router.delete('/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    const result = await pool.query(
      'DELETE FROM reviews WHERE id = $1 AND user_id = $2 RETURNING *',
      [id, req.userId]
    );

    const review = result.rows[0];

    if (!review) {
      return errorResponse(res, 404, 'Review not found or you are not authorized to delete it');
    }

    successResponse(res, 200, 'Review deleted successfully', review);

  } catch (err) {
    console.error('Delete review error:', err);
    errorResponse(res, 500, 'Failed to delete review');
  }
});

// GET /api/v1/eznet/reviews/stats/:venue_id - Get venue review statistics
router.get('/stats/:venue_id', async (req, res) => {
  try {
    const { venue_id } = req.params;

    const result = await pool.query(
      `SELECT 
         COUNT(*) as total_reviews,
         AVG(rating) as average_rating,
         COUNT(CASE WHEN rating = 5 THEN 1 END) as five_star,
         COUNT(CASE WHEN rating = 4 THEN 1 END) as four_star,
         COUNT(CASE WHEN rating = 3 THEN 1 END) as three_star,
         COUNT(CASE WHEN rating = 2 THEN 1 END) as two_star,
         COUNT(CASE WHEN rating = 1 THEN 1 END) as one_star
       FROM reviews 
       WHERE venue_id = $1`,
      [venue_id]
    );

    const stats = result.rows[0];

    successResponse(res, 200, 'Review statistics retrieved successfully', {
      total_reviews: parseInt(stats.total_reviews),
      average_rating: parseFloat(stats.average_rating || 0).toFixed(1),
      rating_distribution: {
        five_star: parseInt(stats.five_star),
        four_star: parseInt(stats.four_star),
        three_star: parseInt(stats.three_star),
        two_star: parseInt(stats.two_star),
        one_star: parseInt(stats.one_star)
      }
    });

  } catch (err) {
    console.error('Get review stats error:', err);
    errorResponse(res, 500, 'Failed to retrieve review statistics');
  }
});

// POST /api/v1/eznet/reviews/:id/like - Like/unlike review (protected)
router.post('/:id/like', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if review exists
    const reviewCheck = await pool.query(
      'SELECT id FROM reviews WHERE id = $1',
      [id]
    );

    if (reviewCheck.rows.length === 0) {
      return errorResponse(res, 404, 'Review not found');
    }

    // Check if user has already liked this review
    const existingLike = await pool.query(
      'SELECT id FROM review_likes WHERE user_id = $1 AND review_id = $2',
      [req.userId, id]
    );

    if (existingLike.rows.length > 0) {
      // Unlike the review
      await pool.query(
        'DELETE FROM review_likes WHERE user_id = $1 AND review_id = $2',
        [req.userId, id]
      );

      successResponse(res, 200, 'Review unliked successfully', { liked: false });
    } else {
      // Like the review
      await pool.query(
        'INSERT INTO review_likes (user_id, review_id) VALUES ($1, $2)',
        [req.userId, id]
      );

      successResponse(res, 200, 'Review liked successfully', { liked: true });
    }

  } catch (err) {
    console.error('Like review error:', err);
    errorResponse(res, 500, 'Failed to like/unlike review');
  }
});

module.exports = router;
