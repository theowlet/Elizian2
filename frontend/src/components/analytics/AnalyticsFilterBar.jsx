/**
 * Enterprise filter bar: date range, deal, category, weekday, customer type, revenue type, tier (admin).
 * Responsive; collapses on mobile.
 */

import React, { useState } from 'react';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'this_month', label: 'This Month' },
];

const WEEKDAYS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const CUSTOMER_TYPES = [
  { value: 'all', label: 'All' },
  { value: 'new', label: 'New' },
  { value: 'returning', label: 'Returning' },
];

const REVENUE_TYPES = [
  { value: 'total', label: 'Total' },
  { value: 'fiat', label: 'Fiat' },
  { value: 'ezt', label: 'EZT' },
];

export default function AnalyticsFilterBar({
  filter,
  onFilterChange,
  isAdmin,
  dealOptions = [],
  categoryOptions = [],
  tierOptions = [],
  partnerOptions = [],
}) {
  const [expanded, setExpanded] = useState(false);
  const [customStart, setCustomStart] = useState(filter.start_date || '');
  const [customEnd, setCustomEnd] = useState(filter.end_date || '');

  const handlePeriod = (period) => {
    onFilterChange({ ...filter, period, start_date: undefined, end_date: undefined });
  };

  const handleCustomRange = () => {
    if (customStart && customEnd) onFilterChange({ ...filter, start_date: customStart, end_date: customEnd, period: undefined });
  };

  const toggleWeekday = (d) => {
    const next = filter.weekday ? [...filter.weekday] : [];
    const i = next.indexOf(d);
    if (i >= 0) next.splice(i, 1);
    else next.push(d);
    onFilterChange({ ...filter, weekday: next.length ? next : undefined });
  };

  return (
    <div className="analytics-filter-bar">
      <div className="analytics-filter-row">
        <div className="analytics-filter-group">
          <label>Date</label>
          <div className="analytics-filter-chips">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                type="button"
                className={`chip ${filter.period === p.value ? 'active' : ''}`}
                onClick={() => handlePeriod(p.value)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <div className="analytics-filter-custom">
            <input
              type="date"
              value={customStart}
              onChange={(e) => setCustomStart(e.target.value)}
              placeholder="Start"
            />
            <input
              type="date"
              value={customEnd}
              onChange={(e) => setCustomEnd(e.target.value)}
              placeholder="End"
            />
            <button type="button" className="btn btn-sm btn-primary" onClick={handleCustomRange}>
              Apply
            </button>
          </div>
        </div>
        <div className="analytics-filter-group">
          <label>Revenue type</label>
          <div className="analytics-filter-chips">
            {REVENUE_TYPES.map((r) => (
              <button
                key={r.value}
                type="button"
                className={`chip ${filter.revenue_type === r.value ? 'active' : ''}`}
                onClick={() => onFilterChange({ ...filter, revenue_type: r.value })}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="analytics-filter-toggle"
          onClick={() => setExpanded(!expanded)}
          aria-expanded={expanded}
        >
          {expanded ? 'Less filters' : 'More filters'}
        </button>
      </div>

      {expanded && (
        <div className="analytics-filter-row analytics-filter-more">
          <div className="analytics-filter-group">
            <label>Weekday</label>
            <div className="analytics-filter-chips">
              {WEEKDAYS.map((w) => (
                <button
                  key={w.value}
                  type="button"
                  className={`chip ${(filter.weekday || []).includes(w.value) ? 'active' : ''}`}
                  onClick={() => toggleWeekday(w.value)}
                >
                  {w.label}
                </button>
              ))}
            </div>
          </div>
          <div className="analytics-filter-group">
            <label>Customer</label>
            <div className="analytics-filter-chips">
              {CUSTOMER_TYPES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  className={`chip ${filter.customer_type === c.value ? 'active' : ''}`}
                  onClick={() => onFilterChange({ ...filter, customer_type: c.value })}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          {dealOptions.length > 0 && (
            <div className="analytics-filter-group">
              <label>Deal</label>
              <select
                value={filter.deal_id && filter.deal_id[0]} 
                onChange={(e) => onFilterChange({ ...filter, deal_id: e.target.value ? [e.target.value] : undefined })}
              >
                <option value="">All deals</option>
                {dealOptions.map((d) => (
                  <option key={d.id} value={d.id}>{d.title || d.name}</option>
                ))}
              </select>
            </div>
          )}
          {categoryOptions.length > 0 && (
            <div className="analytics-filter-group">
              <label>Category</label>
              <select
                value={filter.category_id && filter.category_id[0]}
                onChange={(e) => onFilterChange({ ...filter, category_id: e.target.value ? [e.target.value] : undefined })}
              >
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>{c.name || c.slug}</option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && tierOptions.length > 0 && (
            <div className="analytics-filter-group">
              <label>Tier</label>
              <select
                value={filter.tier_id || ''}
                onChange={(e) => onFilterChange({ ...filter, tier_id: e.target.value || undefined })}
              >
                <option value="">All tiers</option>
                {tierOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && partnerOptions.length > 0 && (
            <div className="analytics-filter-group">
              <label>Partner</label>
              <select
                value={filter.partner_id && filter.partner_id[0]}
                onChange={(e) => onFilterChange({ ...filter, partner_id: e.target.value ? [e.target.value] : undefined })}
              >
                <option value="">All partners</option>
                {partnerOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
