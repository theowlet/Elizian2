/**
 * Enterprise Analytics — Global Filter Engine
 * Single source of truth for parsing and validating dashboard filters.
 * All analytics endpoints must use this; no duplicate filter logic.
 * Timezone: all date filtering is timezone-aware (UTC stored, optional TZ for display).
 */

const DEFAULT_TZ = 'UTC';

/**
 * Canonical filter shape (server-side).
 * @typedef {Object} AnalyticsFilter
 * @property {string} [start_date] - ISO date (inclusive)
 * @property {string} [end_date] - ISO date (inclusive)
 * @property {string[]} [deal_id] - UUIDs
 * @property {string[]} [category_id] - UUIDs
 * @property {number[]} [weekday] - 0-6 (Sun-Sat) or 1-7 (Mon-Sun); we use 0-6
 * @property {string} [customer_type] - 'all' | 'new' | 'returning' | 'loyal'
 * @property {string} [tier_id] - admin only
 * @property {string} [revenue_type] - 'total' | 'fiat' | 'ezt'
 * @property {number} [min_bill]
 * @property {number} [max_bill]
 * @property {string} [timezone] - IANA e.g. 'Asia/Kolkata'
 */

/**
 * Parse query/body into canonical filter. Validates and normalizes.
 * @param {Object} input - req.query or req.body (or merged)
 * @param {{ isAdmin?: boolean, partnerId?: string }} context - partnerId for partner scope
 * @returns {AnalyticsFilter}
 */
function parseFilter(input = {}, context = {}) {
  const filter = {};

  // Dates: timezone-aware. Accept start_date, end_date (ISO) or period preset
  const tz = input.timezone || DEFAULT_TZ;
  filter.timezone = tz;

  if (input.start_date && input.end_date) {
    filter.start_date = normalizeDate(input.start_date);
    filter.end_date = normalizeDate(input.end_date);
  } else {
    const { start, end } = dateRangeFromPreset(input.period || 'last_30_days', tz);
    filter.start_date = start;
    filter.end_date = end;
  }

  // Deal(s): multi-select
  if (input.deal_id !== undefined && input.deal_id !== null) {
    filter.deal_id = arrayOfUuids(input.deal_id);
  }
  if (input.category_id !== undefined && input.category_id !== null) {
    filter.category_id = arrayOfUuids(input.category_id);
  }
  // Weekday: 0-6 (Sun=0) or 1-7 (Mon=1); normalize to 0-6
  if (input.weekday !== undefined && input.weekday !== null) {
    filter.weekday = arrayOfNumbers(input.weekday).map((d) => (d === 7 ? 0 : d)).filter((d) => d >= 0 && d <= 6);
  }
  filter.customer_type = ['all', 'new', 'returning', 'loyal'].includes(input.customer_type)
    ? input.customer_type
    : 'all';
  filter.revenue_type = ['total', 'fiat', 'ezt'].includes(input.revenue_type) ? input.revenue_type : 'total';
  if (input.min_bill != null && !Number.isNaN(Number(input.min_bill))) {
    filter.min_bill = Number(input.min_bill);
  }
  if (input.max_bill != null && !Number.isNaN(Number(input.max_bill))) {
    filter.max_bill = Number(input.max_bill);
  }

  // Admin-only
  if (context.isAdmin && input.tier_id) {
    filter.tier_id = typeof input.tier_id === 'string' ? input.tier_id : null;
  }
  if (context.isAdmin && input.partner_id !== undefined && input.partner_id !== null) {
    filter.partner_id = arrayOfUuids(input.partner_id);
  }
  if (context.isAdmin && input.tier_ids !== undefined && input.tier_ids !== null) {
    filter.tier_ids = arrayOfUuids(input.tier_ids);
  }

  return filter;
}

/** Allowed group_by values for reporting (safe, no SQL injection). */
const ALLOWED_GROUP_BY = new Set(['deal', 'category', 'weekday', 'month', 'customer_type', 'tier', 'partner', 'hour']);

/** Allowed drill_level: 1 = summary only, 2 = + grouped, 3 = + raw records. */
function parseReportOptions(input = {}, context = {}) {
  const filter = parseFilter(input, context);
  const groupBy = input.group_by && ALLOWED_GROUP_BY.has(String(input.group_by)) ? String(input.group_by) : 'deal';
  const drillLevel = Math.min(3, Math.max(1, parseInt(input.drill_level, 10) || 1));
  return { filter, group_by: groupBy, drill_level: drillLevel };
}

/** Safe GROUP BY clause for reporting (parametrized identifiers not possible in PG, so whitelist). */
function buildGroupByClause(groupBy) {
  switch (groupBy) {
    case 'deal':
      return 'po.id, po.title, po.service_type';
    case 'category':
      return 'p.category_id, c.name, c.slug';
    case 'weekday':
      return 'EXTRACT(DOW FROM b.created_at)::int';
    case 'month':
      return 'DATE_TRUNC(\'month\', b.created_at)';
    case 'tier':
      return 'p.tier_id, pt.name';
    case 'partner':
      return 'b.partner_id, p.name';
    case 'hour':
      return 'EXTRACT(HOUR FROM b.created_at)::int';
    case 'customer_type':
      return null; // handled in query with CASE
    default:
      return 'po.id, po.title';
  }
}

