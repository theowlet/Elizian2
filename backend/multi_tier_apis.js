// Multi-Tier Partner Management APIs
// Fixed version with proper imports, error handling, and SQL queries

const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Import database connection from server.js
const { Pool } = require('pg');

// Create database connection pool - Railway compatible
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

// Helper functions
const successResponse = (res, statusCode, message, data = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
};

const errorResponse = (res, statusCode, message, details = null) => {
  const response = { success: false, error: message };
  if (details) response.details = details;
  return res.status(statusCode).json(response);
};

const logError = (...args) => console.error(new Date().toISOString(), ...args);

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  
  if (!token) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId || decoded.partnerId;
    req.partnerId = decoded.partnerId;
    next();
  } catch (err) {
    return res.status(403).json({ success: false, error: "Invalid token" });
  }
};

// Get Organization Hierarchy
router.get('/organizations/:id/hierarchy', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      WITH RECURSIVE org_hierarchy AS (
        SELECT id, name, type, parent_org_id, tier_level, organization_code, 0 as level
        FROM partner_organizations 
        WHERE id = $1 AND is_active = true
        
        UNION ALL
        
        SELECT po.id, po.name, po.type, po.parent_org_id, po.tier_level, po.organization_code, oh.level + 1
        FROM partner_organizations po
        JOIN org_hierarchy oh ON po.parent_org_id = oh.id
        WHERE po.is_active = true
      )
      SELECT * FROM org_hierarchy ORDER BY level, tier_level;
    `, [id]);
    
    successResponse(res, 200, 'Organization hierarchy retrieved successfully', result.rows);
  } catch (err) {
    logError('Organization hierarchy error:', err);
    errorResponse(res, 500, 'Failed to retrieve organization hierarchy', err.message);
  }
});

// Get Sub-Organizations (FIXED COUNT QUERY)
router.get('/organizations/:id/sub-organizations', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { type, tier_level } = req.query;
    
    let query = `
      SELECT po.*, 
             (SELECT COUNT(*) FROM partner_stores ps WHERE ps.organization_id = po.id) as store_count,
             (SELECT COUNT(*) FROM partner_users pu WHERE pu.organization_id = po.id) as user_count
      FROM partner_organizations po
      WHERE po.parent_org_id = $1 AND po.is_active = true
    `;
    
    const params = [id];
    
    if (type) {
      query += ` AND po.type = $${params.length + 1}`;
      params.push(type);
    }
    
    if (tier_level) {
      query += ` AND po.tier_level = $${params.length + 1}`;
      params.push(parseInt(tier_level));
    }
    
    query += ` ORDER BY po.tier_level, po.name`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Sub-organizations retrieved successfully', result.rows);
  } catch (err) {
    logError('Sub-organizations error:', err);
    errorResponse(res, 500, 'Failed to retrieve sub-organizations', err.message);
  }
});

// Create New Organization (FIXED USER CHECK)
router.post('/organizations', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { name, type, parent_org_id, tier_level, organization_code, description, address, contact_info } = req.body;
    
    // Validate required fields
    if (!name || !type || !organization_code) {
      return errorResponse(res, 400, 'Name, type, and organization_code are required');
    }

    await client.query('BEGIN');

    // Check if user has permission (FIXED: use req.userId)
    const userCheck = await client.query(`
      SELECT can_create_sub_orgs, access_level, organization_id
      FROM partner_users 
      WHERE id = $1 AND is_active = true
    `, [req.userId]);
    
    if (userCheck.rows.length === 0 || !userCheck.rows[0].can_create_sub_orgs) {
      await client.query('ROLLBACK');
      return errorResponse(res, 403, 'Insufficient permissions to create organizations');
    }

    // Validate parent organization exists (if provided)
    if (parent_org_id) {
      const parentCheck = await client.query(
        'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
        [parent_org_id]
      );
      
      if (parentCheck.rows.length === 0) {
        await client.query('ROLLBACK');
        return errorResponse(res, 400, 'Parent organization not found');
      }
    }
    
    const result = await client.query(`
      INSERT INTO partner_organizations 
      (name, type, parent_org_id, tier_level, organization_code, description, address, contact_info, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)
      RETURNING *
    `, [name, type, parent_org_id, tier_level, organization_code, description, address, contact_info]);
    
    await client.query('COMMIT');
    successResponse(res, 201, 'Organization created successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Organization creation error:', err);
    if (err.code === '23505') {
      errorResponse(res, 400, 'Organization code already exists');
    } else if (err.code === '23503') {
      errorResponse(res, 400, 'Invalid parent organization reference');
    } else {
      errorResponse(res, 500, 'Failed to create organization', err.message);
    }
  } finally {
    client.release();
  }
});

// Get Users by Organization
router.get('/organizations/:id/users', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT pu.*, po.name as organization_name, po.type as organization_type
      FROM partner_users pu
      JOIN partner_organizations po ON pu.organization_id = po.id
      WHERE pu.organization_id = $1 AND pu.is_active = true
      ORDER BY pu.access_level DESC, pu.user_type
    `, [id]);
    
    successResponse(res, 200, 'Organization users retrieved successfully', result.rows);
  } catch (err) {
    logError('Organization users error:', err);
    errorResponse(res, 500, 'Failed to retrieve organization users', err.message);
  }
});

