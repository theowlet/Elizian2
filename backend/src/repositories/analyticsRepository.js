/**
 * Enterprise Analytics Repository
 * All queries use canonical filter (analyticsFilterEngine); no duplicate filter logic.
 * Data from bookings (+ partners, partner_offers) only; no data duplication.
 * Partner scope: caller passes partnerId. Admin: passes partnerIds or none (all).
 */

const { getPool } = require('../config/db');
const { buildWhereFromFilter, revenueSelect } = require('../services/analyticsFilterEngine');

const pool = getPool();

function baseJoin(scope) {
  const hasPartner = scope.partnerId || (scope.partnerIds && scope.partnerIds.length > 0);
  return `
    FROM bookings b
    INNER JOIN partners p ON p.id = b.partner_id
    LEFT JOIN partner_offers po ON po.id = b.deal_id
    ${hasPartner ? '' : ''}
  `;
}

/**
 * Single partner or admin (partnerIds). Returns { whereClauses, params, paramIndex }.
 * For partner dashboard, scope = { partnerId }. For admin, scope = { partnerIds: [] } or {}.
 */
function applyFilter(filter, scope) {
  const { whereClauses, params, paramIndex } = buildWhereFromFilter(filter, scope);
  const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '';
  return { whereSql, params, paramIndex };
}

/**
 * Revenue overview: total revenue, count, avg, previous period comparison (optional).
 */
