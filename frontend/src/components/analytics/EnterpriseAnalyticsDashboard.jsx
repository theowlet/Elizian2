/**
 * Enterprise Analytics Dashboard — filter-driven, widgets, saved views, export, drill-down.
 * Use from Admin or Partner with role and optional partnerId.
 */

import React, { useState, useEffect, useCallback } from 'react';
import AnalyticsFilterBar from './AnalyticsFilterBar';
import './analyticsDashboard.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

function buildQuery(filter) {
  const q = new URLSearchParams();
  if (filter.period) q.set('period', filter.period);
  if (filter.start_date) q.set('start_date', filter.start_date);
  if (filter.end_date) q.set('end_date', filter.end_date);
  if (filter.revenue_type) q.set('revenue_type', filter.revenue_type);
  if (filter.customer_type) q.set('customer_type', filter.customer_type);
  if (filter.weekday && filter.weekday.length) filter.weekday.forEach((d) => q.append('weekday', d));
  if (filter.deal_id && filter.deal_id.length) filter.deal_id.forEach((id) => q.append('deal_id', id));
  if (filter.category_id && filter.category_id.length) filter.category_id.forEach((id) => q.append('category_id', id));
  if (filter.tier_id) q.set('tier_id', filter.tier_id);
  if (filter.partner_id && filter.partner_id.length) filter.partner_id.forEach((id) => q.append('partner_id', id));
  return q.toString();
}