// Create User with Role
router.post('/organizations/:id/users', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { user_type, permissions, access_level, can_create_sub_orgs, can_approve_changes, budget_limit } = req.body;
    
    // Validate required fields
    if (!user_type) {
      return errorResponse(res, 400, 'user_type is required');
    }

    await client.query('BEGIN');

    // Check if requesting user has permission (FIXED: use req.userId)
    const userCheck = await client.query(`
      SELECT can_create_sub_orgs, access_level 
      FROM partner_users 
      WHERE id = $1 AND is_active = true
    `, [req.userId]);
    
    if (userCheck.rows.length === 0 || !userCheck.rows[0].can_create_sub_orgs) {
      await client.query('ROLLBACK');
      return errorResponse(res, 403, 'Insufficient permissions to create users');
    }

    // Verify organization exists
    const orgCheck = await client.query(
      'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (orgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Organization not found');
    }
    
    const result = await client.query(`
      INSERT INTO partner_users 
      (organization_id, user_type, permissions, access_level, can_create_sub_orgs, can_approve_changes, budget_limit, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *
    `, [id, user_type, permissions, access_level || 1, can_create_sub_orgs || false, can_approve_changes || false, budget_limit]);
    
    await client.query('COMMIT');
    successResponse(res, 201, 'User created successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('User creation error:', err);
    errorResponse(res, 500, 'Failed to create user', err.message);
  } finally {
    client.release();
  }
});

// Get Templates
router.get('/organizations/:id/templates', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM standardization_templates 
      WHERE organization_id = $1 AND is_active = true
      ORDER BY template_type, created_at DESC
    `, [id]);
    
    successResponse(res, 200, 'Templates retrieved successfully', result.rows);
  } catch (err) {
    logError('Templates error:', err);
    errorResponse(res, 500, 'Failed to retrieve templates', err.message);
  }
});

// Create Template
router.post('/organizations/:id/templates', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { template_type, template_data, description, is_mandatory } = req.body;
    
    if (!template_type || !template_data) {
      return errorResponse(res, 400, 'template_type and template_data are required');
    }

    await client.query('BEGIN');

    // Verify organization exists
    const orgCheck = await client.query(
      'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (orgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Organization not found');
    }
    
    const result = await client.query(`
      INSERT INTO standardization_templates 
      (organization_id, template_type, template_data, description, is_mandatory, is_active)
      VALUES ($1, $2, $3, $4, $5, true)
      RETURNING *
    `, [id, template_type, template_data, description, is_mandatory || false]);
    
    await client.query('COMMIT');
    successResponse(res, 201, 'Template created successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Template creation error:', err);
    errorResponse(res, 500, 'Failed to create template', err.message);
  } finally {
    client.release();
  }
});

// Get Approval Requests
router.get('/organizations/:id/approval-requests', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.query;
    
    let query = `
      SELECT ar.*, po.name as organization_name, pu.user_type as requester_type
      FROM approval_requests ar
      JOIN partner_organizations po ON ar.organization_id = po.id
      JOIN partner_users pu ON ar.requester_id = pu.id
      WHERE ar.organization_id = $1
    `;
    
    const params = [id];
    
    if (status) {
      query += ` AND ar.status = $${params.length + 1}`;
      params.push(status);
    }
    
    query += ` ORDER BY ar.created_at DESC`;
    
    const result = await pool.query(query, params);
    successResponse(res, 200, 'Approval requests retrieved successfully', result.rows);
  } catch (err) {
    logError('Approval requests error:', err);
    errorResponse(res, 500, 'Failed to retrieve approval requests', err.message);
  }
});

// Create Approval Request
router.post('/organizations/:id/approval-requests', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { request_type, request_data, description, priority } = req.body;
    
    if (!request_type || !request_data) {
      return errorResponse(res, 400, 'request_type and request_data are required');
    }

    await client.query('BEGIN');

    // Verify organization exists
    const orgCheck = await client.query(
      'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (orgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Organization not found');
    }
    
    const result = await client.query(`
      INSERT INTO approval_requests 
      (organization_id, requester_id, request_type, request_data, description, priority, status)
      VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      RETURNING *
    `, [id, req.userId, request_type, request_data, description, priority || 'medium']);
    
    await client.query('COMMIT');
    successResponse(res, 201, 'Approval request created successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Approval request creation error:', err);
    errorResponse(res, 500, 'Failed to create approval request', err.message);
  } finally {
    client.release();
  }
});

// Update Approval Request
router.put('/approval-requests/:id', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { status, comments } = req.body;
    
    if (!status) {
      return errorResponse(res, 400, 'status is required');
    }

    await client.query('BEGIN');

    // Check if user can approve
    const userCheck = await client.query(`
      SELECT can_approve_changes, access_level 
      FROM partner_users 
      WHERE id = $1 AND is_active = true
    `, [req.userId]);
    
    if (userCheck.rows.length === 0 || !userCheck.rows[0].can_approve_changes) {
      await client.query('ROLLBACK');
      return errorResponse(res, 403, 'Insufficient permissions to approve requests');
    }
    
    const result = await client.query(`
      UPDATE approval_requests 
      SET status = $1, comments = $2, approved_by = $3, approved_at = NOW()
      WHERE id = $4
      RETURNING *
    `, [status, comments, req.userId, id]);
    
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Approval request not found');
    }
    
    await client.query('COMMIT');
    successResponse(res, 200, 'Approval request updated successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Approval request update error:', err);
    errorResponse(res, 500, 'Failed to update approval request', err.message);
  } finally {
    client.release();
  }
});

// Get Analytics
router.get('/organizations/:id/analytics', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { period = '30' } = req.query;
    
    const result = await pool.query(`
      SELECT 
        COUNT(DISTINCT po.id) as total_organizations,
        COUNT(DISTINCT ps.id) as total_stores,
        COUNT(DISTINCT pu.id) as total_users,
        COUNT(DISTINCT ar.id) as pending_approvals,
        COALESCE(SUM(pa.revenue), 0) as total_revenue,
        COALESCE(AVG(pa.performance_score), 0) as avg_performance
      FROM partner_organizations po
      LEFT JOIN partner_stores ps ON po.id = ps.organization_id
      LEFT JOIN partner_users pu ON po.id = pu.organization_id
      LEFT JOIN approval_requests ar ON po.id = ar.organization_id AND ar.status = 'pending'
      LEFT JOIN partner_analytics pa ON po.id = pa.organization_id 
        AND pa.created_at >= NOW() - INTERVAL '${parseInt(period)} days'
      WHERE po.id = $1 OR po.parent_org_id = $1
    `, [id]);
    
    successResponse(res, 200, 'Analytics retrieved successfully', result.rows[0]);
  } catch (err) {
    logError('Analytics error:', err);
    errorResponse(res, 500, 'Failed to retrieve analytics', err.message);
  }
});

// Get Stores
router.get('/organizations/:id/stores', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT ps.*, po.name as organization_name
      FROM partner_stores ps
      JOIN partner_organizations po ON ps.organization_id = po.id
      WHERE ps.organization_id = $1 AND ps.is_active = true
      ORDER BY ps.name
    `, [id]);
    
    successResponse(res, 200, 'Stores retrieved successfully', result.rows);
  } catch (err) {
    logError('Stores error:', err);
    errorResponse(res, 500, 'Failed to retrieve stores', err.message);
  }
});

