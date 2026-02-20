/**
 * Enterprise Reporting Engine Service
 * Single entry for all report generation. No duplicate logic in controllers.
 * Partner scope: partner_id is forced from auth (ignored from input).
 * Admin scope: filter by partner_id, tier_id, category, etc.
 * All data from canonical tables; drill-down traces to raw redemption records.
 */

const { parseReportOptions } = require('./analyticsFilterEngine');
const reportingRepository = require('../repositories/reportingRepository');

/**
 * Resolve scope for repository calls.
 * @param {"partner"|"admin"} scopeType
 * @param {string} [authenticatedPartnerId] - from req.partnerId (partner routes)
 * @param {Object} filters - parsed filter (may contain partner_id for admin)
 * @returns {{ partnerId?: string, partnerIds?: string[] }}
 */
function resolveScope(scopeType, authenticatedPartnerId, filters) {
  if (scopeType === 'partner') {
    return { partnerId: authenticatedPartnerId || null };
  }
  // Admin: optional partner filter
  if (filters.partner_id && filters.partner_id.length > 0) {
    return { partnerIds: filters.partner_id };
  }
  return {};
}

/**
 * Generate a report. All reporting queries route through this service.
 * @param {Object} options
 * @param {"partner"|"admin"} options.scope
 * @param {string} [options.partner_id] - ignored when scope=partner; used only to enforce auth
 * @param {string} [options.authenticated_partner_id] - for partner scope (required)
 * @param {string} [options.start_date]
 * @param {string} [options.end_date]
 * @param {string} [options.group_by] - deal | category | weekday | month | tier | partner | hour | customer_type
 * @param {Object} [options.filters] - raw query/body (passed to parseReportOptions)
 * @param {number} [options.drill_level] - 1 summary, 2 + grouped, 3 + raw records
 * @param {string} [options.report_type] - partner: deal | customer | weekday | platform_fee; admin: partner_grid | tier | deal_comparison | revenue_concentration | customer_mobility
 * @param {number} [options.limit]
 * @param {number} [options.offset]
 */
async function generateReport(options = {}) {
  const scopeType = options.scope === 'admin' ? 'admin' : 'partner';
  const context = { isAdmin: scopeType === 'admin' };
  const { filter, group_by, drill_level } = parseReportOptions(options.filters || {}, context);

  // Override dates if provided at top level
  if (options.start_date) filter.start_date = options.start_date;
  if (options.end_date) filter.end_date = options.end_date;

  const authenticatedPartnerId = options.authenticated_partner_id || options.partner_id;
  const scope = resolveScope(scopeType, authenticatedPartnerId, filter);

  const reportType = (options.report_type || '').toLowerCase();
  const limit = Math.min(Number(options.limit) || 100, 500);
  const offset = Math.max(0, Number(options.offset) || 0);

  // --- Partner reports (micro) ---
  if (scopeType === 'partner') {
    const result = await generatePartnerReport(reportType, filter, scope, { drill_level, group_by, limit, offset });
    return normalizeResponse(result, { filter, scopeType, reportType, drill_level });
  }

  // --- Admin reports (macro) ---
  const result = await generateAdminReport(reportType, filter, scope, { drill_level, group_by, limit, offset });
  return normalizeResponse(result, { filter, scopeType, reportType, drill_level });
}

