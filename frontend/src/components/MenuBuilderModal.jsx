import React, { useState, useEffect, useRef } from 'react';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const SERVICE_TYPES = [
  { key: 'dining',       label: 'Dining',       icon: '🍽️' },
  { key: 'events',       label: 'Events',       icon: '🎉' },
  { key: 'spa-and-salon',label: 'Spa & Salon',  icon: '💆' },
  { key: 'wellness',     label: 'Wellness',     icon: '🧘' },
  { key: 'healthcare',   label: 'Healthcare',   icon: '🏥' },
  { key: 'travel',       label: 'Travel',       icon: '✈️' },
  { key: 'others',       label: 'Others',       icon: '📦' },
];

// Which service types show duration_minutes
const DURATION_SERVICE_TYPES = ['spa-and-salon', 'wellness', 'healthcare', 'events', 'travel', 'others'];

export default function MenuBuilderModal({ show, onClose, editItem, partnerId, token, onSaved }) {
  const [step, setStep] = useState(1);
  const [selectedServiceType, setSelectedServiceType] = useState(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState(null);
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState(null);
  const [taxonomy, setTaxonomy] = useState({ categories: [] });
  const [loadingTaxonomy, setLoadingTaxonomy] = useState(false);
  const [form, setForm] = useState({ name: '', price: 0, description: '', duration_minutes: '', is_available: true, image_base64: null, image_filename: null });
  const [suggestions, setSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customParentId, setCustomParentId] = useState(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const nameInputRef = useRef(null);

  const headers = () => ({ 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' });

  // ── Reset when modal opens/closes or editItem changes ─────────────────────
  useEffect(() => {
    if (!show) return;

    if (editItem) {
      // Edit mode: prefill from existing item, jump to step 4
      setSelectedServiceType(editItem.service_type || null);
      setSelectedCategoryId(editItem.taxonomy_id || null);
      setSelectedSubcategoryId(null);
      setForm({
        name: editItem.name || '',
        price: editItem.price ?? 0,
        description: editItem.description || '',
        duration_minutes: editItem.duration_minutes || '',
        is_available: editItem.is_available !== false,
        image_base64: null,
        image_filename: null,
        image_url: editItem.image_url || null,
      });
      setStep(editItem.service_type ? 4 : 1);
      if (editItem.service_type) {
        fetchTaxonomy(editItem.service_type);
      }
    } else {
      // Add mode: full reset
      setStep(1);
      setSelectedServiceType(null);
      setSelectedCategoryId(null);
      setSelectedSubcategoryId(null);
      setTaxonomy({ categories: [] });
      setForm({ name: '', price: 0, description: '', duration_minutes: '', is_available: true, image_base64: null, image_filename: null });
    }
    setSuggestions([]);
    setShowSuggestions(false);
    setError('');
    setShowCustomForm(false);
    setCustomName('');
  }, [show, editItem?.id]);

  // ── Fetch taxonomy tree ────────────────────────────────────────────────────
  async function fetchTaxonomy(serviceType) {
    if (!serviceType) return;
    setLoadingTaxonomy(true);
    try {
      const qs = `?service_type=${serviceType}${partnerId ? `&partner_id=${partnerId}` : ''}`;
      const r = await fetch(`${API_BASE}/api/v1/taxonomy${qs}`);
      const j = await r.json();
      if (j.success && j.data) {
        setTaxonomy(j.data);
      }
    } catch (e) {
      console.error('Taxonomy fetch error:', e);
    } finally {
      setLoadingTaxonomy(false);
    }
  }

  // ── Fetch autocomplete suggestions ────────────────────────────────────────
  useEffect(() => {
    const tid = selectedSubcategoryId ?? selectedCategoryId;
    if (!tid) { setSuggestions([]); return; }
    fetch(`${API_BASE}/api/v1/taxonomy/${tid}/items/suggestions`)
      .then(r => r.json())
      .then(j => { if (j.success && j.data) setSuggestions(j.data.suggestions || []); })
      .catch(() => setSuggestions([]));
  }, [selectedSubcategoryId, selectedCategoryId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  function handleServiceTypeSelect(key) {
    setSelectedServiceType(key);
    setSelectedCategoryId(null);
    setSelectedSubcategoryId(null);
    fetchTaxonomy(key);
    setStep(2);
    setShowCustomForm(false);
  }

  function handleCategorySelect(cat) {
    setSelectedCategoryId(cat.id);
    setSelectedSubcategoryId(null);
    if (cat.children && cat.children.length > 0) {
      setStep(3);
    } else {
      setStep(4);
    }
    setShowCustomForm(false);
  }

  function handleSubcategorySelect(sub) {
    setSelectedSubcategoryId(sub.id);
    setStep(4);
    setShowCustomForm(false);
  }

  function goToStep(n) {
    if (n < step) setStep(n);
  }

  function getSelectedCategory() {
    return taxonomy.categories.find(c => c.id === selectedCategoryId);
  }

  function getSelectedCategoryLabel() {
    const cat = getSelectedCategory();
    return cat ? cat.name : '';
  }

  function getSelectedSubcategoryLabel() {
    const cat = getSelectedCategory();
    if (!cat) return '';
    const sub = (cat.children || []).find(s => s.id === selectedSubcategoryId);
    return sub ? sub.name : '';
  }

  // ── Custom category creation ───────────────────────────────────────────────
  async function handleAddCustom(e) {
    e.preventDefault();
    if (!customName.trim() || !selectedServiceType || !partnerId) return;
    setAddingCustom(true);
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partnerId}/taxonomy`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          service_type: selectedServiceType,
          name: customName.trim(),
          parent_id: customParentId || null
        })
      });
      const j = await r.json();
      if (j.success) {
        setCustomName('');
        setShowCustomForm(false);
        setCustomParentId(null);
        await fetchTaxonomy(selectedServiceType);
      } else {
        alert(j.message || j.error || 'Failed to create category');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingCustom(false);
    }
  }

  // ── Image upload ──────────────────────────────────────────────────────────
  function handleImageChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Image must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = () => setForm(f => ({ ...f, image_base64: reader.result, image_filename: file.name }));
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave(e) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Service name is required'); return; }
    if (!partnerId) { setError('Partner ID missing'); return; }
    setError('');
    setSaving(true);

    const taxonomyId = selectedSubcategoryId ?? selectedCategoryId ?? null;
    const payload = {
      name: form.name.trim(),
      price: parseFloat(form.price) || 0,
      description: form.description || '',
      is_available: form.is_available,
      service_type: selectedServiceType || editItem?.service_type || 'others',
      taxonomy_id: taxonomyId,
      // Keep backward compat: set category to the taxonomy name for display
      category: getSelectedSubcategoryLabel() || getSelectedCategoryLabel() || editItem?.category || '',
    };

    if (form.duration_minutes) payload.duration_minutes = parseInt(form.duration_minutes, 10);
    if (form.image_base64) {
      payload.image_base64 = form.image_base64;
      payload.image_filename = form.image_filename;
    } else if (form.image_url && !form.image_base64) {
      payload.image_url = form.image_url;
    }

    const isEdit = !!editItem?.id;
    const url = isEdit
      ? `${API_BASE}/api/v1/partners/${partnerId}/menu/${editItem.id}`
      : `${API_BASE}/api/v1/partners/${partnerId}/menu`;

    try {
      const r = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: headers(),
        body: JSON.stringify(payload)
      });
      const j = await r.json();
      if (j.success) {
        onSaved?.();
      } else {
        setError(j.message || j.error || 'Failed to save');
      }
    } catch (err) {
      setError('Network error — please retry');
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  if (!show) return null;

  const selectedCategory = getSelectedCategory();
  const subcategories = selectedCategory?.children || [];

  return (
    <div className="pc-modal show" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="pc-modal-content" style={{ maxWidth: 680 }}>
        <div className="pc-modal-header">
          <h2 className="pc-modal-title">{editItem ? 'Edit Service' : 'Add Service'}</h2>
          <button className="pc-modal-close" onClick={onClose}>&times;</button>
        </div>

        {/* Breadcrumb stepper */}
        <div className="mb-stepper">
          <span
            className={`mb-step ${step >= 1 ? 'active' : ''}`}
            onClick={() => step > 1 && goToStep(1)}
          >
            {selectedServiceType
              ? SERVICE_TYPES.find(s => s.key === selectedServiceType)?.icon + ' ' + SERVICE_TYPES.find(s => s.key === selectedServiceType)?.label
              : 'Service Type'}
          </span>
          {selectedServiceType && (<>
            <span className="mb-step-sep">›</span>
            <span
              className={`mb-step ${step >= 2 ? 'active' : ''}`}
              onClick={() => step > 2 && goToStep(2)}
            >
              {getSelectedCategoryLabel() || 'Category'}
            </span>
          </>)}
          {selectedCategoryId && subcategories.length > 0 && (<>
            <span className="mb-step-sep">›</span>
            <span
              className={`mb-step ${step >= 3 ? 'active' : ''}`}
              onClick={() => step > 3 && goToStep(3)}
            >
              {getSelectedSubcategoryLabel() || 'Subcategory'}
            </span>
          </>)}
          {step === 4 && (<>
            <span className="mb-step-sep">›</span>
            <span className="mb-step active">Item Details</span>
          </>)}
        </div>

        {/* ── STEP 1: Service Type ─────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: 16 }}>
              What type of service are you adding?
            </p>
            <div className="mb-icon-grid">
              {SERVICE_TYPES.map(st => (
                <button
                  key={st.key}
                  type="button"
                  className={`mb-icon-card ${selectedServiceType === st.key ? 'selected' : ''}`}
                  onClick={() => handleServiceTypeSelect(st.key)}
                >
                  <span className="mb-icon-emoji">{st.icon}</span>
                  <span className="mb-icon-label">{st.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── STEP 2: Category ─────────────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              Select a category
            </p>
            {loadingTaxonomy ? (
              <p style={{ color: 'var(--muted)', fontSize: '0.875rem' }}>Loading…</p>
            ) : (
              <>
                <div className="mb-chip-row">
                  {taxonomy.categories.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      className={`mb-chip ${selectedCategoryId === cat.id ? 'selected' : ''}`}
                      onClick={() => handleCategorySelect(cat)}
                    >
                      {cat.is_custom && <span style={{ fontSize: '0.7rem', opacity: 0.7, marginRight: 4 }}>★</span>}
                      {cat.name}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="mb-chip mb-chip-add"
                    onClick={() => { setShowCustomForm(!showCustomForm); setCustomParentId(null); }}
                  >
                    + Add
                  </button>
                </div>

                {/* Inline custom category form */}
                {showCustomForm && (
                  <form onSubmit={handleAddCustom} className="mb-custom-form">
                    <input
                      className="pc-form-input"
                      placeholder="New category name"
                      value={customName}
                      onChange={e => setCustomName(e.target.value)}
                      autoFocus
                      maxLength={100}
                    />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button type="submit" className="btn btn-primary btn-sm" disabled={addingCustom || !customName.trim()}>
                        {addingCustom ? 'Adding…' : 'Add'}
                      </button>
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCustomForm(false)}>
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </>
            )}
            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(1)}>← Back</button>
            </div>
          </div>
        )}

        {/* ── STEP 3: Subcategory ──────────────────────────────────────────── */}
        {step === 3 && (
          <div>
            <p style={{ color: 'var(--muted)', fontSize: '0.875rem', marginBottom: 12 }}>
              Select a subcategory under <strong style={{ color: 'var(--text)' }}>{getSelectedCategoryLabel()}</strong>
            </p>
            <div className="mb-chip-row">
              {subcategories.map(sub => (
                <button
                  key={sub.id}
                  type="button"
                  className={`mb-chip ${selectedSubcategoryId === sub.id ? 'selected' : ''}`}
                  onClick={() => handleSubcategorySelect(sub)}
                >
                  {sub.name}
                </button>
              ))}
              <button
                type="button"
                className="mb-chip mb-chip-add"
                onClick={() => { setShowCustomForm(!showCustomForm); setCustomParentId(selectedCategoryId); }}
              >
                + Add
              </button>
              {/* Skip subcategory — go straight to item form */}
              <button
                type="button"
                className="mb-chip"
                style={{ borderStyle: 'dashed', color: 'var(--muted)' }}
                onClick={() => setStep(4)}
              >
                Skip →
              </button>
            </div>

            {showCustomForm && (
              <form onSubmit={handleAddCustom} className="mb-custom-form">
                <input
                  className="pc-form-input"
                  placeholder={`New subcategory under ${getSelectedCategoryLabel()}`}
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  autoFocus
                  maxLength={100}
                />
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={addingCustom || !customName.trim()}>
                    {addingCustom ? 'Adding…' : 'Add'}
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => setShowCustomForm(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <div style={{ marginTop: 16 }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setStep(2); setSelectedSubcategoryId(null); }}>← Back</button>
            </div>
          </div>
        )}

        {/* ── STEP 4: Item Details ─────────────────────────────────────────── */}
        {step === 4 && (
          <form onSubmit={handleSave}>
            {/* Name with autocomplete */}
            <div className="pc-form-group" style={{ position: 'relative' }}>
              <label>Service / Item Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(required)</span></label>
              <input
                ref={nameInputRef}
                className="pc-form-input"
                required
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                placeholder="e.g. Butter Chicken, Swedish Massage…"
                autoComplete="off"
              />
              {showSuggestions && suggestions.length > 0 && form.name.length >= 1 && (
                <ul className="mb-suggestions-list">
                  {suggestions
                    .filter(s => s.toLowerCase().includes(form.name.toLowerCase()))
                    .slice(0, 8)
                    .map(s => (
                      <li key={s} onMouseDown={() => setForm(f => ({ ...f, name: s }))}>
                        {s}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* Price and Duration */}
            <div className="pc-form-grid">
              <div className="pc-form-group">
                <label>Price (₹)</label>
                <input
                  type="number"
                  className="pc-form-input"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={e => setForm(f => ({ ...f, price: e.target.value }))}
                />
              </div>
              {DURATION_SERVICE_TYPES.includes(selectedServiceType || editItem?.service_type) && (
                <div className="pc-form-group">
                  <label>Duration (minutes)</label>
                  <input
                    type="number"
                    className="pc-form-input"
                    min="0"
                    placeholder="e.g. 60"
                    value={form.duration_minutes}
                    onChange={e => setForm(f => ({ ...f, duration_minutes: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Description */}
            <div className="pc-form-group">
              <label>Description <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
              <textarea
                className="pc-form-input"
                rows={2}
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="Brief description shown on the app"
              />
            </div>

            {/* Image */}
            <div className="pc-form-group">
              <label>Item Image <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional · max 2MB)</span></label>
              {(form.image_base64 || form.image_url) && (
                <div style={{ marginBottom: 8 }}>
                  <img
                    src={form.image_base64 || form.image_url}
                    alt="preview"
                    style={{ height: 60, borderRadius: 6, border: '1px solid var(--border)', objectFit: 'cover' }}
                  />
                  <button
                    type="button"
                    style={{ marginLeft: 8, fontSize: '0.75rem', color: 'var(--muted)', background: 'none', border: 'none', cursor: 'pointer' }}
                    onClick={() => setForm(f => ({ ...f, image_base64: null, image_filename: null, image_url: null }))}
                  >
                    Remove
                  </button>
                </div>
              )}
              <input type="file" accept="image/*" className="pc-form-input" onChange={handleImageChange} />
            </div>

            {/* Available toggle */}
            <div className="pc-form-group" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="checkbox"
                id="mb-available"
                checked={form.is_available}
                onChange={e => setForm(f => ({ ...f, is_available: e.target.checked }))}
                style={{ width: 18, height: 18, accentColor: 'var(--brand1)' }}
              />
              <label htmlFor="mb-available" style={{ marginBottom: 0, cursor: 'pointer' }}>
                Available for customers
              </label>
            </div>

            {error && <p style={{ color: '#ef4444', fontSize: '0.875rem', marginBottom: 8 }}>{error}</p>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              {!editItem && (
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => setStep(subcategories.length > 0 ? 3 : 2)}>
                  ← Change Category
                </button>
              )}
              <button type="button" className="btn btn-secondary" onClick={onClose}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : (editItem ? 'Update Service' : 'Add Service')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
