import React, { useState, useEffect } from 'react';
import '../styles/auth.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

const DealMenuPane = ({ deal, isOpen, onClose }) => {
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

        <div className="deal-menu-pane-content">
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