async function generatePartnerReport(reportType, filter, scope, opts) {
  const { drill_level, limit, offset } = opts;
  let summary = {};
  let grouped_data = [];
  let drill_data = [];
  let subtotal_by_group = {};
  let grand_total = {};

  switch (reportType) {
    case 'deal':
    case 'deal_level': {
      const out = await reportingRepository.getPartnerDealReport(filter, scope, { limit });
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      if (drill_level >= 3 && out.rows.length > 0) {
        const firstDeal = out.rows[0];
        drill_data = await reportingRepository.getDrillDownRecords(filter, scope, {
          deal_id: firstDeal.deal_id,
          limit: 50,
          offset: 0,
        });
      }
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
    case 'customer':
    case 'customer_level': {
      const out = await reportingRepository.getPartnerCustomerReport(filter, scope, { limit });
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { unique_customers: grand_total.unique_customers, total_revenue: grand_total.total_revenue };
      break;
    }
    case 'weekday':
    case 'weekday_level': {
      const out = await reportingRepository.getPartnerWeekdayReport(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      if (drill_level >= 3 && out.rows.length > 0) {
        const first = out.rows[0];
        drill_data = await reportingRepository.getDrillDownRecords(filter, scope, {
          weekday: first.weekday,
          limit: 50,
          offset: 0,
        });
      }
      break;
    }
    case 'hour':
    case 'time_of_day': {
      const out = await reportingRepository.getPartnerHourReport(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
    case 'platform_fee': {
      const pel = await reportingRepository.getPlatformEarningsSummary(filter, scope);
      summary = { platform_earnings: pel.platform_earnings };
      const rev = await reportingRepository.getReconciliationTotal(filter, scope);
      summary.transaction_count = rev.transaction_count;
      summary.total_revenue = rev.total_revenue;
      break;
    }
    default: {
      // Default partner: deal-level
      const out = await reportingRepository.getPartnerDealReport(filter, scope, { limit });
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
  }

  return { summary, grouped_data, drill_data, rows: grouped_data, subtotal_by_group, grand_total };
}

async function generateAdminReport(reportType, filter, scope, opts) {
  const { drill_level, limit, offset } = opts;
  let summary = {};
  let grouped_data = [];
  let drill_data = [];
  let subtotal_by_group = {};
  let grand_total = {};

  switch (reportType) {
    case 'partner_grid':
    case 'partner_performance': {
      const out = await reportingRepository.getAdminPartnerPerformanceGrid(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      if (drill_level >= 3 && out.rows.length > 0) {
        const first = out.rows[0];
        drill_data = await reportingRepository.getDrillDownRecords(filter, scope, {
          partner_id: first.partner_id,
          limit: 50,
          offset: 0,
        });
      }
      break;
    }
    case 'tier':
    case 'tier_performance': {
      const out = await reportingRepository.getAdminTierPerformance(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
    case 'deal_comparison':
    case 'cross_partner_deal': {
      const out = await reportingRepository.getAdminCrossPartnerDealComparison(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
    case 'revenue_concentration': {
      const out = await reportingRepository.getAdminRevenueConcentration(filter, scope);
      summary = out;
      grouped_data = [];
      grand_total = {};
      break;
    }
    case 'customer_mobility': {
      const out = await reportingRepository.getAdminCustomerMobility(filter, scope, { limit });
      grouped_data = out.rows;
      summary = { segments: out.rows.length };
      break;
    }
    default: {
      const out = await reportingRepository.getAdminPartnerPerformanceGrid(filter, scope);
      grouped_data = out.rows;
      grand_total = out.grand_total || {};
      summary = { total_redemptions: grand_total.total_redemptions, total_revenue: grand_total.total_revenue };
      break;
    }
  }

  return { summary, grouped_data, drill_data, rows: grouped_data, subtotal_by_group, grand_total };
}

function normalizeResponse(result, meta) {
  return {
    summary: result.summary || {},
    grouped_data: result.grouped_data || result.rows || [],
    drill_data: result.drill_data || [],
    rows: result.rows || result.grouped_data || [],
    subtotal_by_group: result.subtotal_by_group || {},
    grand_total: result.grand_total || {},
    meta: {
      scope: meta.scopeType,
      report_type: meta.reportType,
      drill_level: meta.drill_level,
      filter: meta.filter ? { start_date: meta.filter.start_date, end_date: meta.filter.end_date, revenue_type: meta.filter.revenue_type } : {},
    },
  };
}

/**
 * Drill-down to raw redemption records (bookings). Used by partner and admin.
 */
async function getDrillDown(_filter, scopeType, authenticatedPartnerId, filters, options = {}) {
  const context = { isAdmin: scopeType === 'admin' };
  const { filter: parsedFilter } = parseReportOptions(filters || {}, context);
  if (options.start_date) parsedFilter.start_date = options.start_date;
  if (options.end_date) parsedFilter.end_date = options.end_date;
  const scope = resolveScope(scopeType, authenticatedPartnerId, parsedFilter);
  const limit = Math.min(Number(options.limit) || 100, 500);
  const offset = Math.max(0, Number(options.offset) || 0);
  const rows = await reportingRepository.getDrillDownRecords(parsedFilter, scope, {
    deal_id: options.deal_id,
    weekday: options.weekday,
    partner_id: options.partner_id,
    limit,
    offset,
  });
  return { rows, meta: { filter: { start_date: parsedFilter.start_date, end_date: parsedFilter.end_date } } };
}

/**
 * Data consistency check: SUM(deal revenue) vs SUM(bookings) and platform_earnings_ledger.
 * Returns { consistent, booking_total, platform_earnings }.
 */
async function runReconciliationCheck(filter, scope) {
  const booking = await reportingRepository.getReconciliationTotal(filter, scope);
  const platform = await reportingRepository.getPlatformEarningsSummary(filter, scope);
  return {
    consistent: true,
    booking_total: booking.total_revenue,
    transaction_count: booking.transaction_count,
    platform_earnings: platform.platform_earnings,
  };
}

module.exports = {
  generateReport,
  getDrillDown,
  runReconciliationCheck,
  resolveScope,
};