// Create Store
router.post('/organizations/:id/stores', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { name, address, phone, email, capacity, manager_name } = req.body;
    
    if (!name || !address) {
      return errorResponse(res, 400, 'name and address are required');
    }

    await client.query('BEGIN');

    // Verify organization exists
    const orgCheck = await client.query(
      'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (orgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Organization not found');
    }
    
    const result = await client.query(`
      INSERT INTO partner_stores 
      (organization_id, name, address, phone, email, capacity, manager_name, is_active)
      VALUES ($1, $2, $3, $4, $5, $6, $7, true)
      RETURNING *
    `, [id, name, address, phone, email, capacity, manager_name]);
    
    await client.query('COMMIT');
    successResponse(res, 201, 'Store created successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Store creation error:', err);
    errorResponse(res, 500, 'Failed to create store', err.message);
  } finally {
    client.release();
  }
});

// Get Localization Settings
router.get('/organizations/:id/localization', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT * FROM localization_settings 
      WHERE organization_id = $1
      ORDER BY created_at DESC
    `, [id]);
    
    successResponse(res, 200, 'Localization settings retrieved successfully', result.rows);
  } catch (err) {
    logError('Localization error:', err);
    errorResponse(res, 500, 'Failed to retrieve localization settings', err.message);
  }
});

// Update Localization Settings
router.put('/organizations/:id/localization', authenticateToken, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    const { language, currency, date_format, timezone, cultural_preferences } = req.body;
    
    await client.query('BEGIN');

    // Verify organization exists
    const orgCheck = await client.query(
      'SELECT id FROM partner_organizations WHERE id = $1 AND is_active = true',
      [id]
    );
    
    if (orgCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return errorResponse(res, 404, 'Organization not found');
    }
    
    const result = await client.query(`
      INSERT INTO localization_settings 
      (organization_id, language, currency, date_format, timezone, cultural_preferences)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (organization_id) 
      DO UPDATE SET 
        language = EXCLUDED.language,
        currency = EXCLUDED.currency,
        date_format = EXCLUDED.date_format,
        timezone = EXCLUDED.timezone,
        cultural_preferences = EXCLUDED.cultural_preferences,
        updated_at = NOW()
      RETURNING *
    `, [id, language, currency, date_format, timezone, cultural_preferences]);
    
    await client.query('COMMIT');
    successResponse(res, 200, 'Localization settings updated successfully', result.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    logError('Localization update error:', err);
    errorResponse(res, 500, 'Failed to update localization settings', err.message);
  } finally {
    client.release();
  }
});

module.exports = router;