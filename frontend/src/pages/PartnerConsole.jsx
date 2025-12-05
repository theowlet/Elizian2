// PartnerConsole.jsx
// Drop this file in: /src/pages/PartnerConsole.jsx
// Create a CSS file alongside: /src/styles/partnerConsole.css (content included later in this doc)

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/partnerConsole.css';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001';

/* ------------------ Small presentational components ------------------ */
function Header({ partnerName, onLogout }) {
  return (
    <header className="pc-header">
      <div className="pc-header-content">
        <div className="pc-logo">
          <div className="pc-logo-icon">Z</div>
          <span>EZNet Event Partner Console</span>
        </div>
        <div className="pc-header-actions">
          <span id="partnerName">{partnerName || 'Event Venue Name'}</span>
          <button className="btn btn-secondary" onClick={onLogout}>Logout</button>
        </div>
      </div>
    </header>
  );
}

function Sidebar({ active, onNavigate }) {
  const nav = [
    ['dashboard', 'Dashboard'],
    ['profile', 'Profile'],
    ['menu', 'Menu Items'],
    ['orders', 'Bookings'],
    ['analytics', 'Analytics'],
    ['offers', 'Offers'],
    ['scanner', 'QR Scanner']
  ];

  return (
    <nav className="pc-sidebar">
      {nav.map(([id, label]) => (
        <div
          key={id}
          className={`pc-nav-item ${active === id ? 'active' : ''}`}
          onClick={() => onNavigate(id)}
        >
          <span>{label}</span>
        </div>
      ))}
    </nav>
  );
}