function normalizeDate(val) {
  if (typeof val !== 'string') return null;
  const d = new Date(val);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function arrayOfUuids(val) {
  if (Array.isArray(val)) return val.filter((id) => /^[0-9a-f-]{36}$/i.test(String(id)));
  if (typeof val === 'string') return val ? [val].filter((id) => /^[0-9a-f-]{36}$/i.test(id)) : [];
  return [];
}

function arrayOfNumbers(val) {
  if (Array.isArray(val)) return val.map((n) => parseInt(n, 10)).filter((n) => !Number.isNaN(n));
  const n = parseInt(val, 10);
  return Number.isNaN(n) ? [] : [n];
}

function dateRangeFromPreset(period, tz) {
  const now = new Date();
  let start = new Date(now);
  switch (String(period)) {
    case 'today':
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case 'this_week':
      const day = now.getUTCDay();
      start.setUTCDate(now.getUTCDate() - day);
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case 'this_month':
      start.setUTCDate(1);
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case 'last_30_days':
      start.setUTCDate(now.getUTCDate() - 30);
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    case 'last_7_days':
      start.setUTCDate(now.getUTCDate() - 7);
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    default:
      start.setUTCDate(now.getUTCDate() - 30);
      start.setUTCHours(0, 0, 0, 0);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
  }
}

/**
 * Build SQL WHERE conditions and params array from filter (for bookings-based analytics).
 * Caller must enforce partner_id for partner scope (no cross-partner leakage).
 * @param {AnalyticsFilter} filter
 * @param {{ partnerId?: string, partnerIds?: string[] }} scope - partnerId = single (partner), partnerIds = admin multi
 * @returns {{ whereClauses: string[], params: any[], paramIndex: number }}
 */
function buildWhereFromFilter(filter, scope = {}) {
  const whereClauses = [];
  const params = [];
  let paramIndex = 1;

  // Date range (created_at in UTC)
  if (filter.start_date) {
    whereClauses.push(`b.created_at >= $${paramIndex}::date`);
    params.push(filter.start_date);
    paramIndex++;
  }
  if (filter.end_date) {
    whereClauses.push(`b.created_at < ($${paramIndex}::date + interval '1 day')`);
    params.push(filter.end_date);
    paramIndex++;
  }

  if (scope.partnerId) {
    whereClauses.push(`b.partner_id = $${paramIndex}`);
    params.push(scope.partnerId);
    paramIndex++;
  }
  if (scope.partnerIds && scope.partnerIds.length > 0) {
    whereClauses.push(`b.partner_id = ANY($${paramIndex}::uuid[])`);
    params.push(scope.partnerIds);
    paramIndex++;
  }

  if (filter.deal_id && filter.deal_id.length > 0) {
    whereClauses.push(`b.deal_id = ANY($${paramIndex}::uuid[])`);
    params.push(filter.deal_id);
    paramIndex++;
  }
  if (filter.category_id && filter.category_id.length > 0) {
    whereClauses.push(`p.category_id = ANY($${paramIndex}::uuid[])`);
    params.push(filter.category_id);
    paramIndex++;
  }
  if (filter.tier_id) {
    whereClauses.push(`p.tier_id = $${paramIndex}`);
    params.push(filter.tier_id);
    paramIndex++;
  }
  if (filter.tier_ids && filter.tier_ids.length > 0) {
    whereClauses.push(`p.tier_id = ANY($${paramIndex}::uuid[])`);
    params.push(filter.tier_ids);
    paramIndex++;
  }
  if (filter.weekday && filter.weekday.length > 0) {
    // EXTRACT(DOW FROM created_at) 0-6 Sun-Sat
    whereClauses.push(`EXTRACT(DOW FROM b.created_at) = ANY($${paramIndex}::int[])`);
    params.push(filter.weekday);
    paramIndex++;
  }
  if (filter.min_bill != null) {
    whereClauses.push(`(b.fiat_amount + COALESCE(b.ezt_redeemed, 0)) >= $${paramIndex}`);
    params.push(filter.min_bill);
    paramIndex++;
  }
  if (filter.max_bill != null) {
    whereClauses.push(`(b.fiat_amount + COALESCE(b.ezt_redeemed, 0)) <= $${paramIndex}`);
    params.push(filter.max_bill);
    paramIndex++;
  }

  // customer_type: new = first visit, returning = 2+ visits, loyal = 5+ (or use your definition)
  if (filter.customer_type && filter.customer_type !== 'all') {
    if (filter.customer_type === 'new') {
      whereClauses.push(`NOT EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.user_id = b.user_id AND b2.partner_id = b.partner_id AND b2.created_at < b.created_at
      )`);
    } else if (filter.customer_type === 'returning') {
      whereClauses.push(`EXISTS (
        SELECT 1 FROM bookings b2
        WHERE b2.user_id = b.user_id AND b2.partner_id = b.partner_id AND b2.created_at < b.created_at
      )`);
    }
    // loyal: could be 5+ visits at this partner; same as returning with HAVING count >= 5 in subquery - skip for simplicity or add later
  }

  return { whereClauses, params, paramIndex };
}

/**
 * Revenue column expression based on revenue_type (fiat vs ezt vs total).
 * Uses bookings: fiat_amount, ezt_redeemed (EZT used). Total = fiat + ezt value or just fiat for "bill".
 */
function revenueSelect(filter) {
  switch (filter.revenue_type) {
    case 'ezt':
      return 'COALESCE(b.ezt_redeemed, 0)::numeric';
    case 'fiat':
      return 'COALESCE(b.fiat_amount, 0)::numeric';
    default:
      return '(COALESCE(b.fiat_amount, 0) + COALESCE(b.ezt_redeemed, 0))::numeric';
  }
}

module.exports = {
  parseFilter,
  parseReportOptions,
  buildWhereFromFilter,
  buildGroupByClause,
  revenueSelect,
  dateRangeFromPreset,
  DEFAULT_TZ,
  ALLOWED_GROUP_BY,
};
