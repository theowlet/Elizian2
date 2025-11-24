const { getUserRoleById } = require('../utils/queries');

async function requireSuperAdmin(req, res, next) {
  try {
    const roleName = await getUserRoleById(req.userId);
    if (roleName !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Admin privileges required' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ success: false, error: 'Role verification failed' });
  }
}

module.exports = requireSuperAdmin;