export default function EnterpriseAnalyticsDashboard({
  authHeaders,
  role,
  partnerId,
  dealOptions = [],
  categoryOptions = [],
  tierOptions = [],
  partnerOptions = [],
}) {
  const [filter, setFilter] = useState({
    period: 'last_30_days',
    revenue_type: 'total',
    customer_type: 'all',
  });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [savedViews, setSavedViews] = useState([]);
  const [drillDown, setDrillDown] = useState(null);
  const [drillDownLoading, setDrillDownLoading] = useState(false);

  const isAdmin = role === 'admin';
  const baseUrl = isAdmin
    ? `${API_BASE}/api/v1/admin/analytics`
    : `${API_BASE}/api/v1/partners/${partnerId}/analytics`;

  const fetchDashboard = useCallback(async () => {
    if (!authHeaders || (!isAdmin && !partnerId)) return;
    setLoading(true);
    setError(null);
    try {
      const q = buildQuery(filter);
      const res = await fetch(`${baseUrl}/dashboard?${q}`, { headers: authHeaders() });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.message || json.error || `Failed to load dashboard (${res.status})`);
      setData(json.data);
    } catch (e) {
      const isNetworkError = e.message === 'Failed to fetch' || e.name === 'TypeError';
      const base = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';
      const msg = isNetworkError
        ? `Cannot reach the server. The app is calling ${base}. Start the backend on that port (e.g. in backend folder run: PORT=4000 npm start) and ensure VITE_API_BASE_URL in frontend .env matches.`
        : e.message;
      setError(msg);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [baseUrl, filter, authHeaders, isAdmin, partnerId]);

  const fetchSavedViews = useCallback(async () => {
    if (!authHeaders) return;
    try {
      const res = await fetch(`${baseUrl}/views`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && json.data) setSavedViews(json.data);
    } catch (_) {}
  }, [baseUrl, authHeaders]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  useEffect(() => {
    fetchSavedViews();
  }, [fetchSavedViews]);

  const handleSaveView = async () => {
    const name = window.prompt('View name');
    if (!name) return;
    try {
      await fetch(`${baseUrl}/views`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ view_name: name, filter_json: filter, is_default: false }),
      });
      fetchSavedViews();
    } catch (_) {}
  };

  const handleLoadView = async (viewId) => {
    if (!viewId) return;
    try {
      const res = await fetch(`${baseUrl}/views/${viewId}`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && json.data && json.data.filter_json) setFilter((f) => ({ ...f, ...json.data.filter_json }));
    } catch (_) {}
  };

  const handleExportCsv = async () => {
    const q = buildQuery(filter);
    try {
      const res = await fetch(`${baseUrl}/export/csv?${q}`, { headers: authHeaders() });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'analytics-export.csv';
      a.click();
      URL.revokeObjectURL(url);
    } catch (_) {}
  };

  const handleDrillDown = async (options) => {
    setDrillDownLoading(true);
    setDrillDown(null);
    try {
      const q = buildQuery(filter);
      const extra = new URLSearchParams();
      if (options.deal_id) extra.set('deal_id', options.deal_id);
      if (options.weekday != null) extra.set('weekday', options.weekday);
      const res = await fetch(`${baseUrl}/drill-down?${q}&${extra}`, { headers: authHeaders() });
      const json = await res.json();
      if (res.ok && json.data) setDrillDown(json.data);
    } catch (_) {
      setDrillDown([]);
    } finally {
      setDrillDownLoading(false);
    }
  };

  if (error) {
    return (
      <div className="analytics-dashboard">
        <div className="analytics-widget" style={{ color: '#f87171', maxWidth: 480 }}>
          <h3 style={{ margin: '0 0 8px' }}>Unable to load analytics</h3>
          <p style={{ margin: 0, fontSize: '0.9rem' }}>{error}</p>
        </div>
      </div>
    );
  }

  const widgets = data?.widgets || {};
  const w = (key) => widgets[key];

  return (
    <div className="analytics-dashboard">
      <AnalyticsFilterBar
        filter={filter}
        onFilterChange={setFilter}
        isAdmin={isAdmin}
        dealOptions={dealOptions}
        categoryOptions={categoryOptions}
        tierOptions={tierOptions}
        partnerOptions={partnerOptions}
      />

      <div className="analytics-toolbar">
        <div className="saved-views">
          <select
            value=""
            onChange={(e) => handleLoadView(e.target.value)}
            aria-label="Load saved view"
          >
            <option value="">Saved views</option>
            {savedViews.map((v) => (
              <option key={v.id} value={v.id}>{v.view_name}{v.is_default ? ' (default)' : ''}</option>
            ))}
          </select>
        </div>
        <button type="button" className="btn btn-sm btn-secondary" onClick={handleSaveView}>Save view</button>
        <button type="button" className="btn btn-sm btn-primary" onClick={handleExportCsv}>Export CSV</button>
      </div>

      {loading ? (
        <div className="analytics-widget"><p>Loading dashboard…</p></div>
      ) : (
        <div className="analytics-widget-grid">
          {/* Revenue Overview */}
          <div className="analytics-widget">
            <h3>Revenue overview</h3>
            {w('revenue_overview') ? (
              <div className="analytics-metric-row">
                <div className="analytics-metric-card">
                  <div className="value">{Number(w('revenue_overview').total_revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <div className="label">Total revenue</div>
                </div>
                <div className="analytics-metric-card">
                  <div className="value">{w('revenue_overview').transaction_count ?? 0}</div>
                  <div className="label">Transactions</div>
                </div>
                <div className="analytics-metric-card">
                  <div className="value">{w('revenue_overview').unique_customers ?? 0}</div>
                  <div className="label">Unique customers</div>
                </div>
              </div>
            ) : (
              <p className="empty">No data</p>
            )}
          </div>

          {/* Revenue Split */}
          {w('revenue_split') && (
            <div className="analytics-widget">
              <h3>Revenue split</h3>
              <div className="analytics-metric-row">
                <div className="analytics-metric-card">
                  <div className="value">{Number(w('revenue_split').fiat || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <div className="label">Fiat</div>
                </div>
                <div className="analytics-metric-card">
                  <div className="value">{Number(w('revenue_split').ezt || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</div>
                  <div className="label">EZT</div>
                </div>
              </div>
            </div>
          )}

          {/* Repeat ratio */}
          {w('repeat_customer_ratio') && (
            <div className="analytics-widget">
              <h3>Repeat customer ratio</h3>
              <div className="value">{w('repeat_customer_ratio').repeat_ratio ?? 0}%</div>
              <div className="label">{w('repeat_customer_ratio').repeat_customers ?? 0} repeat / {w('repeat_customer_ratio').total_customers ?? 0} total</div>
            </div>
          )}

          {/* Deal performance */}
          <div className="analytics-widget">
            <h3>Deal performance</h3>
            {w('deal_performance') && w('deal_performance').length > 0 ? (
              <table className="analytics-table">
                <thead>
                  <tr><th>Deal</th><th>Count</th><th>Revenue</th></tr>
                </thead>
                <tbody>
                  {w('deal_performance').slice(0, 8).map((row) => (
                    <tr
                      key={row.deal_id}
                      className="clickable"
                      onClick={() => handleDrillDown({ deal_id: row.deal_id })}
                    >
                      <td>{row.deal_title || row.deal_id}</td>
                      <td>{row.transaction_count}</td>
                      <td>{Number(row.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="empty">No deals</p>
            )}
          </div>

          {/* Time series */}
          <div className="analytics-widget">
            <h3>Trend</h3>
            {w('time_series_trend') && w('time_series_trend').length > 0 ? (
              <div style={{ fontSize: '0.85rem' }}>
                {w('time_series_trend').slice(-7).map((r) => (
                  <div key={r.period} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <span>{new Date(r.period).toLocaleDateString()}</span>
                    <span>{Number(r.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="empty">No trend data</p>
            )}
          </div>

          {/* Weekday heatmap */}
          <div className="analytics-widget">
            <h3>By weekday</h3>
            {w('weekday_heatmap') && w('weekday_heatmap').length > 0 ? (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {[0,1,2,3,4,5,6].map((d) => {
                  const row = w('weekday_heatmap').find((r) => r.weekday === d);
                  return (
                    <div
                      key={d}
                      className="analytics-metric-card"
                      style={{ cursor: 'pointer', minWidth: 60 }}
                      onClick={() => handleDrillDown({ weekday: d })}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="value">{row ? row.revenue?.toFixed(0) : 0}</div>
                      <div className="label">{['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][d]}</div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="empty">No data</p>
            )}
          </div>

          {/* Customer segmentation */}
          {w('customer_segmentation') && w('customer_segmentation').length > 0 && (
            <div className="analytics-widget">
              <h3>Customer segment</h3>
              <table className="analytics-table">
                <thead><tr><th>Segment</th><th>Count</th><th>Revenue</th></tr></thead>
                <tbody>
                  {w('customer_segmentation').map((r) => (
                    <tr key={r.segment}>
                      <td>{r.segment}</td>
                      <td>{r.transaction_count}</td>
                      <td>{Number(r.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Category performance (admin or if available) */}
          {w('category_performance') && w('category_performance').length > 0 && (
            <div className="analytics-widget">
              <h3>Category</h3>
              <table className="analytics-table">
                <thead><tr><th>Category</th><th>Count</th><th>Revenue</th></tr></thead>
                <tbody>
                  {w('category_performance').slice(0, 6).map((r) => (
                    <tr key={r.category_id || r.category_name}>
                      <td>{r.category_name || r.category_slug || r.category_id}</td>
                      <td>{r.transaction_count}</td>
                      <td>{Number(r.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Partner comparison (admin only) */}
          {isAdmin && w('partner_comparison') && w('partner_comparison').length > 0 && (
            <div className="analytics-widget" style={{ gridColumn: '1 / -1' }}>
              <h3>Partner comparison</h3>
              <table className="analytics-table">
                <thead><tr><th>Partner</th><th>Transactions</th><th>Customers</th><th>Revenue</th></tr></thead>
                <tbody>
                  {w('partner_comparison').slice(0, 15).map((r) => (
                    <tr key={r.partner_id}>
                      <td>{r.partner_name}</td>
                      <td>{r.transaction_count}</td>
                      <td>{r.unique_customers}</td>
                      <td>{Number(r.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Top customers */}
          {w('top_customers') && w('top_customers').length > 0 && (
            <div className="analytics-widget">
              <h3>Top customers</h3>
              <table className="analytics-table">
                <thead><tr><th>Customer</th><th>Count</th><th>Revenue</th></tr></thead>
                <tbody>
                  {w('top_customers').slice(0, 5).map((r) => (
                    <tr key={r.user_id}>
                      <td>{r.customer_name || 'Guest'}</td>
                      <td>{r.transaction_count}</td>
                      <td>{Number(r.revenue || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Drill-down modal */}
      {(drillDown !== null || drillDownLoading) && (
        <div className="analytics-drill-modal-overlay" onClick={() => !drillDownLoading && setDrillDown(null)} role="dialog" aria-modal="true">
          <div className="analytics-drill-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Drill-down records</h3>
            <div className="body">
              {drillDownLoading ? (
                <p>Loading…</p>
              ) : Array.isArray(drillDown) && drillDown.length > 0 ? (
                <table className="analytics-table">
                  <thead>
                    <tr><th>Reference</th><th>Date</th><th>Fiat</th><th>EZT</th><th>Revenue</th><th>Deal</th></tr>
                  </thead>
                  <tbody>
                    {drillDown.map((r) => (
                      <tr key={r.id}>
                        <td>{r.booking_reference}</td>
                        <td>{r.created_at ? new Date(r.created_at).toLocaleString() : ''}</td>
                        <td>{r.fiat_amount}</td>
                        <td>{r.ezt_redeemed}</td>
                        <td>{r.revenue}</td>
                        <td>{r.deal_title}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p>No records</p>
              )}
            </div>
            <div className="footer">
              <button type="button" className="btn btn-secondary" onClick={() => setDrillDown(null)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
