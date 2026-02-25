/**
 * Enterprise Reporting Repository
 * All report queries derive from canonical tables (bookings, partners, partner_offers, platform_earnings_ledger).
 * No duplicate revenue storage. Filter-driven via analyticsFilterEngine.
 */

const { getPool } = require('../config/db');
const { buildWhereFromFilter, revenueSelect } = require('../services/analyticsFilterEngine');

const pool = getPool();

function baseJoin(scope) {
  return `
    FROM bookings b
    INNER JOIN partners p ON p.id = b.partner_id
    LEFT JOIN partner_offers po ON po.id = b.deal_id
    LEFT JOIN redemption_audit ra ON ra.booking_id = b.id AND ra.redemption_status = 'redeemed'
    LEFT JOIN categories c ON c.id = p.category_id
  `;
}

function applyFilter(filter, scope) {
  const { whereClauses, params, paramIndex } = buildWhereFromFilter(filter, scope);
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params, paramIndex };
}

/** Partner: deal-level report with optional platform fee (from platform_earnings_ledger if exists). */
async function getPartnerDealReport(filter, scope, options = {}) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const limit = Math.min(Number(options.limit) || 100, 500);
  const sql = `
    SELECT
      po.id AS deal_id,
      po.title AS deal_title,
      po.service_type,
      COUNT(*)::int AS redemptions,
      SUM(${revCol})::numeric AS revenue,
      COUNT(DISTINCT b.user_id)::int AS unique_customers
    ${baseJoin(scope)}
    ${whereSql}
    AND b.deal_id IS NOT NULL
    GROUP BY po.id, po.title, po.service_type
    ORDER BY revenue DESC
    LIMIT $${params.length + 1}
  `;
  const result = await pool.query(sql, [...params, limit]);
  const rows = result.rows.map((r) => ({
    deal_id: r.deal_id,
    deal_title: r.deal_title,
    service_type: r.service_type,
    redemptions: parseInt(r.redemptions || 0, 10),
    revenue: parseFloat(r.revenue || 0),
    unique_customers: parseInt(r.unique_customers || 0, 10),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql} AND b.deal_id IS NOT NULL`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return { rows, grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) } };
}

/** Partner: customer-level report. */
async function getPartnerCustomerReport(filter, scope, options = {}) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const limit = Math.min(Number(options.limit) || 100, 500);
  const sql = `
    SELECT
      b.user_id,
      MAX(u.first_name || ' ' || COALESCE(u.last_name, '')) AS customer_name,
      COUNT(*)::int AS total_visits,
      SUM(${revCol})::numeric AS total_spend,
      MAX(b.created_at) AS last_visit,
      AVG(${revCol})::numeric AS avg_bill_value
    ${baseJoin(scope)}
    LEFT JOIN users u ON u.id = b.user_id
    ${whereSql}
    GROUP BY b.user_id
    ORDER BY total_spend DESC
    LIMIT $${params.length + 1}
  `;
  const result = await pool.query(sql, [...params, limit]);
  const rows = result.rows.map((r) => ({
    user_id: r.user_id,
    customer_name: (r.customer_name || 'Guest').trim(),
    total_visits: parseInt(r.total_visits || 0, 10),
    total_spend: parseFloat(r.total_spend || 0),
    last_visit: r.last_visit,
    avg_bill_value: parseFloat(r.avg_bill_value || 0),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(DISTINCT b.user_id)::int AS unique_customers, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql}`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return { rows, grand_total: { unique_customers: parseInt(gt.unique_customers || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) } };
}

/** Partner: hour-of-day (time-of-day) report for heatmap. */
async function getPartnerHourReport(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      EXTRACT(HOUR FROM b.created_at)::int AS hour,
      COUNT(*)::int AS redemptions,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    GROUP BY EXTRACT(HOUR FROM b.created_at)
    ORDER BY hour
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    hour: parseInt(r.hour, 10),
    redemptions: parseInt(r.redemptions || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql}`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return { rows, grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) } };
}

/** Partner: weekday-level report. */
async function getPartnerWeekdayReport(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      EXTRACT(DOW FROM b.created_at)::int AS weekday,
      COUNT(*)::int AS redemptions,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    GROUP BY EXTRACT(DOW FROM b.created_at)
    ORDER BY weekday
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    weekday: parseInt(r.weekday, 10),
    redemptions: parseInt(r.redemptions || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql}`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return { rows, grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) } };
}