function Modal({ id, title, children, show, onClose, width = 700 }) {
  return (
    <div id={id} className={`pc-modal ${show ? 'show' : ''}`}>
      <div className="pc-modal-content" style={{ maxWidth: width }}>
        <div className="pc-modal-header">
          <h2 className="pc-modal-title">{title}</h2>
          <button className="pc-modal-close" onClick={onClose}>&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ------------------ Main page ------------------ */
export default function PartnerConsole() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('dashboard');
  const [partner, setPartner] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('partnerToken'));

  // Data stores
  const [dashboardData, setDashboardData] = useState(null);
  const [menuItems, setMenuItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [offers, setOffers] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  // Modals
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [offerEditId, setOfferEditId] = useState(null);
  const [menuEditId, setMenuEditId] = useState(null);

  const [serviceTypes, setServiceTypes] = useState([]);
  const [serviceCategories, setServiceCategories] = useState([]);

  // Basic auth header helper
  const headers = () => ({ 'Content-Type': 'application/json', Authorization: token ? `Bearer ${token}` : '' });

  useEffect(() => {
    // Check auth
    const storedToken = localStorage.getItem('partnerToken');
    const partnerInfo = localStorage.getItem('partnerInfo');

    if (!storedToken) {
      console.log('No partnerToken found, redirecting to login');
      navigate('/partner/login');
      return;
    }

    setToken(storedToken);

    if (partnerInfo) {
      try { 
        setPartner(JSON.parse(partnerInfo)); 
      } catch(e) { 
        console.error('Error parsing partnerInfo:', e);
        loadPartnerData(); 
      }
    } else {
      loadPartnerData();
    }

    // initial loads
    loadServiceTypes();
    loadServiceCategories();
  }, [navigate]);

  useEffect(() => {
    if (partner && partner.id) {
      loadDashboard();
      loadMenuItems();
      loadOffers();
      loadOrders();
      loadAnalytics();
    }
  }, [partner]);

  async function loadPartnerData() {
    try {
      // If token present, API should return partner associated
      const res = await fetch(`${API_BASE}/api/v1/partners/me`, { headers: headers() });
      const json = await res.json();
      if (json.success) {
        setPartner(json.data);
        localStorage.setItem('partnerInfo', JSON.stringify(json.data));
      } else {
        console.warn('Could not load partner me', json);
      }
    } catch (err) {
      console.error('Error loading partner me', err);
    }
  }

  async function loadServiceTypes() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/service-types`);
      const j = await r.json();
      if (j.success) setServiceTypes(j.service_types || []);
    } catch (e) { console.warn('service types error', e); }
  }

  async function loadServiceCategories() {
    try {
      const r = await fetch(`${API_BASE}/api/v1/service-categories`);
      const j = await r.json();
      if (j.success) setServiceCategories(j.data || []);
    } catch (e) { console.warn('service categories error', e); }
  }

  async function loadDashboard() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/dashboard`, { headers: headers() });
      const j = await r.json();
      if (j.success) setDashboardData(j.data);
    } catch (e) { console.error(e); }
  }

  async function loadMenuItems() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/menu`, { headers: headers() });
      const j = await r.json();
      if (j.success) setMenuItems(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadOrders() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/orders`, { headers: headers() });
      const j = await r.json();
      if (j.success) setOrders(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadOffers() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/offers`, { headers: headers() });
      const j = await r.json();
      if (j.success) setOffers(j.data || []);
    } catch (e) { console.error(e); }
  }

  async function loadAnalytics() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/analytics`, { headers: headers() });
      const j = await r.json();
      if (j.success) setAnalytics(j.data || null);
    } catch (e) { console.error(e); }
  }

  function handleNavigate(section) {
    setActiveSection(section);
    // lazy load
    if (section === 'menu') loadMenuItems();
    if (section === 'offers') loadOffers();
    if (section === 'orders') loadOrders();
    if (section === 'analytics') loadAnalytics();
  }

  function logout() {
    if (window.confirm('Logout?')) {
      localStorage.removeItem('partnerToken');
      localStorage.removeItem('partnerInfo');
      navigate('/partner/login');
    }
  }

  // Offer form state and handlers (kept simple; uses controlled inputs)
  const [offerForm, setOfferForm] = useState({});

  function openAddOffer() {
    setOfferEditId(null);
    setOfferForm({ applicable_days: ['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] });
    setShowOfferModal(true);
  }

  function openEditOffer(id) {
    const o = offers.find(x => x.id === id);
    if (!o) return;
    setOfferEditId(id);
    setOfferForm({ ...o });
    setShowOfferModal(true);
  }

  async function saveOffer(e) {
    e.preventDefault();
    if (!partner) return;
    const url = offerEditId ? `${API_BASE}/api/v1/partners/${partner.id}/offers/${offerEditId}` : `${API_BASE}/api/v1/partners/${partner.id}/offers`;
    try {
      const r = await fetch(url, { method: offerEditId ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(offerForm) });
      const j = await r.json();
      if (j.success) { setShowOfferModal(false); loadOffers(); }
      else alert('Failed: ' + (j.error || 'unknown'));
    } catch (err) { console.error(err); }
  }

  // Menu item add/edit
  const [menuForm, setMenuForm] = useState({});

  function openAddMenu() {
    setMenuEditId(null);
    setMenuForm({ is_available: true });
    setShowMenuModal(true);
  }

  function openEditMenu(id) {
    const it = menuItems.find(m => m.id === id);
    if (!it) return;
    setMenuEditId(id);
    setMenuForm({ ...it });
    setShowMenuModal(true);
  }

  async function saveMenuItem(e) {
    e.preventDefault();
    if (!partner) return;
    const url = menuEditId ? `${API_BASE}/api/v1/partners/${partner.id}/menu/${menuEditId}` : `${API_BASE}/api/v1/partners/${partner.id}/menu`;
    try {
      const r = await fetch(url, { method: menuEditId ? 'PUT' : 'POST', headers: headers(), body: JSON.stringify(menuForm) });
      const j = await r.json();
      if (j.success) { setShowMenuModal(false); loadMenuItems(); }
      else alert('Failed: ' + (j.error || 'unknown'));
    } catch (err) { console.error(err); }
  }

  // Simple redeem voucher flow used in scanner section
  const [scannerResult, setScannerResult] = useState(null);
  async function validateVoucher(code) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/vouchers/${code}`, { headers: headers() });
      const j = await r.json();
      setScannerResult(j);
    } catch (e) { console.error(e); }
  }

  // Render helpers for sections (simple, keeping original structure)
  function DashboardSection() {
    return (
      <div>
        <div className="pc-content-header">
          <h1>Dashboard</h1>
          <div>
            <button className="btn btn-primary" onClick={loadDashboard}>Refresh</button>
          </div>
        </div>

        <div className="pc-stats-grid">
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.total_orders ?? 0}</div>
            <div className="pc-stat-label">Total Orders</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.today_orders ?? 0}</div>
            <div className="pc-stat-label">Today's Orders</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">₹{dashboardData?.total_revenue ?? 0}</div>
            <div className="pc-stat-label">Total Revenue</div>
          </div>
          <div className="pc-stat-card">
            <div className="pc-stat-value">{dashboardData?.menu_items_count ?? 0}</div>
            <div className="pc-stat-label">Menu Items</div>
          </div>
        </div>

        <div style={{ marginTop: 20 }}>
          <h3>Recent Orders</h3>
          <div className="pc-table-container">
            <table className="pc-table">
              <thead>
                <tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Amount</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(dashboardData?.recent_orders || []).length === 0 ? (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 20 }}>No recent orders</td></tr>
                ) : (
                  (dashboardData.recent_orders || []).map(o => (
                    <tr key={o.id}>
                      <td>{o.id}</td>
                      <td>{o.customer_name || o.customer}</td>
                      <td>{Array.isArray(o.items) ? o.items.map(i => i.name || i).join(', ') : o.items}</td>
                      <td>₹{o.total_amount || o.amount}</td>
                      <td><span className={`pc-badge pc-badge-${getStatusClass(o.status)}`}>{o.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  function ProfileSection() {
    async function saveProfile() {
      if (!partner) return;
      const payload = {
        name: document.getElementById('venueName')?.value,
        email: document.getElementById('venueEmail')?.value,
        phone_number: document.getElementById('venuePhone')?.value,
        gst_number: document.getElementById('venueGST')?.value,
        address: document.getElementById('venueAddress')?.value,
        partner_category_type: document.getElementById('venueType')?.value,
        partner_discount_percentage: parseFloat(document.getElementById('discountPercentage')?.value || 0),
        description: document.getElementById('venueDescription')?.value
      };
      try {
        const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}`, { method: 'PUT', headers: headers(), body: JSON.stringify(payload) });
        const j = await r.json();
        if (j.success) { setPartner(j.data); localStorage.setItem('partnerInfo', JSON.stringify(j.data)); alert('Saved'); }
        else alert('Save failed: ' + (j.error || 'unknown'));
      } catch (e) { console.error(e); }
    }

    return (
      <div>
        <div className="pc-content-header"><h1>Event Venue Profile</h1><button className="btn btn-primary" onClick={saveProfile}>Save Changes</button></div>
        <form id="profileForm">
          <div className="pc-form-grid">
            <div className="pc-form-group"><label>Venue Name</label><input id="venueName" className="pc-form-input" defaultValue={partner?.name || ''} /></div>
            <div className="pc-form-group"><label>Email</label><input id="venueEmail" className="pc-form-input" defaultValue={partner?.email || ''} /></div>
          </div>
          <div className="pc-form-group"><label>Phone</label><input id="venuePhone" className="pc-form-input" defaultValue={partner?.phone_number || partner?.phone || ''} /></div>
          <div className="pc-form-group"><label>GST</label><input id="venueGST" className="pc-form-input" defaultValue={partner?.gst_number || ''} /></div>
          <div className="pc-form-group"><label>Address</label><textarea id="venueAddress" className="pc-form-input">{partner?.address || ''}</textarea></div>
          <div className="pc-form-grid">
            <div className="pc-form-group"><label>Venue Type</label><select id="venueType" className="pc-form-input" defaultValue={partner?.partner_category_type || ''}><option value="">Select</option><option value="dining">Dining</option><option value="events">Events</option><option value="spa-and-salon">Spa & Salon</option><option value="wellness">Wellness</option><option value="travel">Travel</option><option value="others">Others</option></select></div>
            <div className="pc-form-group"><label>Partner Discount %</label><input id="discountPercentage" className="pc-form-input" defaultValue={partner?.partner_discount_percentage || 0} type="number"/></div>
          </div>
          <div className="pc-form-group"><label>Description</label><textarea id="venueDescription" className="pc-form-input">{partner?.description || ''}</textarea></div>
        </form>
      </div>
    );
  }

  function MenuSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Services & Menu</h1><div><button className="btn btn-primary" onClick={openAddMenu}>Add New Service</button></div></div>
        <div className="pc-table-container"><table className="pc-table"><thead><tr><th>Service Name</th><th>Description</th><th>Price</th><th>Category</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {menuItems.length === 0 ? (
            <tr><td colSpan={6} style={{textAlign:'center', padding: 24}}>No items</td></tr>
          ) : menuItems.map(item => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td style={{maxWidth:200, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.description}</td>
              <td>₹{item.price}</td>
              <td>{item.category || item.service_category_name || item.service_type}</td>
              <td><span className={`pc-badge pc-badge-${item.is_available ? 'success' : 'error'}`}>{item.is_available ? 'Available' : 'Unavailable'}</span></td>
              <td><div className="pc-actions"><button className="btn btn-sm btn-secondary" onClick={() => openEditMenu(item.id)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteMenu(item.id)}>Delete</button></div></td>
            </tr>
          ))}
        </tbody></table></div>
      </div>
    );
  }

  async function deleteMenu(id) {
    if (!window.confirm('Delete item?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/menu/${id}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) { loadMenuItems(); showNotification('Deleted'); } else showNotification('Delete failed');
    } catch (e) { console.error(e); }
  }

  function OffersSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Offers & Discounts Management</h1><div><button className="btn btn-primary" onClick={openAddOffer}>Create New Offer</button></div></div>
        <div className="pc-table-container"><table className="pc-table"><thead><tr><th>Offer Details</th><th>Type</th><th>Validity</th><th>Redemptions</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {offers.length === 0 ? (
            <tr><td colSpan={6} style={{textAlign:'center', padding:24}}>No offers</td></tr>
          ) : offers.map(of => (
            <tr key={of.id}><td>{of.title}</td><td>{(of.offer_type||'').toUpperCase()}</td><td>{new Date(of.start_date).toLocaleDateString()} - {new Date(of.end_date).toLocaleDateString()}</td><td>{of.max_redemptions||'Unlimited'}</td><td><span className={`pc-badge pc-badge-${(new Date(of.end_date) > new Date()) ? 'success':'error'}`}>{(new Date(of.end_date) > new Date()) ? 'ACTIVE':'INACTIVE'}</span></td><td><div className="pc-actions"><button className="btn btn-sm btn-secondary" onClick={() => openEditOffer(of.id)}>Edit</button><button className="btn btn-sm btn-danger" onClick={() => deleteOffer(of.id)}>Delete</button></div></td></tr>
          ))}
        </tbody></table></div>
      </div>
    );
  }

  async function deleteOffer(id) {
    if (!window.confirm('Delete offer?')) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/offers/${id}`, { method: 'DELETE', headers: headers() });
      const j = await r.json();
      if (j.success) loadOffers(); else showNotification('Delete failed');
    } catch (e) { console.error(e); }
  }

  function OrdersSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Orders & Bookings</h1></div>
        <div className="pc-table-container"><table className="pc-table"><thead><tr><th>Order ID</th><th>Customer</th><th>Items</th><th>Tickets</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {orders.length === 0 ? <tr><td colSpan={8} style={{textAlign:'center', padding:24}}>No orders</td></tr> : orders.map(o => (
            <tr key={o.id}><td>#{o.id}</td><td>{o.customer_name||o.customer}</td><td>{Array.isArray(o.items)? o.items.map(i=>i.name||i).join(', '): o.items}</td><td>{o.ticket_count||o.quantity||'-'}</td><td>₹{o.total_amount||o.total}</td><td><span className={`pc-badge pc-badge-${o.payment_status==='paid'?'success':'warning'}`}>{o.payment_status||'pending'}</span></td><td><span className={`pc-badge pc-badge-${getStatusClass(o.status)}`}>{o.status}</span></td><td><div className="pc-actions"><button className="btn btn-sm btn-primary" onClick={() => viewOrder(o.id)}>View</button></div></td></tr>
          ))}
        </tbody></table></div>
      </div>
    );
  }

  function AnalyticsSection() {
    return (
      <div>
        <div className="pc-content-header"><h1>Analytics</h1></div>
        <div className="pc-stats-grid">
          <div className="pc-stat-card"><div className="pc-stat-value">₹{analytics?.avgOrderValue||0}</div><div className="pc-stat-label">Avg Order Value</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{analytics?.totalCustomers||0}</div><div className="pc-stat-label">Total Customers</div></div>
          <div className="pc-stat-card"><div className="pc-stat-value">{analytics?.repeatCustomers||0}%</div><div className="pc-stat-label">Repeat Customers</div></div>
        </div>
      </div>
    );
  }

  function QRScannerSection() {
    const codeRef = useRef();
    return (
      <div>
        <div className="pc-content-header"><h1>QR Voucher Scanner</h1></div>
        <div style={{maxWidth:500}}>
          <div className="pc-form-group"><label>Voucher Code</label><input ref={codeRef} className="pc-form-input" placeholder="VCH-XXXX"/></div>
          <div style={{display:'flex', gap:10}}>
            <button className="btn btn-primary" onClick={() => validateVoucher(codeRef.current.value)}>Validate</button>
            <button className="btn btn-secondary" onClick={() => { codeRef.current.value=''; setScannerResult(null); }}>Reset</button>
          </div>
          <div style={{marginTop:20}}>
            {scannerResult && scannerResult.success ? (
              <div style={{padding:16, borderRadius:8, background:'#f0fdf4'}}>
                <div><strong>Code:</strong> {scannerResult.data.code}</div>
                <div><strong>Status:</strong> {scannerResult.data.status}</div>
                <div style={{marginTop:10}}><button className="btn btn-primary" onClick={() => redeemVoucher(scannerResult.data.code)}>Redeem</button></div>
              </div>
            ) : scannerResult && !scannerResult.success ? (<div style={{color:'#ef4444'}}>{scannerResult.error||'Invalid'}</div>) : null}
          </div>
        </div>
      </div>
    );
  }

  async function redeemVoucher(code) {
    try {
      const r = await fetch(`${API_BASE}/api/v1/vouchers/${code}/redeem`, { method:'POST', headers: headers() });
      const j = await r.json();
      if (j.success) { showNotification('Redeemed'); loadDashboard(); } else showNotification('Redeem failed');
    } catch (e) { console.error(e); }
  }

  function getStatusClass(status) {
    const mapping = { pending: 'warning', confirmed: 'secondary', preparing: 'warning', ready: 'success', completed: 'success', cancelled: 'error' };
    return mapping[status] || 'secondary';
  }

  function showNotification(msg, type='success') {
    const n = document.createElement('div');
    n.style.cssText = `position:fixed;top:20px;right:20px;padding:12px 16px;border-radius:8px;color:#fff;background:${type==='success'?'#10b981':'#ef4444'};z-index:11000;`;
    n.textContent = msg;
    document.body.appendChild(n);
    setTimeout(()=>{ n.style.opacity='0'; setTimeout(()=>n.remove(),400); },3000);
  }

  function viewOrder(id) {
    const o = orders.find(x => x.id === id);
    if (!o) return;
    alert(JSON.stringify(o, null, 2));
  }

  // Don't render if no token (will redirect)
  if (!token) {
    return null;
  }

  return (
    <div className="pc-root">
      <Header partnerName={partner?.name} onLogout={logout} />
      <div className="pc-container">
        <div className="pc-dashboard-grid">
          <Sidebar active={activeSection} onNavigate={handleNavigate} />
          <main className="pc-main-content">
            {activeSection === 'dashboard' && <DashboardSection />}
            {activeSection === 'profile' && <ProfileSection />}
            {activeSection === 'menu' && <MenuSection />}
            {activeSection === 'orders' && <OrdersSection />}
            {activeSection === 'analytics' && <AnalyticsSection />}
            {activeSection === 'offers' && <OffersSection />}
            {activeSection === 'scanner' && <QRScannerSection />}
          </main>
        </div>
      </div>

      {/* Offer modal */}
      <Modal id="offerModal" title={offerEditId ? 'Edit Offer' : 'Create New Offer'} show={showOfferModal} onClose={() => setShowOfferModal(false)} width={700}>
        <form onSubmit={saveOffer}>
          <div className="pc-form-group"><label>Offer Title *</label><input className="pc-form-input" required value={offerForm.title||''} onChange={e=>setOfferForm({...offerForm, title: e.target.value})} /></div>
          <div className="pc-form-group"><label>Service Type</label><select className="pc-form-input" value={offerForm.service_type||''} onChange={e=>setOfferForm({...offerForm, service_type: e.target.value})}><option value="">Select</option><option value="dining">Dining</option><option value="events">Events</option><option value="spa-and-salon">Spa & Salon</option><option value="wellness">Wellness</option><option value="travel">Travel</option><option value="healthcare">Healthcare</option><option value="others">Others</option></select></div>
          <div className="pc-form-grid"><div className="pc-form-group"><label>Start Date</label><input type="datetime-local" className="pc-form-input" value={offerForm.start_date||''} onChange={e=>setOfferForm({...offerForm, start_date: e.target.value})} /></div><div className="pc-form-group"><label>End Date</label><input type="datetime-local" className="pc-form-input" value={offerForm.end_date||''} onChange={e=>setOfferForm({...offerForm, end_date: e.target.value})} /></div></div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}><button type="button" className="btn btn-secondary" onClick={()=>setShowOfferModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save Offer</button></div>
        </form>
      </Modal>

      {/* Menu modal */}
      <Modal id="menuItemModal" title={menuEditId ? 'Edit Service' : 'Add Service'} show={showMenuModal} onClose={() => setShowMenuModal(false)}>
        <form onSubmit={saveMenuItem}>
          <div className="pc-form-group"><label>Service Type</label><select className="pc-form-input" value={menuForm.service_type||''} onChange={e=>setMenuForm({...menuForm, service_type: e.target.value})}><option value="">Select</option><option value="dining">Dining</option><option value="events">Events</option><option value="spa-and-salon">Spa & Salon</option><option value="wellness">Wellness</option><option value="travel">Travel</option><option value="others">Others</option></select></div>
          <div className="pc-form-group"><label>Service Name</label><input className="pc-form-input" required value={menuForm.name||''} onChange={e=>setMenuForm({...menuForm, name: e.target.value})} /></div>
          <div className="pc-form-group"><label>Price (₹)</label><input type="number" className="pc-form-input" value={menuForm.price||0} onChange={e=>setMenuForm({...menuForm, price: parseFloat(e.target.value||0)})} /></div>
          <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}><button type="button" className="btn btn-secondary" onClick={()=>setShowMenuModal(false)}>Cancel</button><button type="submit" className="btn btn-primary">Save</button></div>
        </form>
      </Modal>

    </div>
  );
}
