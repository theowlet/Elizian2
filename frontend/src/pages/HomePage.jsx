// import React from 'react';
// import { useNavigate } from 'react-router-dom';
// import '../styles/home.css';

// const HomePage = () => {
//   const navigate = useNavigate();
//   const user = JSON.parse(localStorage.getItem('user') || '{}');

//   return (
//     <div className="elizian-home-page">
//       <div className="elizian-content-wrapper">
//         <h1 className="elizian-home-title">Welcome to Elizian</h1>
//         <p className="elizian-home-subtitle">Home Page - To be migrated from index.html</p>
//         <p style={{ color: 'var(--muted)', marginBottom: '2rem' }}>User: {user.first_name || 'Guest'}</p>
//         <button className="elizian-btn-primary" onClick={() => navigate('/')}>Back to Landing</button>
//       </div>
//     </div>
//   );
// };

// export default HomePage;

import React, { useState, useEffect } from "react";

const HomePage = () => {
  const [currentSection, setCurrentSection] = useState("home");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showNearMe, setShowNearMe] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sample data
  const trendingItems = [
    {
      id: 1,
      title: "Luxury Spa Day",
      description: "Relax and rejuvenate with our premium spa package",
      price: "₹2,499",
      rating: 4.8,
      image:
        "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "spa",
    },
    {
      id: 2,
      title: "Fine Dining Experience",
      description: "5-course meal with wine pairing",
      price: "₹3,999",
      rating: 4.9,
      image:
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "dining",
    },
  ];

  const restaurants = [
    {
      id: 1,
      name: "Italian Bistro",
      cuisine: "Italian",
      priceRange: "$$$",
      rating: 4.5,
      distance: "1.2 km away",
      image:
        "https://images.unsplash.com/photo-1565299624946-b28f40a0ae38?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "dining",
    },
    {
      id: 2,
      name: "Sushi Zen",
      cuisine: "Japanese",
      priceRange: "$$$",
      rating: 4.7,
      distance: "2.1 km away",
      image:
        "https://images.unsplash.com/photo-1579584425555-c3ce17fd4351?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "dining",
    },
  ];

  const events = [
    {
      id: 1,
      title: "Jazz Night Live",
      type: "Music",
      time: "Until 11 PM",
      location: "Downtown Lounge",
      image:
        "https://images.unsplash.com/photo-1511379938547-c1f69419868d?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "events",
    },
    {
      id: 2,
      title: "Food Festival",
      type: "Culinary",
      time: "Starts Tomorrow",
      location: "Central Park",
      image:
        "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
      category: "events",
    },
  ];

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

  const filterItems = (items, category) => {
    if (category === "all") return items;
    return items.filter((item) => item.category === category);
  };

  return (
    <div className="elizian-container">
      {/* Accessibility Skip Link */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Top Navigation Bar */}
      <header className="top-nav">
        <div className="container nav-container">
          {/* Logo */}
          {/* <div className="logo">
            <img src="" alt="Elizian" />
            <span>Elizian</span>
          </div> */}
          <div className="elizian-landing-logo">
            <img
              src="/assets/z.png"
              alt="Elizian"
              className="elizian-landing-logo-img"
            />
            <span className="elizian-landing-logo-text">Elizian</span>
          </div>

          {/* Desktop Navigation */}
          <nav className="desktop-nav">
            <a
              href="#"
              className={`nav-link ${
                currentSection === "home" ? "active" : ""
              }`}
              onClick={() => setCurrentSection("home")}
            >
              Home
            </a>
            <a
              href="#"
              className={`nav-link ${
                currentSection === "experiences" ? "active" : ""
              }`}
              onClick={() => setCurrentSection("experiences")}
            >
              Experiences
            </a>
            <a
              href="#"
              className={`nav-link ${
                currentSection === "restaurants" ? "active" : ""
              }`}
              onClick={() => setCurrentSection("restaurants")}
            >
              Restaurants
            </a>
            <a
              href="#"
              className={`nav-link ${
                currentSection === "events" ? "active" : ""
              }`}
              onClick={() => setCurrentSection("events")}
            >
              Events
            </a>
            <a
              href="#"
              className={`nav-link ${
                currentSection === "profile" ? "active" : ""
              }`}
              onClick={() => setCurrentSection("profile")}
            >
              Profile
            </a>
          </nav>

          {/* Mobile Menu Button */}
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <span className="menu-icon">☰</span>
          </button>

          {/* User Actions */}
          <div className="user-actions">
            <button className="btn btn-primary">Login</button>
            <button className="btn btn-secondary">Sign Up</button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {mobileMenuOpen && (
          <div className="mobile-nav-menu">
            <a
              href="#"
              className="mobile-nav-link"
              onClick={() => {
                setCurrentSection("home");
                setMobileMenuOpen(false);
              }}
            >
              Home
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={() => {
                setCurrentSection("experiences");
                setMobileMenuOpen(false);
              }}
            >
              Experiences
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={() => {
                setCurrentSection("restaurants");
                setMobileMenuOpen(false);
              }}
            >
              Restaurants
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={() => {
                setCurrentSection("events");
                setMobileMenuOpen(false);
              }}
            >
              Events
            </a>
            <a
              href="#"
              className="mobile-nav-link"
              onClick={() => {
                setCurrentSection("profile");
                setMobileMenuOpen(false);
              }}
            >
              Profile
            </a>
          </div>
        )}
      </header>

      {/* Location Bar */}
      <div className="location-bar">
        <div className="container">
          <div className="location-selector">
            <span className="location-icon">📍</span>
            <div className="location-details">
              <div className="location-main">
                Mumbai, India <span className="dropdown-arrow">▼</span>
              </div>
              <div className="location-sub">South Mumbai</div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main id="main-content" className="main-content">
        <div className="container">
          {/* Search Section */}
          <section className="search-section">
            <div className="search-wrapper">
              <div className="search-input-group">
                <span className="search-icon">🔍</span>
                <input
                  type="text"
                  className="search-input"
                  placeholder="Search restaurants, events, cuisines..."
                />
                <button
                  className={`filter-toggle ${activeFilter ? "active" : ""}`}
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                >
                  <span className="filter-icon">⚙️</span>
                  {activeFilter && <span className="filter-badge">•</span>}
                </button>
              </div>

              {/* Filter Panel */}
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
                        className={`filter-chip ${
                          activeFilter === filter.id ? "active" : ""
                        }`}
                        onClick={() => setActiveFilter(filter.id)}
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

          {/* Category Navigation */}
          <section className="category-section">
            <div className="categories-scroll">
              {categories.map((category) => (
                <button
                  key={category.id}
                  className={`category-chip ${
                    activeCategory === category.id ? "active" : ""
                  }`}
                  onClick={() => setActiveCategory(category.id)}
                >
                  <span className="category-icon">{category.icon}</span>
                  <span className="category-name">{category.name}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Trending Now Section */}
          <section className="trending-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🔥</span>
                Trending Now
              </h2>
              <div className="section-controls">
                <button
                  className={`near-me-toggle ${showNearMe ? "active" : ""}`}
                  onClick={() => setShowNearMe(!showNearMe)}
                >
                  <span className="toggle-icon">📍</span>
                  <span>Near Me</span>
                </button>
                <span className="section-subtitle">Popular this week</span>
              </div>
            </div>

            <div className="trending-grid">
              {filterItems(trendingItems, activeCategory).map((item) => (
                <div key={item.id} className="trending-card">
                  <div
                    className="card-image"
                    style={{ backgroundImage: `url(${item.image})` }}
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
                      <div className="card-price">{item.price}</div>
                      <button className="card-action-btn">View Details</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Top Restaurants Section */}
          <section className="restaurants-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🍽️</span>
                Top Restaurants Near You
              </h2>
              <button className="view-all-btn">View All →</button>
            </div>

            <div className="restaurants-grid">
              {filterItems(restaurants, activeCategory).map((restaurant) => (
                <div key={restaurant.id} className="restaurant-card">
                  <div
                    className="restaurant-image"
                    style={{ backgroundImage: `url(${restaurant.image})` }}
                  >
                    <div className="restaurant-rating">
                      <span className="rating-star">⭐</span>
                      <span>{restaurant.rating}</span>
                    </div>
                  </div>
                  <div className="restaurant-info">
                    <div className="restaurant-header">
                      <h3 className="restaurant-name">{restaurant.name}</h3>
                      <div className="restaurant-price-range">
                        {restaurant.priceRange}
                      </div>
                    </div>
                    <p className="restaurant-cuisine">{restaurant.cuisine}</p>
                    <div className="restaurant-meta">
                      <span className="restaurant-distance">
                        {restaurant.distance}
                      </span>
                      <span className="restaurant-action">
                        <button className="btn-sm">Book Now</button>
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Live Events Section */}
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

            <div className="events-grid">
              {filterItems(events, activeCategory).map((event) => (
                <div key={event.id} className="event-card">
                  <div
                    className="event-image"
                    style={{ backgroundImage: `url(${event.image})` }}
                  >
                    <div className="event-badge live">LIVE</div>
                  </div>
                  <div className="event-info">
                    <div className="event-header">
                      <h3 className="event-title">{event.title}</h3>
                      <div className="event-type">{event.type}</div>
                    </div>
                    <div className="event-meta">
                      <div className="event-time">
                        <span className="time-icon">🕒</span>
                        <span>{event.time}</span>
                      </div>
                      <div className="event-location">
                        <span className="location-icon">📍</span>
                        <span>{event.location}</span>
                      </div>
                    </div>
                    <button className="btn btn-primary event-action">
                      Join Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Upcoming Events */}
          <section className="upcoming-section">
            <div className="section-header">
              <h2 className="section-title">
                <span className="title-icon">🎭</span>
                Upcoming Events
              </h2>
              <button className="view-all-btn">View All →</button>
            </div>

            <div className="events-scroll">
              {events.map((event) => (
                <div key={`upcoming-${event.id}`} className="event-scroll-card">
                  <div
                    className="event-scroll-image"
                    style={{ backgroundImage: `url(${event.image})` }}
                  ></div>
                  <div className="event-scroll-content">
                    <h4>{event.title}</h4>
                    <p>
                      {event.type} • {event.time}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      {/* <div className="mobile-bottom-nav">
        <button className="nav-item active">
          <span className="nav-icon">🏠</span>
          <span className="nav-label">Home</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">🔍</span>
          <span className="nav-label">Search</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">📱</span>
          <span className="nav-label">Experiences</span>
        </button>
        <button className="nav-item">
          <span className="nav-icon">👤</span>
          <span className="nav-label">Profile</span>
        </button>
      </div> */}

      {/* Footer */}
      <footer className="main-footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <h4>Elizian</h4>
              <p>Discover curated experiences for unforgettable moments.</p>
            </div>
            <div className="footer-section">
              <h4>Quick Links</h4>
              <a href="#">About Us</a>
              <a href="#">Contact</a>
              <a href="#">Privacy Policy</a>
              <a href="#">Terms of Service</a>
            </div>
            <div className="footer-section">
              <h4>Categories</h4>
              <a href="#">Dining</a>
              <a href="#">Events</a>
              <a href="#">Wellness</a>
              <a href="#">Travel</a>
            </div>
            <div className="footer-section">
              <h4>Download App</h4>
              <button className="app-store-btn">App Store</button>
              <button className="play-store-btn">Google Play</button>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 Elizian. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Global Styles */}
      <style jsx>{`
        /* Base Styles */
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
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
            sans-serif;
          color: var(--text-color);
          line-height: 1.5;
        }

        .container {
          max-width: auto;
          margin: 0 auto;
          padding: 0 0px;
        }

        /* Skip Link */
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

        /* Top Navigation */
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

        .logo {
          display: flex;
          align-items: center;
          gap: 12px;
          font-weight: 700;
          font-size: 1.5rem;
          color: var(--primary-color);
        }

        .logo img {
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
        }

        .user-actions {
          display: none;
          gap: 12px;
        }

        @media (min-width: 768px) {
          .user-actions {
            display: flex;
          }
        }

        /* Buttons */
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

        /* Location Bar */
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
          color: black;
        }

        .location-main {
          font-weight: 600;
          font-size: 1rem;
          text-color: #003832;
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

        /* Search Section */
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

        /* Category Section */
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
          // gap: 4px;
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

        /* Sections */
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

        /* Cards */
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

        /* Restaurant Cards */
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

        /* Event Cards */
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

        /* Upcoming Events */
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

        /* Mobile Bottom Navigation */
        .mobile-bottom-nav {
          position: fixed;
          bottom: 0;
          left: 0;
          right: 0;
          background: var(--bg-color);
          border-top: 1px solid var(--border-color);
          display: flex;
          justify-content: space-around;
          padding: 12px 0;
          z-index: 100;
        }

        @media (min-width: 768px) {
          .mobile-bottom-nav {
            display: none;
          }
        }

        .nav-item {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          color: var(--text-light);
          cursor: pointer;
          padding: 8px;
        }

        .nav-item.active {
          color: var(--primary-color);
        }

        .nav-icon {
          font-size: 1.5rem;
        }

        .nav-label {
          font-size: 0.75rem;
        }

        /* Footer */
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

        /* App Store Buttons */
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

        /* Responsive Adjustments */
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
