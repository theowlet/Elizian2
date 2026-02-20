/**
 * Admin Analytics Controller — Enterprise dashboard
 * All routes require authenticateToken + requireSuperAdmin. No cross-partner leakage.
 */

const analyticsService = require('../services/analyticsService');
const { successResponse, errorResponse } = require('../../utils/response');
const { logError } = require('../utils/logger');

async function getDashboard(req, res) {
  try {
    const data = await analyticsService.getAdminDashboard(req.query);
    return successResponse(res, 200, 'Admin analytics retrieved', data);
  } catch (err) {
    logError('Admin analytics dashboard error:', err);
    return errorResponse(res, 500, 'Failed to retrieve admin analytics');
  }
}

async function getDrillDown(req, res) {
  try {
    const options = {
      deal_id: req.query.deal_id || null,
      weekday: req.query.weekday != null ? parseInt(req.query.weekday, 10) : null,
      limit: req.query.limit || 100,
    };
    const data = await analyticsService.getAdminDrillDown(req.query, options);
    return successResponse(res, 200, 'Drill-down records', data);
  } catch (err) {
    logError('Admin drill-down error:', err);
    return errorResponse(res, 500, 'Failed to retrieve drill-down data');
  }
}

async function exportCsv(req, res) {
  try {
    const rows = await analyticsService.getAdminDrillDown(req.query, { limit: 5000, export: true });
    const headers = ['booking_reference', 'created_at', 'fiat_amount', 'ezt_redeemed', 'revenue', 'deal_title', 'partner_name'];
    const csv = [headers.join(',')].concat(
      rows.map((r) =>
        [
          r.booking_reference,
          r.created_at,
          r.fiat_amount,
          r.ezt_redeemed,
          r.revenue,
          (r.deal_title || '').replace(/"/g, '""'),
          (r.partner_name || '').replace(/"/g, '""'),
        ].join(',')
      )
    ).join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=admin-analytics-export.csv');
    return res.send('\uFEFF' + csv);
  } catch (err) {
    logError('Admin analytics export error:', err);
    return errorResponse(res, 500, 'Export failed');
  }
}

async function listViews(req, res) {
  try {
    const userId = req.userId;
    const list = await analyticsService.listSavedViews(userId, 'admin');
    return successResponse(res, 200, 'Saved views', list);
  } catch (err) {
    logError('List saved views error:', err);
    return errorResponse(res, 500, 'Failed to list views');
  }
}

async function saveView(req, res) {
  try {
    const userId = req.userId;
    const { view_name, filter_json, is_default } = req.body || {};
    if (!view_name || !filter_json) return errorResponse(res, 400, 'view_name and filter_json required');
    const row = await analyticsService.saveView(userId, 'admin', view_name, filter_json, !!is_default);
    return successResponse(res, 201, 'View saved', row);
  } catch (err) {
    logError('Save view error:', err);
    return errorResponse(res, 500, 'Failed to save view');
  }
}

async function getView(req, res) {
  try {
    const userId = req.userId;
    const view = await analyticsService.getSavedView(req.params.viewId, userId);
    if (!view) return errorResponse(res, 404, 'View not found');
    return successResponse(res, 200, 'View', view);
  } catch (err) {
    logError('Get view error:', err);
    return errorResponse(res, 500, 'Failed to get view');
  }
}

async function setDefaultView(req, res) {
  try {
    const userId = req.userId;
    await analyticsService.setDefaultView(userId, 'admin', req.params.viewId);
    return successResponse(res, 200, 'Default view updated');
  } catch (err) {
    logError('Set default view error:', err);
    return errorResponse(res, 500, 'Failed to update default view');
  }
}

async function deleteView(req, res) {
  try {
    const userId = req.userId;
    const deleted = await analyticsService.deleteSavedView(req.params.viewId, userId);
    if (!deleted) return errorResponse(res, 404, 'View not found');
    return successResponse(res, 200, 'View deleted');
  } catch (err) {
    logError('Delete view error:', err);
    return errorResponse(res, 500, 'Failed to delete view');
  }
}

module.exports = {
  getDashboard,
  getDrillDown,
  exportCsv,
  listViews,
  saveView,
  getView,
  setDefaultView,
  deleteView,
};
