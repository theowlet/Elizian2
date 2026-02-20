/**
 * Enterprise Analytics Service
 * Single entry for all dashboard data. Uses analyticsFilterEngine (no duplicate filter logic).
 * Partner: scope by partnerId. Admin: scope by optional partnerIds / tier.
 */

const analyticsRepository = require('../repositories/analyticsRepository');
const dashboardViewsRepository = require('../repositories/dashboardViewsRepository');
const { parseFilter } = require('./analyticsFilterEngine');

/**
 * Partner dashboard: all widgets for one partner.
 */
async function getPartnerDashboard(partnerId, query) {
  const filter = parseFilter(query, { isAdmin: false });
  const scope = { partnerId };
  const [
    revenueOverview,
    dealPerformance,
    timeSeriesTrend,
    weekdayHeatmap,
    customerSegmentation,
    categoryPerformance,
    revenueSplit,
    topCustomers,
    repeatRatio,
  ] = await Promise.all([
    analyticsRepository.getRevenueOverview(filter, scope),
    analyticsRepository.getDealPerformance(filter, scope),
    analyticsRepository.getTimeSeriesTrend(filter, scope, 'day'),
    analyticsRepository.getWeekdayHeatmap(filter, scope),
    analyticsRepository.getCustomerSegmentation(filter, scope),
    analyticsRepository.getCategoryPerformance(filter, scope),
    analyticsRepository.getRevenueSplit(filter, scope),
    analyticsRepository.getTopCustomers(filter, scope, 10),
    analyticsRepository.getRepeatCustomerRatio(filter, scope),
  ]);
  return {
    filter: { start_date: filter.start_date, end_date: filter.end_date, revenue_type: filter.revenue_type },
    widgets: {
      revenue_overview: revenueOverview,
      deal_performance: dealPerformance,
      time_series_trend: timeSeriesTrend,
      weekday_heatmap: weekdayHeatmap,
      customer_segmentation: customerSegmentation,
      category_performance: categoryPerformance,
      revenue_split: revenueSplit,
      top_customers: topCustomers,
      repeat_customer_ratio: repeatRatio,
    },
  };
}

/**
 * Single widget for partner (for dynamic loading).
 */
async function getPartnerWidget(partnerId, widgetKey, query) {
  const filter = parseFilter(query, { isAdmin: false });
  const scope = { partnerId };
  const widgets = {
    revenue_overview: () => analyticsRepository.getRevenueOverview(filter, scope),
    deal_performance: () => analyticsRepository.getDealPerformance(filter, scope),
    time_series_trend: () => analyticsRepository.getTimeSeriesTrend(filter, scope, query.group_by || 'day'),
    weekday_heatmap: () => analyticsRepository.getWeekdayHeatmap(filter, scope),
    customer_segmentation: () => analyticsRepository.getCustomerSegmentation(filter, scope),
    category_performance: () => analyticsRepository.getCategoryPerformance(filter, scope),
    revenue_split: () => analyticsRepository.getRevenueSplit(filter, scope),
    top_customers: () => analyticsRepository.getTopCustomers(filter, scope, 20),
    repeat_customer_ratio: () => analyticsRepository.getRepeatCustomerRatio(filter, scope),
  };
  const fn = widgets[widgetKey];
  if (!fn) return null;
  return fn();
}

/**
 * Admin dashboard: system-wide or filtered by partner(s) / tier.
 */
async function getAdminDashboard(query) {
  const filter = parseFilter(query, { isAdmin: true });
  const scope = filter.partner_id && filter.partner_id.length > 0 ? { partnerIds: filter.partner_id } : {};
  const [
    revenueOverview,
    dealPerformance,
    timeSeriesTrend,
    weekdayHeatmap,
    categoryPerformance,
    revenueSplit,
    partnerComparison,
    topCustomers,
    repeatRatio,
  ] = await Promise.all([
    analyticsRepository.getRevenueOverview(filter, scope),
    analyticsRepository.getDealPerformance(filter, scope),
    analyticsRepository.getTimeSeriesTrend(filter, scope, 'day'),
    analyticsRepository.getWeekdayHeatmap(filter, scope),
    analyticsRepository.getCategoryPerformance(filter, scope),
    analyticsRepository.getRevenueSplit(filter, scope),
    analyticsRepository.getPartnerComparison(filter, scope),
    analyticsRepository.getTopCustomers(filter, scope, 20),
    analyticsRepository.getRepeatCustomerRatio(filter, scope),
  ]);
  return {
    filter: {
      start_date: filter.start_date,
      end_date: filter.end_date,
      revenue_type: filter.revenue_type,
      partner_id: filter.partner_id,
      tier_id: filter.tier_id,
    },
    widgets: {
      revenue_overview: revenueOverview,
      deal_performance: dealPerformance,
      time_series_trend: timeSeriesTrend,
      weekday_heatmap: weekdayHeatmap,
      category_performance: categoryPerformance,
      revenue_split: revenueSplit,
      partner_comparison: partnerComparison,
      top_customers: topCustomers,
      repeat_customer_ratio: repeatRatio,
    },
  };
}

/**
 * Drill-down: list records for current filter; optional deal_id, weekday.
 */
async function getPartnerDrillDown(partnerId, query, options = {}) {
  const filter = parseFilter(query, { isAdmin: false });
  return analyticsRepository.getDrillDownRecords(filter, { partnerId }, options);
}

async function getAdminDrillDown(query, options = {}) {
  const filter = parseFilter(query, { isAdmin: true });
  const scope = filter.partner_id && filter.partner_id.length > 0 ? { partnerIds: filter.partner_id } : {};
  return analyticsRepository.getDrillDownRecords(filter, scope, options);
}

/**
 * Saved views (partner or admin).
 */
async function listSavedViews(userId, role) {
  return dashboardViewsRepository.listByUser(userId, role);
}

async function saveView(userId, role, viewName, filterJson, isDefault = false) {
  return dashboardViewsRepository.create(userId, role, viewName, filterJson, isDefault);
}

async function getSavedView(viewId, userId) {
  return dashboardViewsRepository.getById(viewId, userId);
}

async function setDefaultView(userId, role, viewId) {
  return dashboardViewsRepository.setDefault(userId, role, viewId);
}

async function deleteSavedView(viewId, userId) {
  return dashboardViewsRepository.deleteView(viewId, userId);
}

module.exports = {
  getPartnerDashboard,
  getPartnerWidget,
  getAdminDashboard,
  getPartnerDrillDown,
  getAdminDrillDown,
  listSavedViews,
  saveView,
  getSavedView,
  setDefaultView,
  deleteSavedView,
  parseFilter,
};
