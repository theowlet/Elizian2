import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DealMenuPane from "../components/DealMenuPane";

const HomePage = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';
  const navigate = useNavigate();
  
  const [currentSection, setCurrentSection] = useState("home");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showNearMe, setShowNearMe] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Single source of truth: all deals fetched once
  const [allDeals, setAllDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState({});
  const [currentLocation, setCurrentLocation] = useState("");
  const [userCoordinates, setUserCoordinates] = useState({ latitude: null, longitude: null });
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [isMenuPaneOpen, setIsMenuPaneOpen] = useState(false);

  const categories = [
    { id: "all", name: "All Experiences", icon: "🌟" },
    { id: "dining", name: "Dining", icon: "🍽️" },
    { id: "events", name: "Events", icon: "🎉" },
    { id: "healthcare", name: "Healthcare", icon: "🩺" },
    { id: "spa", name: "Spa & Salon", icon: "💆" },
    { id: "wellness", name: "Wellness", icon: "🧘" },
    { id: "travel", name: "Travel", icon: "✈️" },
    { id: "others", name: "Others", icon: "📦" },
  ];

  const filters = [
    { id: "distance", name: "Distance", icon: "📍" },
    { id: "discount", name: "Discount", icon: "💰" },
    { id: "rating", name: "Rating", icon: "⭐" },
    { id: "price", name: "Price", icon: "💲" },
  ];

  // ============================================
  // CATEGORY TO SERVICE TYPE MAPPING
  // ============================================
  const categoryToServiceType = {
    'dining': 'dining',
    'events': 'events',
    'healthcare': 'healthcare',
    'spa': 'spa-and-salon', // CRITICAL: Frontend 'spa' → Backend 'spa-and-salon'
    'wellness': 'wellness',
    'travel': 'travel',
    'others': 'others'
  };

  // ============================================
  // DISTANCE CALCULATION HELPERS
  // ============================================
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const formatDistance = (distanceKm) => {
    if (distanceKm < 1) {
      return `${(distanceKm * 1000).toFixed(0)} m away`;
    }
    return `${distanceKm.toFixed(1)} km away`;
  };

  // ============================================
  // PURE HELPER FUNCTIONS (Section-specific filtering)
  // ============================================

  /**
   * Get trending deals filtered by category
   * ONLY affects Trending Experiences section
   */
  const getTrendingDeals = (deals, selectedCategory) => {
    if (!deals || deals.length === 0) return [];
    
    // Filter by is_trending flag
    let trending = deals.filter(deal => deal.is_trending === true || deal.featured === true);
    
    // Apply category filter if not "all"
    if (selectedCategory !== 'all') {
      const expectedServiceType = categoryToServiceType[selectedCategory];
      if (expectedServiceType) {
        trending = trending.filter(deal => deal.service_type === expectedServiceType);
      }
    }
    
    return trending;
  };

  /**
   * Get top restaurants near user
   * NOT affected by category filter - always shows ALL dining deals
   * Sorted by distance ASC (nearest first) if location available
   * Limited to 25km radius if location available, otherwise shows all
   * Shows ALL dining deals (not limited to top 5)
   */
  const getTopRestaurants = (deals, userLat, userLon) => {
    if (!deals || deals.length === 0) {
      console.log('⚠️ [getTopRestaurants] No deals available');
      return [];
    }
    
    // Filter ONLY dining deals
    let restaurants = deals.filter(deal => {
      const isDining = deal.service_type === 'dining';
      if (!isDining) {
        console.log(`⚠️ [getTopRestaurants] Skipping non-dining deal: ${deal.title} (service_type: ${deal.service_type})`);
      }
      return isDining;
    });
    
    console.log(`✅ [getTopRestaurants] Found ${restaurants.length} dining deals out of ${deals.length} total deals`);
    
    // Calculate and add distance for each restaurant
    if (userLat && userLon) {
      console.log(`📍 [getTopRestaurants] User location available: ${userLat}, ${userLon}`);
      
      restaurants = restaurants.map(deal => {
        const dealLat = deal.latitude || deal.partner_latitude;
        const dealLon = deal.longitude || deal.partner_longitude;
        
        if (!dealLat || !dealLon) {
          // Deal has no location - include it but mark as "N/A"
          return {
            ...deal,
            distanceKm: Infinity,
            distanceFormatted: 'Location not available'
          };
        }
        
        const distance = calculateDistance(userLat, userLon, dealLat, dealLon);
        return {
          ...deal,
          distanceKm: distance,
          distanceFormatted: formatDistance(distance)
        };
      });
      
      // Filter by 25km radius (but keep deals without location)
      const withinRadius = restaurants.filter(r => r.distanceKm <= 25);
      const withoutLocation = restaurants.filter(r => !isFinite(r.distanceKm));
      
      restaurants = [...withinRadius, ...withoutLocation];
      
      // Sort by distance ASC (nearest first), deals without location go to end
      restaurants.sort((a, b) => {
        if (!isFinite(a.distanceKm)) return 1;
        if (!isFinite(b.distanceKm)) return -1;
        return a.distanceKm - b.distanceKm;
      });
      
      console.log(`✅ [getTopRestaurants] After filtering: ${withinRadius.length} within 25km, ${withoutLocation.length} without location`);
    } else {
      // If no user location, show ALL dining deals (without distance sorting)
      console.log('⚠️ [getTopRestaurants] No user location - showing all dining deals');
      restaurants = restaurants.map(deal => ({
        ...deal,
        distanceKm: Infinity,
        distanceFormatted: 'Distance unavailable'
      }));
    }
    
    console.log(`✅ [getTopRestaurants] Returning ${restaurants.length} restaurants`);
    return restaurants;
  };

  /**
   * Get live/ongoing events
   * NOT affected by category filter - always shows Events only
   * Event start_date <= now <= end_date (if end_date exists)
   */
  const getLiveEvents = (deals) => {
    if (!deals || deals.length === 0) return [];
    
    const now = new Date();
    
    // Filter ONLY events
    let events = deals.filter(deal => deal.service_type === 'events');
    
    // Filter for ongoing events
    events = events.filter(event => {
      if (!event.start_date) return false;
      
      const startDate = new Date(event.start_date);
      const endDate = event.end_date ? new Date(event.end_date) : null;
      
      // Event has started (start_date <= now) and hasn't ended yet
      return startDate <= now && (!endDate || endDate >= now);
    });
    
    return events.slice(0, 5); // Top 5 live events
  };

  /**
   * Get upcoming events
   * NOT affected by category filter - always shows Events only
   * Event start_date > now
   * Sorted by start_date ASC
   */
  const getUpcomingEvents = (deals) => {
    if (!deals || deals.length === 0) return [];
    
    const now = new Date();
    
    // Filter ONLY events
    let events = deals.filter(deal => deal.service_type === 'events');
    
    // Filter for upcoming events (start_date > now)
    events = events.filter(event => {
      if (!event.start_date) return false;
      const startDate = new Date(event.start_date);
      return startDate > now;
    });
    
    // Sort by start_date ASC
    events.sort((a, b) => {
      const dateA = new Date(a.start_date);
      const dateB = new Date(b.start_date);
      return dateA - dateB;
    });
    
    return events.slice(0, 5); // Top 5 upcoming events
  };

  /**
   * Get all partner deals
   * Affected by category filter
   * Shows all deals (trending + non-trending) filtered by category
   */
  const getAllPartnerDeals = (deals, selectedCategory) => {
    if (!deals || deals.length === 0) return [];
    
    let allDeals = [...deals];
    
    // Apply category filter if not "all"
    if (selectedCategory !== 'all') {
      const expectedServiceType = categoryToServiceType[selectedCategory];
      if (expectedServiceType) {
        allDeals = allDeals.filter(deal => deal.service_type === expectedServiceType);
      }
    }
    
    return allDeals;
  };

  // ============================================
  // MEMOIZED SECTION DATA (Derived from allDeals)
  // ============================================
  
  const trendingDeals = useMemo(() => 
    getTrendingDeals(allDeals, activeCategory),
    [allDeals, activeCategory]
  );

  const topRestaurants = useMemo(() => 
    getTopRestaurants(allDeals, userCoordinates.latitude, userCoordinates.longitude),
    [allDeals, userCoordinates.latitude, userCoordinates.longitude]
  );

  const liveEvents = useMemo(() => 
    getLiveEvents(allDeals),
    [allDeals]
  );

  const upcomingEvents = useMemo(() => 
    getUpcomingEvents(allDeals),
    [allDeals]
  );

  const allPartnerDeals = useMemo(() => 
    getAllPartnerDeals(allDeals, activeCategory),
    [allDeals, activeCategory]
  );

  // ============================================
  // DATA FETCHING
  // ============================================

  /**
   * Fetch all deals once (single source of truth)
   */
  const loadAllDeals = async () => {
    try {
      setLoading(true);
      const url = `${API_BASE}/api/v1/offers?limit=100&is_active=true`;
      
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        // Format deals with consistent structure
        const formattedDeals = result.data.map((item) => ({
          id: item.id,
          title: item.title || item.name,
          description: item.description,
          price: item.discounted_price || item.original_price || 0,
          originalPrice: item.original_price,
          image: item.image_url || "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
          service_type: item.service_type || "others",
          is_trending: item.is_trending || item.featured || false,
          featured: item.featured || false,
          rating: item.rating || item.partner_rating || 4.5,
          location: item.partner_name || item.location,
          latitude: item.latitude || item.partner_latitude,
          longitude: item.longitude || item.partner_longitude,
          start_date: item.start_date,
          end_date: item.end_date,
          partner_id: item.partner_id, // CRITICAL: Include partner_id for menu fetching
          partner_name: item.partner_name,
          category_name: item.category_name,
        }));
        
        setAllDeals(formattedDeals);
        console.log(`✅ Loaded ${formattedDeals.length} deals`);
      } else {
        setAllDeals([]);
      }
    } catch (error) {
      console.error("Error loading deals:", error);
      setAllDeals([]);
    } finally {
      setLoading(false);
    }
  };

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserCoordinates({ latitude, longitude });
          
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`)
            .then(response => response.json())
            .then(data => {
              const city = data.address.city || data.address.town || data.address.village || "Unknown City";
              const country = data.address.country || "Unknown Country";
              setCurrentLocation(`${city}, ${country}`);
              localStorage.setItem('userLocation', `${city}, ${country}`);
            })
            .catch(() => {
              setCurrentLocation("Mumbai, India");
            });
        },
        () => {
          const savedLocation = localStorage.getItem('userLocation');
          setCurrentLocation(savedLocation || "Mumbai, India");
        }
      );
    } else {
      const savedLocation = localStorage.getItem('userLocation');
      setCurrentLocation(savedLocation || "Mumbai, India");
    }
  };

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem('user') || '{}');
    setUser(userData);
    
    getUserLocation();
    loadAllDeals();
    
    // Listen for book deal event from menu pane
    const handleBookDealEvent = (e) => {
      handleBookDeal(e.detail);
    };
    window.addEventListener('bookDeal', handleBookDealEvent);
    
    return () => {
      window.removeEventListener('bookDeal', handleBookDealEvent);
    };
  }, []);

  // Helper function to check if token is expired
  const isTokenExpired = (token) => {
    if (!token) return true;
    try {
      const payload = JSON.parse(atob(token.split(".")[1]));
      return payload.exp * 1000 < Date.now();
    } catch (error) {
      return true;
    }
  };

  // Check if user is authenticated
  const isAuthenticated = () => {
    const token = localStorage.getItem("token");
    return !!token && !isTokenExpired(token);
  };

  // Handle clicking on a deal card to open menu
  const handleDealCardClick = (deal, e) => {
    // Don't open menu if clicking on the "Book Now" button
    if (e.target.closest('.card-action-btn')) {
      return;
    }
    setSelectedDeal(deal);
    setIsMenuPaneOpen(true);
  };

  // Handle booking a deal
  const handleBookDeal = (deal) => {
    // Check authentication first
    if (!isAuthenticated()) {
      // Store deal info for resuming booking after login
      sessionStorage.setItem('pendingBooking', JSON.stringify({
        dealId: deal.id,
        dealTitle: deal.title,
        serviceType: deal.service_type,
        partnerId: deal.partner_id,
        redirectPath: `/home`
      }));
      // Redirect to login with return path
      navigate('/login', { 
        state: { 
          from: { pathname: '/home' },
          bookingDealId: deal.id 
        } 
      });
      return;
    }

    // User is authenticated - proceed with booking
    // For dining deals, navigate to restaurant booking
    if (deal.service_type === 'dining') {
      // Navigate to booking page or open booking modal
      // For now, navigate to a booking route with deal info
      navigate(`/events/booking`, { 
        state: { 
          deal: deal,
          dealId: deal.id,
          serviceType: 'dining'
        } 
      });
    } 
    // For events, navigate to event booking
    else if (deal.service_type === 'events') {
      navigate(`/events/booking`, { 
        state: { 
          deal: deal,
          dealId: deal.id,
          serviceType: 'events'
        } 
      });
    } 
    // For other types, use generic booking
    else {
      navigate(`/events/booking`, { 
        state: { 
          deal: deal,
          dealId: deal.id,
          serviceType: deal.service_type || 'others'
        } 
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('token');
    navigate('/login');
  };

  const handleNavigation = (section) => {
    setCurrentSection(section);
    setMobileMenuOpen(false);
    if (section === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  // Format price for display
  const formatPrice = (price) => {
    if (!price) return '₹0';
    return `₹${parseFloat(price).toLocaleString('en-IN')}`;
  };

  return (
    <div className="elizian-container">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="top-nav">
        <div className="container nav-container">
          <div 
            className="elizian-landing-logo"
            onClick={() => navigate('/')}
            style={{ cursor: 'pointer' }}
          >
            <img
              src="/assets/z.png"
              alt="Elizian"
              className="elizian-landing-logo-img"
            />
            <span className="elizian-landing-logo-text">Elizian</span>
          </div>

          <nav className="desktop-nav">
            <a
              href="#"
              className={`nav-link ${currentSection === "home" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("home");
              }}
            >
              Home
            </a>
            <a
              href="#"
              className={`nav-link ${currentSection === "experiences" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("experiences");
              }}
            >
              Experiences
            </a>
            <a
              href="#"
              className={`nav-link ${currentSection === "restaurants" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("restaurants");
              }}
            >
              Restaurants
            </a>
            <a
              href="#"
              className={`nav-link ${currentSection === "events" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("events");
              }}
            >
              Events
            </a>
            <a
              href="#"
              className={`nav-link ${currentSection === "profile" ? "active" : ""}`}
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("profile");
              }}
            >
              Profile
            </a>
            <a
              href="#"
              className="nav-link"
              onClick={(e) => {
                e.preventDefault();
                navigate('/bookings');
              }}
            >
              My Bookings
            </a>
          </nav>

          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            <span className="menu-icon">☰</span>
          </button>

          <div className="user-actions">
            {user?.first_name ? (
              <>
                <span className="welcome-text">Welcome, {user.first_name} {user.last_name || ''}</span>
                <button 
                  className="btn btn-secondary" 
                  onClick={() => navigate('/bookings')}
                  style={{ marginRight: '0.5rem' }}
                >
                  My Bookings
                </button>
                <button className="btn btn-primary" onClick={handleLogout}>
                  Logout
                </button>
              </>
            ) : (
              <>
                <button className="btn btn-primary" onClick={() => navigate('/login')}>
                  Login
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/signup')}>
                  Sign Up
                </button>
              </>
            )}
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="mobile-nav-menu">
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("home");
              }}
            >
              Home
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("experiences");
              }}
            >
              Experiences
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("restaurants");
              }}
            >
              Restaurants
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("events");
              }}
            >
              Events
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                handleNavigation("profile");
              }}
            >
              Profile
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={(e) => {
                e.preventDefault();
                navigate('/bookings');
              }}
            >
              My Bookings
            </a>
            {user?.first_name && (
              <a
                href="#"
                className="mobile-nav-link"
                onClick={(e) => {
                  e.preventDefault();
                  handleLogout();
                }}
              >
                Logout
              </a>
            )}
          </div>
        )}
      </header>

      <div className="location-bar">
        <div className="container">
          <div className="location-selector">
            <span className="location-icon">📍</span>
            <div className="location-details">
              <div className="location-main">
                {currentLocation}
               {!currentLocation && <span className="dropdown-arrow">▼</span>}
              </div>
              {!currentLocation && <div className="location-sub">Detecting your location...</div>}
            </div>
          </div>
        </div>
      </div>

      <main id="main-content" className="main-content">
        <div className="container">
          <section className="search-section">
            <div className="search-wrapper">
              <div className="search-input-group">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search restaurants, events, cuisines..."
                  aria-label="Search experiences"
                />
                <button
                  className={`filter-toggle ${activeFilter ? "active" : ""}`}
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  aria-label="Toggle filters"
                >
                  <span className="filter-icon">⚙️</span>
                  {activeFilter && <span className="filter-badge">•</span>}
                </button>
              </div>

              {isFilterOpen && (
                <div className="filter-panel">
                  <div className="filter-header">
                    <h4>Filters</h4>
                    <button
                      className="clear-filters"
                      onClick={() => setActiveFilter(null)}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="filter-options">
                    {filters.map((filter) => (
                      <button
                        key={filter.id}
                        className={`filter-chip ${activeFilter === filter.id ? "active" : ""}`}
                        onClick={() => setActiveFilter(filter.id)}
                        aria-pressed={activeFilter === filter.id}
                      >
                        <span className="filter-chip-icon">{filter.icon}</span>
                        <span>{filter.name}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          <section className="category-section">
            <div className="categories-scroll">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-chip ${activeCategory === category.id ? "active" : ""}`}
                  onClick={() => setActiveCategory(category.id)}
                  aria-label={`Filter by ${category.name}`}
                  aria-pressed={activeCategory === category.id}
                >
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ============================================
              1. TRENDING EXPERIENCES (Affected by category filter)
              ============================================ */}
          <section className="trending-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🔥</span>
                Trending Experiences
              </h2>
              <div className="section-controls">
                <button
                  className={`near-me-toggle ${showNearMe ? "active" : ""}`}
                  onClick={() => setShowNearMe(!showNearMe)}
                  aria-pressed={showNearMe}
                >
                  <span className="toggle-icon">📍</span>
                  <span>Near Me</span>
                </button>
                <span className="section-subtitle">Popular this week</span>
              </div>
            </div>

            {loading ? (
              <div className="loading-state">
                <p>Loading experiences...</p>
              </div>
            ) : trendingDeals.length === 0 ? (
              <div className="empty-state">
                <p>No trending experiences found{activeCategory !== 'all' ? ` in ${categories.find(c => c.id === activeCategory)?.name}` : ''}.</p>
              </div>
            ) : (
              <div className="trending-grid">
                {trendingDeals.map((item) => (
                  <div key={item.id} className="trending-card">
                    <div
                      className="card-image"
                      style={{ backgroundImage: `url(${item.image})` }}
                      role="img"
                      aria-label={item.title}
                    >
                      <div className="card-badge trending">Trending</div>
                      <div className="card-rating">
                        <span className="rating-star">⭐</span>
                        <span>{item.rating}</span>
                      </div>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{item.title}</h3>
                      <p className="card-description">{item.description}</p>
                      <div className="card-footer">
                        <div className="card-price">
                          {formatPrice(item.price)}
                          {item.originalPrice && item.originalPrice > item.price && (
                            <span className="original-price">{formatPrice(item.originalPrice)}</span>
                          )}
                        </div>
                        <button 
                          className="card-action-btn"
                          onClick={() => handleBookDeal(item)}
                        >
                          Book Now
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================
              2. TOP RESTAURANTS NEAR YOU (NOT affected by category filter)
              ============================================ */}
          <section className="restaurants-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🍽️</span>
                Top Restaurants Near You
              </h2>
              <button 
                className="view-all-btn"
                onClick={() => {
                  setActiveCategory('dining');
                  // Scroll to All Partner Deals section
                  setTimeout(() => {
                    document.getElementById('all-partner-deals')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
              >
                View All →
              </button>
            </div>

            {loading ? (
              <div className="loading-state">
                <p>Loading restaurants...</p>
              </div>
            ) : topRestaurants.length === 0 ? (
              <div className="empty-state">
                <p>No restaurants found near you.</p>
              </div>
            ) : (
              <div className="restaurants-grid">
                {topRestaurants.map((restaurant) => (
                  <div 
                    key={restaurant.id} 
                    className="restaurant-card"
                    onClick={(e) => handleDealCardClick(restaurant, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      className="restaurant-image"
                      style={{ backgroundImage: `url(${restaurant.image})` }}
                      role="img"
                      aria-label={restaurant.title}
                    >
                      <div className="restaurant-rating">
                        <span className="rating-star">⭐</span>
                        <span>{restaurant.rating}</span>
                      </div>
                    </div>
                    <div className="restaurant-info">
                      <div className="restaurant-header">
                        <h3 className="restaurant-name">{restaurant.title}</h3>
                        <div className="restaurant-price-range">
                          {restaurant.priceRange || "$$"}
                        </div>
                      </div>
                      <p className="restaurant-cuisine">{restaurant.category_name || "Multi-cuisine"}</p>
                      <div className="restaurant-meta">
                        <span className="restaurant-distance">
                          {restaurant.distanceFormatted || "N/A"}
                        </span>
                        <span className="restaurant-action">
                          <button 
                            className="btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleBookDeal(restaurant);
                            }}
                          >
                            Book Now
                          </button>
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================
              3. LIVE NOW (NOT affected by category filter - Events only)
              ============================================ */}
          <section className="events-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🎪</span>
                Live Now
              </h2>
              <span className="section-subtitle">
                Events happening right now
              </span>
            </div>

            {loading ? (
              <div className="loading-state">
                <p>Loading live events...</p>
              </div>
            ) : liveEvents.length === 0 ? (
              <div className="empty-state">
                <p>No live events at the moment.</p>
              </div>
            ) : (
              <div className="events-grid">
                {liveEvents.map((event) => (
                  <div 
                    key={event.id} 
                    className="event-card"
                    onClick={(e) => handleDealCardClick(event, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      className="event-image"
                      style={{ backgroundImage: `url(${event.image})` }}
                      role="img"
                      aria-label={event.title}
                    >
                      <div className="event-badge live">LIVE</div>
                    </div>
                    <div className="event-info">
                      <div className="event-header">
                        <h3 className="event-title">{event.title}</h3>
                        <div className="event-type">{event.category_name || "General"}</div>
                      </div>
                      <div className="event-meta">
                        <div className="event-time">
                          <span className="time-icon">🕒</span>
                          <span>
                            {event.start_date ? new Date(event.start_date).toLocaleDateString("en-IN", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            }) : "Ongoing"}
                          </span>
                        </div>
                        <div className="event-location">
                          <span className="location-icon">📍</span>
                          <span>{event.location || event.partner_name || "Downtown"}</span>
                        </div>
                      </div>
                      <button 
                        className="btn btn-primary event-action"
                        onClick={() => handleBookDeal(event)}
                      >
                        Join Now
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================
              4. UPCOMING EVENTS (NOT affected by category filter - Events only)
              ============================================ */}
          <section className="upcoming-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🎭</span>
                Upcoming Events
              </h2>
              <button 
                className="view-all-btn"
                onClick={() => {
                  setActiveCategory('events');
                  // Scroll to All Partner Deals section
                  setTimeout(() => {
                    document.getElementById('all-partner-deals')?.scrollIntoView({ behavior: 'smooth' });
                  }, 100);
                }}
              >
                View All →
              </button>
            </div>

            {loading ? (
              <div className="loading-state">
                <p>Loading upcoming events...</p>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="empty-state">
                <p>No upcoming events scheduled.</p>
              </div>
            ) : (
              <div className="events-scroll">
                {upcomingEvents.map((event) => (
                  <div 
                    key={`upcoming-${event.id}`} 
                    className="event-scroll-card"
                    onClick={(e) => handleDealCardClick(event, e)}
                    style={{ cursor: 'pointer' }}
                  >
                    <div
                      className="event-scroll-image"
                      style={{ backgroundImage: `url(${event.image})` }}
                      role="img"
                      aria-label={event.title}
                    ></div>
                    <div className="event-scroll-content">
                      <h4>{event.title}</h4>
                      <p>
                        {event.category_name || "General"} • {event.start_date ? new Date(event.start_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Coming Soon"}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================
              5. ALL PARTNER DEALS (Affected by category filter)
              ============================================ */}
          <section id="all-partner-deals" className="deals-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🎁</span>
                All Partner Deals
              </h2>
              <span className="section-subtitle">Discover amazing offers</span>
            </div>

            {loading ? (
              <div className="loading-state">
                <p>Loading deals...</p>
              </div>
            ) : allPartnerDeals.length === 0 ? (
              <div className="empty-state">
                <p>No deals available{activeCategory !== 'all' ? ` in ${categories.find(c => c.id === activeCategory)?.name}` : ''}.</p>
              </div>
            ) : (
              <div className="trending-grid">
                {allPartnerDeals.map((deal) => (
                  <div key={deal.id} className="trending-card">
                    <div
                      className="card-image"
                      style={{ backgroundImage: `url(${deal.image})` }}
                      role="img"
                      aria-label={deal.title}
                    >
                      {deal.is_trending && (
                        <div className="card-badge trending">Trending</div>
                      )}
                      <div className="card-rating">
                        <span className="rating-star">⭐</span>
                        <span>{deal.rating}</span>
                      </div>
                    </div>
                    <div className="card-content">
                      <h3 className="card-title">{deal.title}</h3>
                      <p className="card-description">{deal.description}</p>
                      <div className="card-footer">
                        <div className="card-price">
                          {formatPrice(deal.price)}
                          {deal.originalPrice && deal.originalPrice > deal.price && (
                            <span className="original-price">{formatPrice(deal.originalPrice)}</span>
                          )}
                        </div>
                        <button 
                          className="card-action-btn"
                          onClick={() => navigate(`/experience/${deal.id}`)}
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      {/* Deal Menu Pane */}
      {selectedDeal && (
        <DealMenuPane
          deal={selectedDeal}
          isOpen={isMenuPaneOpen}
          onClose={() => {
            setIsMenuPaneOpen(false);
            setSelectedDeal(null);
          }}
        />
      )}

      <footer className="main-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Elizian</h4>
              <p>Discover curated experiences for unforgettable moments.</p>
            </div>
            <div className="footer-section">
              <h4>Quick Links</h4>
              <a href="/about">About Us</a>
              <a href="/contact">Contact</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms of Service</a>
            </div>
            <div className="footer-section">
              <h4>Categories</h4>
              <a href="/category/dining">Dining</a>
              <a href="/category/events">Events</a>
              <a href="/category/wellness">Wellness</a>
              <a href="/category/travel">Travel</a>
            </div>
            <div className="footer-section">
              <h4>Download App</h4>
              <button className="app-store-btn">App Store</button>
              <button className="play-store-btn">Google Play</button>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; {new Date().getFullYear()} Elizian. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <style jsx>{`
        :root {
          --primary-color: #004f4a;
          --secondary-color: #059669;
          --accent-color: #f59e0b;
          --text-color: #1f2937;
          --text-light: #6b7280;
          --bg-color: #ffffff;
          --bg-light: #f9fafb;
          --border-color: #e5e7eb;
          --shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
          --shadow-lg: 0 10px 25px rgba(0, 0, 0, 0.1);
          --radius: 12px;
          --radius-sm: 8px;
        }

        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }

        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          color: var(--text-color);
          line-height: 1.5;
        }

        .container {
          max-width: auto;
          margin: 0 auto;
          padding: 0 0px;
        }

        .skip-link {
          position: absolute;
          top: -40px;
          left: 0;
          background: var(--primary-color);
          color: white;
          padding: 8px;
          z-index: 1000;
          text-decoration: none;
        }

        .skip-link:focus {
          top: 0;
        }

        .top-nav {
          background: var(--bg-color);
          box-shadow: var(--shadow);
          position: sticky;
          top: 0;
          z-index: 100;
        }

        .nav-container {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
        }

        .elizian-landing-logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          font-size: 1.5rem;
          color: var(--primary-color);
          cursor: pointer;
        }

        .elizian-landing-logo-img {
          width: 32px;
          height: 32px;
          border-radius: 8px;
          object-fit: cover;
        }

        .desktop-nav {
          display: none;
          gap: 32px;
        }

        @media (min-width: 768px) {
          .desktop-nav {
            display: flex;
          }
        }

        .nav-link {
          text-decoration: none;
          color: var(--text-light);
          font-weight: 500;
          transition: color 0.2s;
          cursor: pointer;
        }

        .nav-link:hover,
        .nav-link.active {
          color: var(--primary-color);
        }

        .mobile-menu-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 8px;
          display: block;
        }

        @media (min-width: 768px) {
          .mobile-menu-btn {
            display: none;
          }
        }

        .mobile-nav-menu {
          background: var(--bg-color);
          border-top: 1px solid var(--border-color);
          padding: 20px;
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        @media (min-width: 768px) {
          .mobile-nav-menu {
            display: none;
          }
        }

        .mobile-nav-link {
          text-decoration: none;
          color: var(--text-color);
          font-weight: 500;
          padding: 12px 0;
          border-bottom: 1px solid var(--border-color);
          cursor: pointer;
        }

        .user-actions {
          display: none;
          gap: 12px;
          align-items: center;
        }

        @media (min-width: 768px) {
          .user-actions {
            display: flex;
          }
        }

        .welcome-text {
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .btn {
          padding: 10px 20px;
          border-radius: var(--radius-sm);
          border: none;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }

        .btn-primary {
          background: var(--primary-color);
          color: white;
        }

        .btn-primary:hover {
          background: #003832;
        }

        .btn-secondary {
          background: var(--bg-light);
          color: var(--text-color);
          border: 1px solid var(--border-color);
        }

        .btn-secondary:hover {
          background: var(--border-color);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 0.875rem;
        }

        .location-bar {
          background: var(--bg-light);
          border-bottom: 1px solid var(--border-color);
          padding: 12px 0;
        }

        .location-selector {
          display: flex;
          align-items: center;
          gap: 12px;
          cursor: pointer;
        }

        .location-icon {
          font-size: 1.25rem;
        }

        .location-details {
          line-height: 1.2;
        }

        .location-main {
          font-weight: 600;
          color: black;
          font-size: 1rem;
        }

        .dropdown-arrow {
          font-size: 0.75rem;
          margin-left: 4px;
          opacity: 0.6;
        }

        .location-sub {
          font-size: 0.875rem;
          color: var(--text-light);
        }

        .search-section {
          padding: 24px 0;
        }

        .search-wrapper {
          position: relative;
        }

        .search-input-group {
          display: flex;
          width: -webkit-fill-available;
          align-items: center;
          background: var(--bg-color);
          border: 2px solid var(--border-color);
          border-radius: var(--radius);
          padding: 12px 16px;
          transition: border-color 0.2s;
        }

        .search-input-group:focus-within {
          border-color: var(--primary-color);
        }

        .search-icon {
          margin-right: 12px;
          color: var(--text-light);
        }

        .search-input {
          flex: 1;
          border: none;
          outline: none;
          font-size: 1rem;
          background: transparent;
        }

        .filter-toggle {
          background: none;
          border: none;
          font-size: 1.25rem;
          cursor: pointer;
          position: relative;
          padding: 4px;
          display: flex;
          align-items: center;
        }

        .filter-toggle.active .filter-icon {
          color: var(--primary-color);
        }

        .filter-badge {
          position: absolute;
          top: 0;
          right: 0;
          width: 8px;
          height: 8px;
          background: var(--accent-color);
          border-radius: 50%;
        }

        .filter-panel {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          background: var(--bg-color);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          margin-top: 8px;
          padding: 16px;
          box-shadow: var(--shadow-lg);
          z-index: 10;
        }

        .filter-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }

        .filter-options {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
        }

        .filter-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          background: var(--bg-light);
          border: 1px solid var(--border-color);
          border-radius: 20px;
          font-size: 0.875rem;
          cursor: pointer;
          transition: all 0.2s;
        }

        .filter-chip.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .category-section {
          padding: 16px 0;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }

        .categories-scroll {
          display: flex;
          gap: 12px;
          padding-bottom: 8px;
        }

        .category-chip {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 12px 16px;
          background: var(--bg-light);
          border: 2px solid var(--border-color);
          border-radius: var(--radius);
          min-width: 90px;
          cursor: pointer;
          transition: all 0.2s;
          white-space: nowrap;
        }

        .category-chip.active {
          background: var(--primary-color);
          border-color: var(--primary-color);
          color: white;
        }

        .category-icon {
          font-size: 1.5rem;
        }

        .category-name {
          font-size: 0.75rem;
          font-weight: 500;
          text-align: center;
        }

        section {
          margin: 40px 0;
        }

        .section-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .section-title {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 1.5rem;
          font-weight: 700;
        }

        .title-icon {
          font-size: 1.25rem;
        }

        .section-controls {
          display: flex;
          align-items: center;
          gap: 16px;
        }

        .near-me-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          background: var(--bg-light);
          border: 2px solid var(--border-color);
          border-radius: 20px;
          font-size: 0.875rem;
          cursor: pointer;
        }

        .near-me-toggle.active {
          background: var(--primary-color);
          color: white;
          border-color: var(--primary-color);
        }

        .section-subtitle {
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .view-all-btn {
          background: none;
          border: none;
          color: var(--primary-color);
          font-weight: 600;
          cursor: pointer;
          padding: 8px 0;
        }

        .loading-state,
        .empty-state {
          text-align: center;
          padding: 40px;
          color: var(--text-light);
        }

        .trending-grid,
        .restaurants-grid,
        .events-grid {
          display: grid;
          gap: 20px;
        }

        @media (min-width: 640px) {
          .trending-grid,
          .restaurants-grid,
          .events-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .trending-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .restaurants-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .events-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        .trending-card,
        .restaurant-card,
        .event-card {
          background: var(--bg-color);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: var(--shadow);
          transition: transform 0.2s, box-shadow 0.2s;
        }

        .trending-card:hover,
        .restaurant-card:hover,
        .event-card:hover {
          transform: translateY(-4px);
          box-shadow: var(--shadow-lg);
        }

        .card-image,
        .restaurant-image,
        .event-image {
          height: 200px;
          background-size: cover;
          background-position: center;
          position: relative;
        }

        .card-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          background: var(--accent-color);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 0.75rem;
          font-weight: 600;
        }

        .card-badge.trending {
          background: #ef4444;
        }

        .event-badge.live {
          background: #10b981;
          padding: 6px 12px;
        }

        .card-rating,
        .restaurant-rating {
          position: absolute;
          bottom: 12px;
          right: 12px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 4px 8px;
          border-radius: 4px;
          display: flex;
          align-items: center;
          gap: 4px;
          font-size: 0.875rem;
        }

        .card-content {
          padding: 20px;
        }

        .card-title {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 8px;
        }

        .card-description {
          color: var(--text-light);
          margin-bottom: 16px;
          font-size: 0.875rem;
        }

        .card-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .card-price {
          font-size: 1.5rem;
          font-weight: 700;
          color: var(--primary-color);
          display: flex;
          flex-direction: column;
        }

        .original-price {
          font-size: 0.875rem;
          color: var(--text-light);
          text-decoration: line-through;
          font-weight: normal;
        }

        .card-action-btn {
          padding: 8px 16px;
          background: var(--primary-color);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 600;
          cursor: pointer;
        }

        .restaurant-info {
          padding: 16px;
        }

        .restaurant-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }

        .restaurant-name {
          font-size: 1.125rem;
          font-weight: 600;
        }

        .restaurant-price-range {
          color: var(--text-light);
          font-weight: 500;
        }

        .restaurant-cuisine {
          color: var(--text-light);
          font-size: 0.875rem;
          margin-bottom: 12px;
        }

        .restaurant-meta {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .restaurant-distance {
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .event-info {
          padding: 16px;
        }

        .event-header {
          margin-bottom: 12px;
        }

        .event-title {
          font-size: 1.125rem;
          font-weight: 600;
          margin-bottom: 4px;
        }

        .event-type {
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .event-meta {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 16px;
        }

        .event-time,
        .event-location {
          display: flex;
          align-items: center;
          gap: 6px;
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .event-action {
          width: 100%;
        }

        .events-scroll {
          display: flex;
          gap: 16px;
          overflow-x: auto;
          padding-bottom: 8px;
          -webkit-overflow-scrolling: touch;
        }

        .event-scroll-card {
          min-width: 200px;
          background: var(--bg-color);
          border-radius: var(--radius);
          overflow: hidden;
          box-shadow: var(--shadow);
        }

        .event-scroll-image {
          height: 120px;
          background-size: cover;
          background-position: center;
        }

        .event-scroll-content {
          padding: 12px;
        }

        .event-scroll-content h4 {
          font-size: 1rem;
          margin-bottom: 4px;
        }

        .event-scroll-content p {
          font-size: 0.875rem;
          color: var(--text-light);
        }

        .main-footer {
          background: var(--bg-light);
          padding: 40px 0 20px;
          margin-top: 60px;
        }

        .footer-content {
          display: grid;
          grid-template-columns: 1fr;
          gap: 32px;
          margin-bottom: 32px;
        }

        @media (min-width: 768px) {
          .footer-content {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (min-width: 1024px) {
          .footer-content {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        .footer-section h4 {
          margin-bottom: 16px;
          font-size: 1.125rem;
        }

        .footer-section a {
          display: block;
          color: var(--text-light);
          text-decoration: none;
          margin-bottom: 8px;
          transition: color 0.2s;
          cursor: pointer;
        }

        .footer-section a:hover {
          color: var(--primary-color);
        }

        .footer-bottom {
          text-align: center;
          padding-top: 20px;
          border-top: 1px solid var(--border-color);
          color: var(--text-light);
          font-size: 0.875rem;
        }

        .app-store-btn,
        .play-store-btn {
          display: block;
          width: 100%;
          margin-bottom: 8px;
          padding: 8px 12px;
          background: var(--text-color);
          color: white;
          border: none;
          border-radius: var(--radius-sm);
          font-weight: 500;
          cursor: pointer;
        }

        @media (max-width: 767px) {
          .container {
            padding: 0 16px;
          }

          .section-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
          }

          .section-controls {
            width: 100%;
            justify-content: space-between;
          }

          .search-input-group {
            padding: 10px 14px;
          }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