async function getRevenueOverview(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      COUNT(*)::int AS transaction_count,
      COUNT(DISTINCT b.user_id)::int AS unique_customers,
      SUM(${revCol})::numeric AS total_revenue,
      AVG(${revCol})::numeric AS avg_revenue
    ${baseJoin(scope)}
    ${whereSql}
  `;
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  return {
    transaction_count: parseInt(row.transaction_count || 0, 10),
    unique_customers: parseInt(row.unique_customers || 0, 10),
    total_revenue: parseFloat(row.total_revenue || 0),
    avg_revenue: parseFloat(row.avg_revenue || 0),
  };
}

/**
 * Deal performance table: per-deal revenue, count, avg.
 */
async function getDealPerformance(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      po.id AS deal_id,
      po.title AS deal_title,
      po.service_type,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    AND b.deal_id IS NOT NULL
    GROUP BY po.id, po.title, po.service_type
    ORDER BY revenue DESC
    LIMIT 50
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    deal_id: r.deal_id,
    deal_title: r.deal_title,
    service_type: r.service_type,
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Time-series trend: by day (or week/month via optional groupBy).
 */
async function getTimeSeriesTrend(filter, scope, groupBy = 'day') {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const dateTrunc = groupBy === 'week' ? 'week' : groupBy === 'month' ? 'month' : 'day';
  const sql = `
    SELECT
      DATE_TRUNC('${dateTrunc}', b.created_at) AS period,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    GROUP BY DATE_TRUNC('${dateTrunc}', b.created_at)
    ORDER BY period ASC
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    period: r.period,
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Weekday distribution (0-6 or 1-7 for display).
 */
async function getWeekdayHeatmap(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      EXTRACT(DOW FROM b.created_at)::int AS weekday,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    GROUP BY EXTRACT(DOW FROM b.created_at)
    ORDER BY weekday
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    weekday: parseInt(r.weekday, 10),
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Customer segmentation: new vs returning (within filtered period).
 */
async function getCustomerSegmentation(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    WITH first_visit AS (
      SELECT b.user_id, b.partner_id, MIN(b.created_at) AS first_at
      ${baseJoin(scope)}
      ${whereSql}
      GROUP BY b.user_id, b.partner_id
    )
    SELECT
      CASE WHEN b.created_at = fv.first_at THEN 'new' ELSE 'returning' END AS segment,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    INNER JOIN first_visit fv ON fv.user_id = b.user_id AND fv.partner_id = b.partner_id
    ${whereSql}
    GROUP BY CASE WHEN b.created_at = fv.first_at THEN 'new' ELSE 'returning' END
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    segment: r.segment,
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Category performance (by partners.category_id).
 */
async function getCategoryPerformance(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      p.category_id,
      c.name AS category_name,
      c.slug AS category_slug,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    LEFT JOIN categories c ON c.id = p.category_id
    ${whereSql}
    GROUP BY p.category_id, c.name, c.slug
    ORDER BY revenue DESC
    LIMIT 20
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    category_id: r.category_id,
    category_name: r.category_name,
    category_slug: r.category_slug,
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Revenue split: fiat vs ezt (sums).
 */
async function getRevenueSplit(filter, scope) {
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      SUM(COALESCE(b.fiat_amount, 0))::numeric AS fiat_total,
      SUM(COALESCE(b.ezt_redeemed, 0))::numeric AS ezt_total
    ${baseJoin(scope)}
    ${whereSql}
  `;
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  return {
    fiat: parseFloat(row.fiat_total || 0),
    ezt: parseFloat(row.ezt_total || 0),
    total: parseFloat(row.fiat_total || 0) + parseFloat(row.ezt_total || 0),
  };
}

/**
 * Top customers by revenue (filtered).
 */
async function getTopCustomers(filter, scope, limit = 10) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      b.user_id,
      MAX(u.first_name || ' ' || COALESCE(u.last_name, '')) AS customer_name,
      COUNT(*)::int AS transaction_count,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    LEFT JOIN users u ON u.id = b.user_id
    ${whereSql}
    GROUP BY b.user_id
    ORDER BY revenue DESC
    LIMIT $${params.length + 1}
  `;
  const result = await pool.query(sql, [...params, limit]);
  return result.rows.map((r) => ({
    user_id: r.user_id,
    customer_name: (r.customer_name || 'Guest').trim(),
    transaction_count: parseInt(r.transaction_count || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

/**
 * Repeat customer ratio (filtered set).
 */
async function getRepeatCustomerRatio(filter, scope) {
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    WITH counts AS (
      SELECT b.user_id, COUNT(*)::int AS cnt
      ${baseJoin(scope)}
      ${whereSql}
      GROUP BY b.user_id
    )
    SELECT
      COUNT(*)::int AS total_customers,
      COUNT(*) FILTER (WHERE cnt > 1)::int AS repeat_customers
    FROM counts
  `;
  const result = await pool.query(sql, params);
  const row = result.rows[0] || {};
  const total = parseInt(row.total_customers || 0, 10);
  const repeat = parseInt(row.repeat_customers || 0, 10);
  return {
    total_customers: total,
    repeat_customers: repeat,
    repeat_ratio: total ? Math.round((repeat / total) * 10000) / 100 : 0,
  };
}

/**
 * Drill-down: raw records (bookings) for current filter; optional extra filter (e.g. deal_id, weekday).
 */
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
  const maxLimit = options.export ? 5000 : 500;
  const limit = Math.min(Number(options.limit) || 100, maxLimit);
  const sql = `
    SELECT
      b.id, b.booking_reference, b.created_at, b.fiat_amount, b.ezt_redeemed,
      ${revCol} AS revenue,
      b.user_id, b.deal_id, b.partner_id,
      po.title AS deal_title,
      p.name AS partner_name
    ${baseJoin(scope)}
    ${whereSql}
    ${extra}
    ORDER BY b.created_at DESC
    LIMIT $${idx}
  `;
  p.push(limit);
  const result = await pool.query(sql, p);
  return result.rows.map((r) => ({
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
}

/**
 * Admin: partner comparison grid (revenue, count, repeat ratio per partner).
 */
async function getPartnerComparison(filter, scope) {
  const revCol = revenueSelect(filter);
  const { whereSql, params } = applyFilter(filter, scope);
  const sql = `
    SELECT
      b.partner_id,
      MAX(p.name) AS partner_name,
      COUNT(*)::int AS transaction_count,
      COUNT(DISTINCT b.user_id)::int AS unique_customers,
      SUM(${revCol})::numeric AS revenue
    ${baseJoin(scope)}
    ${whereSql}
    GROUP BY b.partner_id
    ORDER BY revenue DESC
    LIMIT 100
  `;
  const result = await pool.query(sql, params);
  return result.rows.map((r) => ({
    partner_id: r.partner_id,
    partner_name: r.partner_name,
    transaction_count: parseInt(r.transaction_count || 0, 10),
    unique_customers: parseInt(r.unique_customers || 0, 10),
    revenue: parseFloat(r.revenue || 0),
  }));
}

module.exports = {
  getRevenueOverview,
  getDealPerformance,
  getTimeSeriesTrend,
  getWeekdayHeatmap,
  getCustomerSegmentation,
  getCategoryPerformance,
  getRevenueSplit,
  getTopCustomers,
  getRepeatCustomerRatio,
  getDrillDownRecords,
  getPartnerComparison,
  applyFilter,
};
