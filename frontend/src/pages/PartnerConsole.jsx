// PartnerConsole.jsx
// Drop this file in: /src/pages/PartnerConsole.jsx
// Create a CSS file alongside: /src/styles/partnerConsole.css (content included later in this doc)

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/partnerConsole.css';
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

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
  const [bookings, setBookings] = useState([]); // New: Bookings with QR codes
  const [offers, setOffers] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [scannerResult, setScannerResult] = useState(null);

  // Modals
  const [showOfferModal, setShowOfferModal] = useState(false);
  const [showMenuModal, setShowMenuModal] = useState(false);
  const [showRedemptionModal, setShowRedemptionModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [redemptionForm, setRedemptionForm] = useState({
    total_bill_amount: '',
    ezt_co_pay_amount: '',
    net_amount_from_user: '',
    redemption_notes: ''
  });
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

  async function loadBookings() {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/bookings`, { headers: headers() });
      const j = await r.json();
      if (j.success) setBookings(j.data?.bookings || []);
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
    if (section === 'orders') {
      loadOrders();
      loadBookings(); // Also load bookings
    }
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
        <div className="pc-content-header">
          <h1>Bookings & Vouchers</h1>
          <div>
            <select 
              className="pc-form-input" 
              style={{width: 'auto', marginRight: '10px'}}
              onChange={(e) => {
                const status = e.target.value;
                if (status) {
                  loadBookingsWithFilter(status);
                } else {
                  loadBookings();
                }
              }}
            >
              <option value="">All Status</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="redeemed">Redeemed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button className="btn btn-secondary" onClick={loadBookings}>Refresh</button>
          </div>
        </div>
        <div className="pc-table-container">
          <table className="pc-table">
            <thead>
              <tr>
                <th>Booking Ref</th>
                <th>Customer</th>
                <th>Deal/Event</th>
                <th>Date/Time</th>
                <th>Guests</th>
                <th>Amount</th>
                <th>QR Code</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {bookings.length === 0 ? (
                <tr><td colSpan={9} style={{textAlign:'center', padding:24}}>No bookings</td></tr>
              ) : bookings.map(b => (
                <tr key={b.id}>
                  <td style={{fontFamily:'monospace', fontSize:'0.85rem'}}>{b.booking_reference || b.id.substring(0,8)}</td>
                  <td>{b.customer_name || 'N/A'}</td>
                  <td>{b.deal_title || 'N/A'}</td>
                  <td>
                    {b.booking_date ? new Date(b.booking_date).toLocaleDateString() : 'N/A'}
                    {b.time_slot && <div style={{fontSize:'0.75rem', color:'#666'}}>{b.time_slot}</div>}
                  </td>
                  <td>{b.num_tickets || b.num_guests || 1}</td>
                  <td>₹{parseFloat(b.total_price || b.fiat_amount || 0).toFixed(2)}</td>
                  <td>
                    {b.qr_code_url ? (
                      <img 
                        src={b.qr_code_url} 
                        alt="QR Code" 
                        style={{width:'50px', height:'50px', cursor:'pointer', borderRadius:'4px'}}
                        onClick={() => {
                          setSelectedBooking(b);
                          setShowRedemptionModal(true);
                        }}
                        title="Click to redeem"
                      />
                    ) : (
                      <span style={{color:'#999', fontSize:'0.85rem'}}>No QR</span>
                    )}
                  </td>
                  <td><span className={`pc-badge pc-badge-${getStatusClass(b.status)}`}>{b.status}</span></td>
                  <td>
                    <div className="pc-actions">
                      {b.status === 'confirmed' && b.voucher_code && (
                        <button 
                          className="btn btn-sm btn-primary" 
                          onClick={() => {
                            setSelectedBooking(b);
                            setShowRedemptionModal(true);
                          }}
                        >
                          Redeem
                        </button>
                      )}
                      <button className="btn btn-sm btn-secondary" onClick={() => viewBooking(b.id)}>View</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  async function loadBookingsWithFilter(status) {
    if (!partner) return;
    try {
      const r = await fetch(`${API_BASE}/api/v1/partners/${partner.id}/bookings?status=${status}`, { headers: headers() });
      const j = await r.json();
      if (j.success) setBookings(j.data?.bookings || []);
    } catch (e) { console.error(e); }
  }

  function viewBooking(id) {
    const b = bookings.find(x => x.id === id);
    if (!b) return;
    alert(`Booking Details:\n\nReference: ${b.booking_reference}\nCustomer: ${b.customer_name}\nDeal: ${b.deal_title}\nStatus: ${b.status}\nAmount: ₹${b.total_price || b.fiat_amount}\nVoucher Code: ${b.voucher_code || 'N/A'}`);
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
          <div className="pc-form-group">
            <label>Voucher Code (UUID)</label>
            <input 
              ref={codeRef} 
              className="pc-form-input" 
              placeholder="Enter voucher code or scan QR"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  validateVoucher(codeRef.current.value);
                }
              }}
            />
          </div>
          <div style={{display:'flex', gap:10}}>
            <button className="btn btn-primary" onClick={() => validateVoucher(codeRef.current.value)}>Validate</button>
            <button className="btn btn-secondary" onClick={() => { codeRef.current.value=''; setScannerResult(null); }}>Reset</button>
          </div>
          <div style={{marginTop:20}}>
            {scannerResult && scannerResult.success ? (
              <div style={{padding:16, borderRadius:8, background:'#f0fdf4', border:'1px solid #10b981'}}>
                <div style={{marginBottom:8}}><strong>Voucher Code:</strong> {scannerResult.data.voucher_code}</div>
                <div style={{marginBottom:8}}><strong>Booking Reference:</strong> {scannerResult.data.booking_reference}</div>
                <div style={{marginBottom:8}}><strong>Status:</strong> {scannerResult.data.status}</div>
                <div style={{marginBottom:8}}><strong>Customer:</strong> {scannerResult.data.customer_name || 'N/A'}</div>
                <div style={{marginBottom:8}}><strong>Amount:</strong> ₹{scannerResult.data.total_price || scannerResult.data.fiat_amount || 0}</div>
                {scannerResult.data.status === 'confirmed' && (
                  <div style={{marginTop:10}}>
                    <button 
                      className="btn btn-primary" 
                      onClick={() => {
                        // Find booking and open redemption modal
                        const booking = bookings.find(b => b.voucher_code === scannerResult.data.voucher_code);
                        if (booking) {
                          setSelectedBooking(booking);
                          setShowRedemptionModal(true);
                        } else {
                          // If not in list, create a booking object from scanner result
                          setSelectedBooking({
                            id: scannerResult.data.booking_id,
                            voucher_code: scannerResult.data.voucher_code,
                            booking_reference: scannerResult.data.booking_reference,
                            customer_name: scannerResult.data.customer_name,
                            deal_title: scannerResult.data.deal_title,
                            total_price: scannerResult.data.total_price || scannerResult.data.fiat_amount
                          });
                          setShowRedemptionModal(true);
                        }
                      }}
                    >
                      Redeem Voucher
                    </button>
                  </div>
                )}
              </div>
            ) : scannerResult && !scannerResult.success ? (
              <div style={{padding:16, borderRadius:8, background:'#fee2e2', border:'1px solid #ef4444', color:'#991b1b'}}>
                {scannerResult.error || 'Invalid voucher'}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  async function validateVoucher(voucherCode) {
    if (!voucherCode || voucherCode.trim() === '') {
      setScannerResult({ success: false, error: 'Please enter a voucher code' });
      return;
    }

    try {
      // First, try to get redemption by voucher code
      const r = await fetch(`${API_BASE}/api/v1/redemptions/voucher/${voucherCode}`, { headers: headers() });
      const j = await r.json();
      
      if (j.success && j.data) {
        // Already redeemed
        setScannerResult({ 
          success: true, 
          data: {
            voucher_code: j.data.voucher_code,
            booking_reference: j.data.booking_reference,
            status: 'redeemed',
            redeemed_at: j.data.redeemed_at
          }
        });
        showNotification('Voucher already redeemed', 'warning');
        return;
      }

      // If not redeemed, try to find booking by voucher code
      // We'll search in bookings list or make a direct query
      const booking = bookings.find(b => b.voucher_code === voucherCode);
      if (booking) {
        setScannerResult({ 
          success: true, 
          data: {
            voucher_code: booking.voucher_code,
            booking_reference: booking.booking_reference,
            booking_id: booking.id,
            customer_name: booking.customer_name,
            deal_title: booking.deal_title,
            total_price: booking.total_price || booking.fiat_amount,
            status: booking.status
          }
        });
      } else {
        // Try to fetch booking details from API
        // Note: We'd need an endpoint to get booking by voucher_code
        // For now, show error
        setScannerResult({ success: false, error: 'Voucher not found in your bookings' });
      }
    } catch (e) { 
      console.error('Validate voucher error:', e);
      setScannerResult({ success: false, error: 'Error validating voucher' });
    }
  }

  function getStatusClass(status) {
    const mapping = { 
      pending: 'warning', 
      confirmed: 'secondary', 
      redeemed: 'success',
      preparing: 'warning', 
      ready: 'success', 
      completed: 'success', 
      cancelled: 'error' 
    };
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

  async function handleRedemptionSubmit(e) {
    e.preventDefault();
    if (!selectedBooking || !selectedBooking.voucher_code) {
      showNotification('Invalid booking selected', 'error');
      return;
    }

    // Validate financial amounts
    const totalBill = parseFloat(redemptionForm.total_bill_amount);
    const eztCoPay = parseFloat(redemptionForm.ezt_co_pay_amount);
    const netAmount = parseFloat(redemptionForm.net_amount_from_user);

    if (!totalBill || !eztCoPay || !netAmount) {
      showNotification('Please fill all financial fields', 'error');
      return;
    }

    if (Math.abs(netAmount - (totalBill - eztCoPay)) > 0.01) {
      showNotification('Net amount must equal Total Bill - EZT Co-Pay', 'error');
      return;
    }

    try {
      const response = await fetch(`${API_BASE}/api/v1/redemptions/redeem`, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({
          voucher_code: selectedBooking.voucher_code,
          total_bill_amount: totalBill,
          ezt_co_pay_amount: eztCoPay,
          net_amount_from_user: netAmount,
          redemption_notes: redemptionForm.redemption_notes || null
        })
      });

      const result = await response.json();

      if (result.success) {
        showNotification('Voucher redeemed successfully!', 'success');
        setShowRedemptionModal(false);
        setSelectedBooking(null);
        setRedemptionForm({
          total_bill_amount: '',
          ezt_co_pay_amount: '',
          net_amount_from_user: '',
          redemption_notes: ''
        });
        // Reload bookings to show updated status
        loadBookings();
        loadDashboard();
      } else {
        showNotification(result.error || 'Redemption failed', 'error');
      }
    } catch (error) {
      console.error('Redemption error:', error);
      showNotification('Network error. Please try again.', 'error');
    }
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

      {/* Redemption Modal with Financial Capture */}
      <Modal 
        id="redemptionModal" 
        title="Redeem Voucher" 
        show={showRedemptionModal} 
        onClose={() => {
          setShowRedemptionModal(false);
          setSelectedBooking(null);
          setRedemptionForm({
            total_bill_amount: '',
            ezt_co_pay_amount: '',
            net_amount_from_user: '',
            redemption_notes: ''
          });
        }} 
        width={600}
      >
        {selectedBooking && (
          <form onSubmit={handleRedemptionSubmit}>
            {/* Booking Info */}
            <div style={{background:'#f3f4f6', padding:'1rem', borderRadius:'8px', marginBottom:'1.5rem'}}>
              <div style={{marginBottom:'0.5rem'}}><strong>Booking Reference:</strong> {selectedBooking.booking_reference}</div>
              <div style={{marginBottom:'0.5rem'}}><strong>Customer:</strong> {selectedBooking.customer_name || 'N/A'}</div>
              <div style={{marginBottom:'0.5rem'}}><strong>Deal:</strong> {selectedBooking.deal_title || 'N/A'}</div>
              <div style={{marginBottom:'0.5rem'}}><strong>Voucher Code:</strong> <span style={{fontFamily:'monospace', fontSize:'0.9rem'}}>{selectedBooking.voucher_code}</span></div>
              {selectedBooking.qr_code_url && (
                <div style={{marginTop:'1rem', textAlign:'center'}}>
                  <img src={selectedBooking.qr_code_url} alt="QR Code" style={{width:'150px', height:'150px', border:'2px solid #ddd', borderRadius:'8px'}} />
                </div>
              )}
            </div>

            {/* Financial Capture Fields */}
            <div style={{marginBottom:'1.5rem'}}>
              <h3 style={{marginBottom:'1rem', fontSize:'1.1rem', color:'#374151'}}>Financial Details</h3>
              
              <div className="pc-form-group">
                <label>Total Bill Amount (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="pc-form-input" 
                  required 
                  value={redemptionForm.total_bill_amount} 
                  onChange={(e) => {
                    const total = parseFloat(e.target.value) || 0;
                    const ezt = parseFloat(redemptionForm.ezt_co_pay_amount) || 0;
                    const net = Math.max(0, total - ezt);
                    setRedemptionForm({
                      ...redemptionForm,
                      total_bill_amount: e.target.value,
                      net_amount_from_user: net.toFixed(2)
                    });
                  }}
                  placeholder="Enter total bill amount"
                />
              </div>

              <div className="pc-form-group">
                <label>EZT Co-Pay Amount (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="pc-form-input" 
                  required 
                  value={redemptionForm.ezt_co_pay_amount} 
                  onChange={(e) => {
                    const ezt = parseFloat(e.target.value) || 0;
                    const total = parseFloat(redemptionForm.total_bill_amount) || 0;
                    const net = Math.max(0, total - ezt);
                    setRedemptionForm({
                      ...redemptionForm,
                      ezt_co_pay_amount: e.target.value,
                      net_amount_from_user: net.toFixed(2)
                    });
                  }}
                  placeholder="Amount payable by EZT"
                />
              </div>

              <div className="pc-form-group">
                <label>Net Amount from User (₹) *</label>
                <input 
                  type="number" 
                  step="0.01"
                  className="pc-form-input" 
                  required 
                  readOnly
                  value={redemptionForm.net_amount_from_user} 
                  style={{background:'#f9fafb', color:'#6b7280'}}
                  placeholder="Auto-calculated"
                />
                <div style={{fontSize:'0.85rem', color:'#6b7280', marginTop:'0.25rem'}}>
                  = Total Bill - EZT Co-Pay
                </div>
              </div>

              <div className="pc-form-group">
                <label>Redemption Notes (Optional)</label>
                <textarea 
                  className="pc-form-input" 
                  rows={3}
                  value={redemptionForm.redemption_notes} 
                  onChange={(e) => setRedemptionForm({...redemptionForm, redemption_notes: e.target.value})}
                  placeholder="Any additional notes about this redemption"
                />
              </div>
            </div>

            {/* Validation Message */}
            {redemptionForm.total_bill_amount && redemptionForm.ezt_co_pay_amount && 
             parseFloat(redemptionForm.net_amount_from_user) !== (parseFloat(redemptionForm.total_bill_amount) - parseFloat(redemptionForm.ezt_co_pay_amount)) && (
              <div style={{padding:'0.75rem', background:'#fee2e2', color:'#991b1b', borderRadius:'6px', marginBottom:'1rem', fontSize:'0.9rem'}}>
                ⚠️ Net amount must equal Total Bill - EZT Co-Pay
              </div>
            )}

            <div style={{display:'flex', gap:8, justifyContent:'flex-end', marginTop:16}}>
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => {
                  setShowRedemptionModal(false);
                  setSelectedBooking(null);
                  setRedemptionForm({
                    total_bill_amount: '',
                    ezt_co_pay_amount: '',
                    net_amount_from_user: '',
                    redemption_notes: ''
                  });
                }}
              >
                Cancel
              </button>
              <button 
                type="submit" 
                className="btn btn-primary"
                disabled={
                  !redemptionForm.total_bill_amount || 
                  !redemptionForm.ezt_co_pay_amount || 
                  !redemptionForm.net_amount_from_user ||
                  parseFloat(redemptionForm.net_amount_from_user) !== (parseFloat(redemptionForm.total_bill_amount) - parseFloat(redemptionForm.ezt_co_pay_amount))
                }
              >
                Redeem Voucher
              </button>
            </div>
          </form>
        )}
      </Modal>

    </div>
  );
}
