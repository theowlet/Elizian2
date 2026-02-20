import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../styles/landing.css';

const LandingPage = () => {
  const navigate = useNavigate();
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [trendingExperiences, setTrendingExperiences] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:4000';

  // First-time onboarding: send new users to walkthrough; logged-in users to home
  useEffect(() => {
    const token = localStorage.getItem('token');
    const onboardingDone = localStorage.getItem('onboarding_done');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        if (payload.exp * 1000 > Date.now()) {
          navigate('/home', { replace: true });
          return;
        }
      } catch (_) {
        localStorage.removeItem('token');
      }
    }
    // First-time visitor: show onboarding before landing
    if (!onboardingDone) {
      navigate('/onboarding', { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    loadTrendingExperiences(selectedCategory);
  }, [selectedCategory]);

  const loadTrendingExperiences = async (category = 'all') => {
    try {
      setLoading(true);
      let url = `${API_BASE}/api/v1/offers?trending=true&limit=20&is_active=true`;
      
      if (category !== 'all') {
        // CRITICAL: Map frontend category to backend service_type
        // Backend uses 'spa-and-salon', not 'spa'
        const categoryToServiceType = {
          'dining': 'dining',
          'events': 'events',
          'healthcare': 'healthcare',
          'spa': 'spa-and-salon', // Frontend 'spa' → Backend 'spa-and-salon'
          'wellness': 'wellness',
          'travel': 'travel',
          'others': 'others'
        };
        const serviceType = categoryToServiceType[category];
        if (serviceType) {
          url += `&service_type=${serviceType}`;
          console.log(`🔍 Filtering by category: ${category} → service_type: ${serviceType}`);
        }
      } else {
        console.log('📦 Loading all trending experiences (no filter)');
      }
      
      const response = await fetch(url);
      const result = await response.json();

      if (result.success && result.data) {
        // CRITICAL: Only set experiences if data exists and matches the filter
        // If filtering by a specific category and no results, show empty state
        if (result.data.length > 0) {
          // Double-check client-side: ensure all returned items match the selected category
          if (category !== 'all') {
            const categoryToServiceType = {
              'dining': 'dining',
              'events': 'events',
              'healthcare': 'healthcare',
              'spa': 'spa-and-salon',
              'wellness': 'wellness',
              'travel': 'travel',
              'others': 'others'
            };
            const expectedServiceType = categoryToServiceType[category];
            const filtered = result.data.filter(exp => exp.service_type === expectedServiceType);
            console.log(`✅ Filtered ${filtered.length} experiences matching ${category} (${expectedServiceType}) out of ${result.data.length} total`);
            setTrendingExperiences(filtered);
          } else {
            setTrendingExperiences(result.data);
          }
        } else {
          console.log(`⚠️ No experiences found for category: ${category}`);
          setTrendingExperiences([]);
        }
      } else {
        console.log(`⚠️ API returned no data for category: ${category}`);
        setTrendingExperiences([]);
      }
    } catch (error) {
      console.error('Error loading trending experiences:', error);
      setTrendingExperiences([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCategoryFilter = (category) => {
    setSelectedCategory(category);
  };

  const categories = [
    { id: 'all', label: 'All Experiences' },
    { id: 'dining', label: 'Dining' },
    { id: 'events', label: 'Events' },
    { id: 'healthcare', label: 'Healthcare' },
    { id: 'spa', label: 'Spa and Salon' },
    { id: 'wellness', label: 'Wellness' },
    { id: 'travel', label: 'Travel' },
    { id: 'others', label: 'Others' }
  ];

  return (
    <div className="elizian-landing-page">
      {/* Header */}
      <header className="elizian-landing-header">
        <div className="elizian-landing-header-content">
          <div className="elizian-landing-logo">
            <img src="/assets/z.png" alt="Elizian" className="elizian-landing-logo-img" />
            <span className="elizian-landing-logo-text">Elizian</span>
          </div>
          <div className="elizian-landing-auth-buttons">
            <button 
              className="elizian-landing-btn elizian-landing-btn-text" 
              onClick={() => navigate('/login')}
            >
              Login
            </button>
            <button 
              className="elizian-landing-btn elizian-landing-btn-primary" 
              onClick={() => navigate('/signup')}
            >
              Sign Up
            </button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="elizian-landing-hero">
        <h1 className="elizian-landing-hero-title">Discover Curated Experiences</h1>
        <p className="elizian-landing-hero-subtitle">Your gateway to unforgettable moments</p>
      </section>

      {/* Search Bar */}
      <section className="elizian-landing-search">
        <div className="elizian-search-wrapper">
          <svg className="elizian-search-icon" width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M9 17C13.4183 17 17 13.4183 17 9C17 4.58172 13.4183 1 9 1C4.58172 1 1 4.58172 1 9C1 13.4183 4.58172 17 9 17Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M19 19L14.65 14.65" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <input 
            type="text" 
            className="elizian-search-input" 
            placeholder="Search" 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </section>

      {/* Category Filters */}
      <section className="elizian-landing-categories">
        <div className="elizian-categories-scroll">
          {categories.map(cat => (
            <button
              key={cat.id}
              className={`elizian-category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
              onClick={() => handleCategoryFilter(cat.id)}
            >
              {cat.label}
            </button>
          ))}
        </div>
      </section>

      {/* Trending Experiences */}
      <section className="elizian-landing-content">
        <h2 className="elizian-landing-section-title">Trending Experiences</h2>
        <div className="elizian-experiences-grid">
          {loading ? (
            <div className="elizian-loading">
              <div className="elizian-spinner"></div>
              <p>Loading trending experiences...</p>
            </div>
          ) : trendingExperiences.length > 0 ? (
            trendingExperiences.map(exp => (
              <div key={exp.id} className="elizian-experience-card" onClick={() => navigate(`/home?offer=${exp.id}`)}>
                <img 
                  src={exp.image_url || '/assets/event-default.png'} 
                  alt={exp.title || exp.name} 
                  className="elizian-experience-card-image"
                  onError={(e) => { e.target.src = '/assets/event-default.png'; }}
                />
                <div className="elizian-experience-card-content">
                  {exp.is_trending && (
                    <span className="elizian-trending-badge">🔥 TRENDING</span>
                  )}
                  <h3 className="elizian-experience-card-title">{exp.title || exp.name}</h3>
                  <p className="elizian-experience-card-meta">{exp.partner_name || ''}</p>
                  {exp.discounted_price && (
                    <div className="elizian-experience-card-price">₹{parseFloat(exp.discounted_price).toFixed(2)}</div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="elizian-experience-placeholder">
              <p className="elizian-placeholder-text">No trending experiences found. Try a different category or search term.</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default LandingPage;