/** Raw redemption records for drill-down (bookings as canonical). */
async function getDrillDownRecords(filter, scope, options = {}) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  let extra = '';
  const p = [...params];
  let idx = params.length + 1;
  if (options.deal_id) {
    extra += ` AND b.deal_id = $${idx}`;
    p.push(options.deal_id);
    idx++;
  }
  if (options.weekday != null) {
    extra += ` AND EXTRACT(DOW FROM b.created_at) = $${idx}`;
    p.push(options.weekday);
    idx++;
  }
  if (options.partner_id) {
    extra += ` AND b.partner_id = $${idx}`;
    p.push(options.partner_id);
    idx++;
  }
  const limit = Math.min(Number(options.limit) || 100, 500);
  const offset = Math.max(0, Number(options.offset) || 0);
  const sql = `
    SELECT b.id, b.booking_reference, b.created_at, b.fiat_amount, b.ezt_redeemed,
      ${revCol} AS revenue, b.user_id, b.deal_id, b.partner_id,
      po.title AS deal_title, p.name AS partner_name
    ${baseJoin(scope)}
    ${whereSql}
    ${extra}
    ORDER BY b.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}
  `;
  p.push(limit, offset);
  const result = await pool.query(sql, p);
  const rows = result.rows.map((r) => ({
    id: r.id,
    booking_reference: r.booking_reference,
    created_at: r.created_at,
    fiat_amount: parseFloat(r.fiat_amount || 0),
    ezt_redeemed: parseFloat(r.ezt_redeemed || 0),
    revenue: parseFloat(r.revenue || 0),
    user_id: r.user_id,
    deal_id: r.deal_id,
    partner_id: r.partner_id,
    deal_title: r.deal_title,
    partner_name: r.partner_name,
  }));
  return rows;
}

/** Admin: partner performance grid. */
async function getAdminPartnerPerformanceGrid(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      b.partner_id,
      MAX(p.name) AS partner_name,
      MAX(pt.name) AS tier_name,
      p.tier_id,
      COUNT(*)::int AS total_redemptions,
      COUNT(DISTINCT b.user_id)::int AS unique_customers,
      SUM(${revCol})::numeric AS total_revenue,
      AVG(${revCol})::numeric AS avg_bill_value
    ${baseJoin(scope)}
    LEFT JOIN partner_tiers pt ON pt.id = p.tier_id
    ${whereSql}
    GROUP BY b.partner_id, p.name, p.tier_id, pt.name
    ORDER BY total_revenue DESC
    LIMIT 200
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    partner_id: r.partner_id,
    partner_name: r.partner_name,
    tier_id: r.tier_id,
    tier_name: r.tier_name,
    total_redemptions: parseInt(r.total_redemptions || 0, 10),
    unique_customers: parseInt(r.unique_customers || 0, 10),
    total_revenue: parseFloat(r.total_revenue || 0),
    avg_bill_value: parseFloat(r.avg_bill_value || 0),
  }));
  const repeatSql = `
    WITH counts AS (
      SELECT b.partner_id, b.user_id, COUNT(*) AS cnt
      ${baseJoin(scope)}
      ${whereSql}
      GROUP BY b.partner_id, b.user_id
    ),
    partner_repeat AS (
      SELECT partner_id, COUNT(*) FILTER (WHERE cnt > 1)::int AS repeat_customers, COUNT(*)::int AS total_customers
      FROM counts GROUP BY partner_id
    )
    SELECT b.partner_id, pr.repeat_customers, pr.total_customers
    FROM (SELECT DISTINCT partner_id FROM counts) b
    JOIN partner_repeat pr ON pr.partner_id = b.partner_id
  `;
  let repeatMap = {};
  try {
    const repeatResult = await pool.query(repeatSql, params);
    repeatMap = repeatResult.rows.reduce((acc, r) => {
      acc[r.partner_id] = {
        repeat_customers: parseInt(r.repeat_customers || 0, 10),
        total_customers: parseInt(r.total_customers || 0, 10),
        repeat_ratio: r.total_customers ? Math.round((r.repeat_customers / r.total_customers) * 10000) / 100 : 0,
      };
      return acc;
    }, {});
  } catch (_) {}
  rows.forEach((r) => {
    const rep = repeatMap[r.partner_id];
    r.repeat_customers = rep ? rep.repeat_customers : 0;
    r.repeat_ratio = rep ? rep.repeat_ratio : 0;
  });
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql}`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return {
    rows,
    grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) },
  };
}

/** Admin: tier-level performance. */
async function getAdminTierPerformance(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      p.tier_id,
      MAX(pt.name) AS tier_name,
      COUNT(*)::int AS redemptions,
      COUNT(DISTINCT b.partner_id)::int AS partner_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    LEFT JOIN partner_tiers pt ON pt.id = p.tier_id
    ${whereSql}
    AND p.tier_id IS NOT NULL
    GROUP BY p.tier_id
    ORDER BY revenue DESC
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    tier_id: r.tier_id,
    tier_name: r.tier_name,
    redemptions: parseInt(r.redemptions || 0, 10),
    partner_count: parseInt(r.partner_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql}`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return {
    rows,
    grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) },
  };
}

