/**
 * Enterprise Report Controller
 * All report generation routes through reportingEngineService. No duplicate logic.
 * Partner routes: scope forced to authenticated partner (checkPartnerOwnership).
 * Admin routes: requireSuperAdmin; filters from query.
 */

const reportingEngineService = require('../services/reportingEngineService');
const { successResponse, errorResponse } = require('../../utils/response');
const { log, logError } = require('../utils/logger');

/**
 * Partner report: scope = partner, authenticated_partner_id from req.partnerId (ignore params.id for scope).
 */
async function partnerReport(req, res) {
  try {
    const partnerId = req.partnerId || req.params.id;
    if (!partnerId) return errorResponse(res, 403, 'Partner ID required');
    const options = {
      scope: 'partner',
      authenticated_partner_id: partnerId,
      filters: req.query,
      report_type: req.query.report_type,
      drill_level: req.query.drill_level,
      group_by: req.query.group_by,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    const data = await reportingEngineService.generateReport(options);
    return successResponse(res, 200, 'Report generated', data);
  } catch (err) {
    logError('Partner report error:', err);
    return errorResponse(res, 500, 'Failed to generate report');
  }
}

/**
 * Admin report: scope = admin; filters (partner_id, tier_id, etc.) from query.
 */
async function adminReport(req, res) {
  try {
    const options = {
      scope: 'admin',
      filters: req.query,
      report_type: req.query.report_type,
      drill_level: req.query.drill_level,
      group_by: req.query.group_by,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      limit: req.query.limit,
      offset: req.query.offset,
    };
    const data = await reportingEngineService.generateReport(options);
    return successResponse(res, 200, 'Report generated', data);
  } catch (err) {
    logError('Admin report error:', err);
    return errorResponse(res, 500, 'Failed to generate report');
  }
}

/**
 * Partner drill-down to raw redemption records.
 */
async function partnerDrillDown(req, res) {
  try {
    const partnerId = req.partnerId || req.params.id;
    if (!partnerId) return errorResponse(res, 403, 'Partner ID required');
    const data = await reportingEngineService.getDrillDown(
      {},
      'partner',
      partnerId,
      req.query,
      {
        deal_id: req.query.deal_id,
        weekday: req.query.weekday != null ? parseInt(req.query.weekday, 10) : undefined,
        limit: req.query.limit,
        offset: req.query.offset,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
      }
    );
    return successResponse(res, 200, 'Drill-down records', data);
  } catch (err) {
    logError('Partner report drill-down error:', err);
    return errorResponse(res, 500, 'Failed to retrieve drill-down data');
  }
}

/**
 * Admin drill-down to raw redemption records.
 */
async function adminDrillDown(req, res) {
  try {
    const data = await reportingEngineService.getDrillDown(
      {},
      'admin',
      null,
      req.query,
      {
        deal_id: req.query.deal_id,
        weekday: req.query.weekday != null ? parseInt(req.query.weekday, 10) : undefined,
        partner_id: req.query.partner_id,
        limit: req.query.limit,
        offset: req.query.offset,
        start_date: req.query.start_date,
        end_date: req.query.end_date,
      }
    );
    return successResponse(res, 200, 'Drill-down records', data);
  } catch (err) {
    logError('Admin report drill-down error:', err);
    return errorResponse(res, 500, 'Failed to retrieve drill-down data');
  }
}

/**
 * Export report as CSV (partner or admin). Includes applied filters and generated timestamp.
 * Audit: log when export is large (e.g. limit >= 5000).
 */
async function exportReportCsv(req, res) {
  try {
    const isAdmin = req.baseUrl.includes('/admin/');
    const partnerId = !isAdmin ? (req.partnerId || req.params.id) : null;
    if (!isAdmin && !partnerId) return errorResponse(res, 403, 'Partner ID required');

    const exportLimit = 5000;
    const options = {
      scope: isAdmin ? 'admin' : 'partner',
      authenticated_partner_id: partnerId,
      filters: req.query,
      report_type: req.query.report_type,
      limit: exportLimit,
    };
    const report = await reportingEngineService.generateReport(options);
    const rowCount = (report.rows || report.grouped_data || []).length + (report.drill_data || []).length;
    if (rowCount >= 1000) {
      log('[ReportExport] Large export', { scope: options.scope, report_type: options.report_type, rowCount, userId: req.userId, partnerId: partnerId || undefined });
    }
    const rows = report.rows || report.grouped_data || [];
    const drill = report.drill_data || [];
    const exportRows = drill.length > 0 ? drill : rows;

    const headers = exportRows.length > 0 ? Object.keys(exportRows[0]) : [];
    const csvRows = [headers.join(',')].concat(
      exportRows.map((r) =>
        headers.map((h) => {
          const v = r[h];
          if (v == null) return '';
          const s = String(v);
          return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
        }).join(',')
      )
    );
    const csv = csvRows.join('\n');
    const meta = `# Filters: ${JSON.stringify(report.meta?.filter || {})}\n# Generated: ${new Date().toISOString()}\n# Scope: ${report.meta?.scope}\n`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=report-${report.meta?.report_type || 'export'}-${Date.now()}.csv`);
    return res.send('\uFEFF' + meta + csv);
  } catch (err) {
    logError('Report export CSV error:', err);
    return errorResponse(res, 500, 'Export failed');
  }
}

/**
 * Reconciliation check (admin or partner). Verifies SUM(bookings) vs platform_earnings_ledger.
 */
async function reconciliationCheck(req, res) {
  try {
    const isAdmin = req.baseUrl.includes('/admin/');
    const partnerId = !isAdmin ? (req.partnerId || req.params.id) : null;
    const { parseReportOptions } = require('../services/analyticsFilterEngine');
    const context = { isAdmin };
    const { filter } = parseReportOptions(req.query || {}, context);
    const scope = reportingEngineService.resolveScope(isAdmin ? 'admin' : 'partner', partnerId, filter);
    const result = await reportingEngineService.runReconciliationCheck(filter, scope);
    return successResponse(res, 200, 'Reconciliation check', result);
  } catch (err) {
    logError('Reconciliation check error:', err);
    return errorResponse(res, 500, 'Reconciliation check failed');
  }
}

module.exports = {
  partnerReport,
  adminReport,
  partnerDrillDown,
  adminDrillDown,
  exportReportCsv,
  reconciliationCheck,
};
