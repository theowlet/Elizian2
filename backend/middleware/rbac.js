// ============================================
// ROLE-BASED ACCESS CONTROL (RBAC) MIDDLEWARE
// ============================================

const { pool } = require('../config/database');

/**
 * Get user role from database
 */
async function getUserRole(userId) {
  try {
    const result = await pool.query(
      `SELECT r.role_name, r.permissions 
       FROM users u
       JOIN roles r ON u.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  } catch (error) {
    console.error('Error fetching user role:', error);
    return null;
  }
}

/**
 * Check if user has required permission
 */
function hasPermission(userRole, requiredPermission) {
  if (!userRole || !userRole.permissions) return false;
  
  const permissions = userRole.permissions;
  
  // Super admin has all permissions
  if (permissions.admin === true) return true;
  
  // Check specific permissions
  const [action, resource] = requiredPermission.split(':');
  
  if (permissions[action]) {
    const allowed = permissions[action];
    if (Array.isArray(allowed)) {
      return allowed.includes(resource) || allowed.includes('*');
    }
  }
  
  return false;
}

/**
 * RBAC Middleware Factory
 * Usage: requireRole('super_admin') or requirePermission('read:bookings')
 */
function requireRole(...allowedRoles) {
  return async (req, res, next) => {
    try {
      const userId = req.userId || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'authentication_required',
          message: 'Authentication required'
        });
      }
      
      const userRole = await getUserRole(userId);
      
      if (!userRole) {
        return res.status(403).json({
          success: false,
          error: 'role_not_found',
          message: 'User role not found'
        });
      }
      
      if (!allowedRoles.includes(userRole.role_name)) {
        return res.status(403).json({
          success: false,
          error: 'insufficient_permissions',
          message: `Required role: ${allowedRoles.join(' or ')}`
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('RBAC middleware error:', error);
      res.status(500).json({
        success: false,
        error: 'rbac_error',
        message: 'Authorization check failed'
      });
    }
  };
}

function requirePermission(permission) {
  return async (req, res, next) => {
    try {
      const userId = req.userId || req.user?.id;
      
      if (!userId) {
        return res.status(401).json({
          success: false,
          error: 'authentication_required',
          message: 'Authentication required'
        });
      }
      
      const userRole = await getUserRole(userId);
      
      if (!userRole) {
        return res.status(403).json({
          success: false,
          error: 'role_not_found',
          message: 'User role not found'
        });
      }
      
      if (!hasPermission(userRole, permission)) {
        return res.status(403).json({
          success: false,
          error: 'insufficient_permissions',
          message: `Required permission: ${permission}`
        });
      }
      
      req.userRole = userRole;
      next();
    } catch (error) {
      console.error('RBAC permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'rbac_error',
        message: 'Permission check failed'
      });
    }
  };
}

/**
 * Partner ownership check - ensure partner can only access their own data
 */
async function checkPartnerOwnership(req, res, next) {
  try {
    const userId = req.userId || req.user?.id;
    const partnerId = req.params.partnerId || req.params.id;
    
    if (!userId || !partnerId) {
      return res.status(400).json({
        success: false,
        error: 'missing_parameters',
        message: 'User ID and Partner ID required'
      });
    }
    
    // Check if user is associated with this partner
    const result = await pool.query(
      `SELECT id FROM partners WHERE id = $1 AND (owner_id = $2 OR id IN (
        SELECT partner_id FROM partner_auth WHERE partner_id = $1 AND user_id = $2
      ))`,
      [partnerId, userId]
    );
    
    if (result.rows.length === 0) {
      // Allow super admin to access any partner
      const userRole = await getUserRole(userId);
      if (userRole && userRole.role_name === 'super_admin') {
        return next();
      }
      
      return res.status(403).json({
        success: false,
        error: 'access_denied',
        message: 'You do not have access to this partner\'s data'
      });
    }
    
    next();
  } catch (error) {
    console.error('Partner ownership check error:', error);
    res.status(500).json({
      success: false,
      error: 'ownership_check_error',
      message: 'Failed to verify ownership'
    });
  }
}

module.exports = {
  requireRole,
  requirePermission,
  hasPermission,
  getUserRole,
  checkPartnerOwnership
};