/** Admin: revenue concentration (top 20% partners → % of revenue). */
async function getAdminRevenueConcentration(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    WITH partner_rev AS (
      SELECT b.partner_id, SUM(${revCol})::numeric AS revenue
      ${baseJoin(scope)}
      ${whereSql}
      GROUP BY b.partner_id
    ),
    totals AS (
      SELECT SUM(revenue)::numeric AS total, COUNT(*)::int AS partner_count FROM partner_rev
    ),
    ranked AS (
      SELECT partner_id, revenue, SUM(revenue) OVER (ORDER BY revenue DESC) AS cum_revenue
      FROM partner_rev
    )
    SELECT t.total, t.partner_count,
      (SELECT MIN(cum_revenue) FROM ranked r, totals t2 WHERE r.cum_revenue >= t2.total * 0.2 LIMIT 1) AS top20_cum
    FROM totals t
  `;
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  const total = parseFloat(row.total || 0);
  const top20Cum = parseFloat(row.top20_cum || 0);
  return {
    total_revenue: total,
    partner_count: parseInt(row.partner_count || 0, 10),
    top_20_percent_revenue: top20Cum,
    top_20_percent_share: total ? Math.round((top20Cum / total) * 10000) / 100 : 0,
  };
}

/** Admin: cross-partner deal comparison (by service_type / category). */
async function getAdminCrossPartnerDealComparison(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      COALESCE(po.service_type, 'unknown') AS service_type,
      COUNT(*)::int AS redemptions,
      COUNT(DISTINCT b.partner_id)::int AS partner_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    AND b.deal_id IS NOT NULL
    GROUP BY COALESCE(po.service_type, 'unknown')
    ORDER BY revenue DESC
    LIMIT 50
  `;
  const result = await pool.query(sql, params);
  const rows = result.rows.map((r) => ({
    service_type: r.service_type,
    redemptions: parseInt(r.redemptions || 0, 10),
    partner_count: parseInt(r.partner_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
  const grandResult = await pool.query(
    `SELECT COUNT(*)::int AS total_redemptions, SUM(${revCol})::numeric AS total_revenue ${baseJoin(scope)} ${whereSql} AND b.deal_id IS NOT NULL`,
    params
  );
  const gt = grandResult.rows[0] || {};
  return {
    rows,
    grand_total: { total_redemptions: parseInt(gt.total_redemptions || 0, 10), total_revenue: parseFloat(gt.total_revenue || 0) },
  };
}

/** Admin: customer mobility (users redeeming at multiple partners). */
async function getAdminCustomerMobility(filter, scope, options = {}) {
  const { whereSql, params } = applyFilter(filter, scope);
  const limit = Math.min(Number(options.limit) || 50, 200);
  const sql = `
    WITH user_partners AS (
      SELECT b.user_id, COUNT(DISTINCT b.partner_id)::int AS partner_count
      ${baseJoin(scope)}
      ${whereSql}
      GROUP BY b.user_id
      HAVING COUNT(DISTINCT b.partner_id) > 1
    )
    SELECT partner_count, COUNT(*)::int AS user_count
    FROM user_partners
    GROUP BY partner_count
    ORDER BY partner_count DESC
    LIMIT $${params.length + 1}
  `;
  const result = await pool.query(sql, [...params, limit]);
  const rows = result.rows.map((r) => ({
    partner_count: parseInt(r.partner_count, 10),
    user_count: parseInt(r.user_count || 0, 10),
  }));
  return { rows };
}

/** Platform earnings summary for a scope (when platform_earnings_ledger exists). */
async function getPlatformEarningsSummary(filter, scope) {
  const clauses = [];
  const params = [];
  let idx = 1;
  if (filter.start_date) {
    clauses.push(`pel.created_at >= $${idx}::date`);
    params.push(filter.start_date);
    idx++;
  }
  if (filter.end_date) {
    clauses.push(`pel.created_at < ($${idx}::date + interval '1 day')`);
    params.push(filter.end_date);
    idx++;
  }
  if (scope.partnerId) {
    clauses.push(`pel.partner_id = $${idx}`);
    params.push(scope.partnerId);
    idx++;
  }
  if (scope.partnerIds && scope.partnerIds.length > 0) {
    clauses.push(`pel.partner_id = ANY($${idx}::uuid[])`);
    params.push(scope.partnerIds);
    idx++;
  }
  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  try {
    const sql = `
      SELECT SUM(pel.platform_fee_total)::numeric AS platform_earnings
      FROM platform_earnings_ledger pel
      ${whereSql}
    `;
    const result = await pool.query(sql, params);
    const row = result.rows[0] || {};
    return { platform_earnings: parseFloat(row.platform_earnings || 0) };
  } catch (_) {
    return { platform_earnings: 0 };
  }
}

/** Reconciliation: SUM(bookings revenue) for filter scope. */
async function getReconciliationTotal(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `SELECT COUNT(*)::int AS cnt, SUM(${revCol})::numeric AS total ${baseJoin(scope)} ${whereSql}`;
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  return { transaction_count: parseInt(row.cnt || 0, 10), total_revenue: parseFloat(row.total || 0) };
}

module.exports = {
  getPartnerDealReport,
  getPartnerCustomerReport,
  getPartnerHourReport,
  getPartnerWeekdayReport,
  getDrillDownRecords,
  getAdminPartnerPerformanceGrid,
  getAdminTierPerformance,
  getAdminCrossPartnerDealComparison,
  getAdminRevenueConcentration,
  getAdminCustomerMobility,
  getPlatformEarningsSummary,
  getReconciliationTotal,
  applyFilter,
  baseJoin,
};
