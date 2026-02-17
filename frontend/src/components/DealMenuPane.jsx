import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const DealMenuPane = ({ deal, isOpen, onClose }) => {
  const navigate = useNavigate();
  const [menuImages, setMenuImages] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen && deal?.partner_id) {
      loadMenuData();
    }
  }, [isOpen, deal?.partner_id]);

  const loadMenuData = async () => {
    try {
      setLoading(true);
      setError('');
      setMenuImages([]);
      setMenuItems([]);
      
      const token = localStorage.getItem('token');
      const partnerId = deal?.partner_id;
      
      if (!partnerId) {
        console.error('No partner_id found in deal:', deal);
        setError('Partner information is missing');
        setLoading(false);
        return;
      }

      console.log('🔍 Loading menu for partner:', partnerId, 'Deal:', deal?.title);
      
      // First, try to fetch menu images (preferred for restaurants)
      const menuImagesResponse = await fetch(`${API_BASE}/api/v1/partners/${partnerId}/menu-images`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      });

      console.log('📸 Menu images response status:', menuImagesResponse.status);

      if (menuImagesResponse.ok) {
        const menuImagesResult = await menuImagesResponse.json();
        console.log('📸 Menu images result:', menuImagesResult);
        
        if (menuImagesResult.success) {
          // Handle different response structures
          let images = [];
          if (menuImagesResult.data?.menu_images) {
            images = Array.isArray(menuImagesResult.data.menu_images) 
              ? menuImagesResult.data.menu_images 
              : [];
          } else if (Array.isArray(menuImagesResult.data)) {
            images = menuImagesResult.data;
          } else if (Array.isArray(menuImagesResult.menu_images)) {
            images = menuImagesResult.menu_images;
          }
          
          console.log('📸 Parsed menu images:', images.length, images);
          setMenuImages(images);
          
          // If we have menu images, we're done
          if (images.length > 0) {
            console.log('✅ Menu images loaded successfully:', images.length);
            setLoading(false);
            return;
          }
        } else {
          console.warn('⚠️ Menu images API returned success=false:', menuImagesResult);
        }
      } else {
        const errorData = await menuImagesResponse.json().catch(() => ({}));
        console.warn('⚠️ Menu images API error:', menuImagesResponse.status, errorData);
      }

      // If no menu images, try to fetch menu items as fallback
      console.log('🔄 Trying menu items as fallback...');
      const menuItemsResponse = await fetch(`${API_BASE}/api/v1/partners/${partnerId}/menu`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json'
        }
      });

      if (menuItemsResponse.ok) {
        const menuItemsResult = await menuItemsResponse.json();
        console.log('🍽️ Menu items result:', menuItemsResult);
        if (menuItemsResult.success && menuItemsResult.data) {
          const availableItems = Array.isArray(menuItemsResult.data) 
            ? menuItemsResult.data.filter(item => item.is_available !== false)
            : [];
          console.log('🍽️ Parsed menu items:', availableItems.length);
          setMenuItems(availableItems);
        }
      } else {
        const errorData = await menuItemsResponse.json().catch(() => ({}));
        console.warn('⚠️ Menu items API error:', menuItemsResponse.status, errorData);
      }
    } catch (err) {
      console.error('❌ Error loading menu:', err);
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatPrice = (price) => {
    if (!price) return '₹0';
    return `₹${parseFloat(price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatDate = (d) => {
    if (!d) return null;
    const date = new Date(d);
    return isNaN(date.getTime()) ? null : date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <div 
      className="deal-menu-pane-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="deal-menu-title"
    >
      <div className="deal-menu-pane" onClick={(e) => e.stopPropagation()}>
        <div className="deal-menu-pane-header">
          <div>
            <h2 id="deal-menu-title" className="deal-menu-pane-title">{deal?.title || 'Menu'}</h2>
            <p className="deal-menu-pane-subtitle">{deal?.partner_name || deal?.location || ''}</p>
          </div>
          <button
            className="deal-menu-pane-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            &times;
          </button>
        </div>

        {/* Deal details */}
        <div className="deal-menu-pane-details" style={{ padding: '0 1.25rem 1rem', borderBottom: '1px solid #eee' }}>
          {deal?.description && (
            <p className="deal-menu-pane-description" style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', color: '#374151', lineHeight: 1.5 }}>
              {deal.description}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', marginBottom: '0.75rem', fontSize: '0.9rem' }}>
            <span><strong>Price:</strong> {formatPrice(deal?.price)}</span>
            {(deal?.perk_type || deal?.perk_description) && (
              <span><strong>Perk:</strong> {deal.perk_description || (deal.perk_type === 'discount' ? 'Co-pay discount' : deal.perk_type || '—')}</span>
            )}
            {(deal?.start_date || deal?.end_date) && (
              <span><strong>Validity:</strong> {formatDate(deal.start_date) || '—'} to {formatDate(deal.end_date) || '—'}</span>
            )}
          </div>
          {/* Venue details */}
          <div className="deal-menu-pane-venue" style={{ background: '#f9fafb', padding: '0.75rem', borderRadius: 8, marginTop: '0.5rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.35rem', fontSize: '0.9rem' }}>Venue</div>
            {deal?.partner_name && <div style={{ fontSize: '0.9rem', color: '#111' }}>{deal.partner_name}</div>}
            {deal?.partner_address && <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>{deal.partner_address}</div>}
            {deal?.partner_id && (
              <div style={{ marginTop: '0.5rem' }}>
                <button
                  type="button"
                  className="card-link-btn"
                  style={{ padding: '0.35rem 0.75rem', fontSize: '0.85rem' }}
                  onClick={() => { onClose(); navigate(`/venue/${deal.partner_id}`); }}
                >
                  View venue &amp; get directions
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="deal-menu-pane-content" style={{ paddingTop: '1rem' }}>
          {(menuImages.length > 0 || menuItems.length > 0) && <h3 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Menu</h3>}
          {loading ? (
            <div className="deal-menu-loading">
              <p>Loading menu...</p>
            </div>
          ) : error ? (
            <div className="deal-menu-error">
              <p>{error}</p>
            </div>
          ) : menuImages.length > 0 ? (
            // Display menu images (horizontally scrollable)
            <div className="deal-menu-scroll-container">
              <div className="deal-menu-images">
                {menuImages.map((imageUrl, index) => {
                  // Handle both relative and absolute URLs
                  let fullImageUrl = imageUrl;
                  if (!imageUrl.startsWith('http')) {
                    // If it's a relative path, prepend API_BASE
                    fullImageUrl = imageUrl.startsWith('/') 
                      ? `${API_BASE}${imageUrl}`
                      : `${API_BASE}/${imageUrl}`;
                  }
                  
                  return (
                    <div key={index} className="deal-menu-image-item">
                      <img 
                        src={fullImageUrl}
                        alt={`${deal?.title || 'Menu'} - Page ${index + 1}`}
                        className="deal-menu-image"
                        loading="lazy"
                        onError={(e) => {
                          console.error('Failed to load menu image:', fullImageUrl);
                          e.target.style.display = 'none';
                        }}
                      />
                    </div>
                  );
                })}
              </div>
              <div className="deal-menu-images-count">
                {menuImages.length} menu {menuImages.length === 1 ? 'page' : 'pages'}
              </div>
            </div>
          ) : menuItems.length > 0 ? (
            // Fallback: Display menu items if no images
            <div className="deal-menu-scroll-container">
              <div className="deal-menu-items">
                {menuItems.map((item) => (
                  <div key={item.id} className="deal-menu-item">
                    {item.image_url && (
                      <div 
                        className="deal-menu-item-image"
                        style={{ backgroundImage: `url(${item.image_url})` }}
                        role="img"
                        aria-label={item.name}
                      />
                    )}
                    <div className="deal-menu-item-content">
                      <h4 className="deal-menu-item-name">{item.name}</h4>
                      {item.description && (
                        <p className="deal-menu-item-description">{item.description}</p>
                      )}
                      <div className="deal-menu-item-footer">
                        <span className="deal-menu-item-price">{formatPrice(item.price)}</span>
                        {item.category && (
                          <span className="deal-menu-item-category">{item.category}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="deal-menu-empty">
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🍽️</div>
              <p>No menu available</p>
              <p style={{ fontSize: '0.9rem', color: '#666', marginTop: '0.5rem' }}>
                Menu has not been uploaded yet
              </p>
            </div>
          )}
        </div>

        <div className="deal-menu-pane-footer">
          <button
            className="deal-menu-pane-book-btn"
            onClick={() => {
              onClose();
              // Trigger booking - parent will handle via event listener
              const event = new CustomEvent('bookDeal', { detail: deal });
              window.dispatchEvent(event);
            }}
          >
            Book Now
          </button>
        </div>
      </div>
    </div>
  );
};

export default DealMenuPane;

