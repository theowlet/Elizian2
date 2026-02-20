import React, { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import DealMenuPane from "../components/DealMenuPane";
import ExperienceCard from "../components/ExperienceCard";
import SkeletonLoader from "../components/SkeletonLoader";
import { getFiltersForCategory } from "../config/filterSchema";

// STABILIZATION FIX: Gate debug logging behind development mode
// Prevents performance degradation and information leakage in production.
const isDev = import.meta.env.DEV;
const debugLog = (...args) => { if (isDev) console.log(...args); };

const HomePage = () => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:4000";
  const navigate = useNavigate();

  const [currentSection, setCurrentSection] = useState("home");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [showNearMe, setShowNearMe] = useState(false);
  // Server-side filter params (universal, multi-vertical)
  const [maxDistanceKm, setMaxDistanceKm] = useState(null);
  const [minRating, setMinRating] = useState(null);
  const [priceMin, setPriceMin] = useState(null);
  const [priceMax, setPriceMax] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchKeyword, setSearchKeyword] = useState("");
  // Category-specific dynamic filters (API param names)
  const [cuisineTypes, setCuisineTypes] = useState([]);
  const [mealType, setMealType] = useState([]);
  const [therapyType, setTherapyType] = useState([]);
  const [durationMin, setDurationMin] = useState(null);
  const [durationMax, setDurationMax] = useState(null);
  const [eventType, setEventType] = useState([]);
  const [eventDate, setEventDate] = useState(null);
  const [starRating, setStarRating] = useState(null);
  const [refundable, setRefundable] = useState(false);
  const [specialization, setSpecialization] = useState([]);

  // Single source of truth: all deals fetched once
  const [allDeals, setAllDeals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [user, setUser] = useState({});
  const [currentLocation, setCurrentLocation] = useState("");
  const [userCoordinates, setUserCoordinates] = useState({
    latitude: null,
    longitude: null,
  });
  const [selectedDeal, setSelectedDeal] = useState(null);
  const [isMenuPaneOpen, setIsMenuPaneOpen] = useState(false);
  const [activeCampaigns, setActiveCampaigns] = useState([]);
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
    dining: "dining",
    events: "events",
    healthcare: "healthcare",
    spa: "spa-and-salon", // CRITICAL: Frontend 'spa' → Backend 'spa-and-salon'
    wellness: "wellness",
    travel: "travel",
    others: "others",
  };

  // ============================================
  // DISTANCE CALCULATION HELPERS
  // ============================================
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    if (!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
    const R = 6371; // Earth's radius in km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // Distance in km
  };

  const formatDistance = (distanceKm) => {
    if (distanceKm == null || !Number.isFinite(distanceKm)) return "—";
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
   * TRENDING = High-engagement offers with is_trending flag set
   */
  const getTrendingDeals = (deals, selectedCategory) => {
    if (!deals || deals.length === 0) return [];

    // Filter by is_trending flag ONLY
    // Note: 'featured' doesn't exist in partner_offers table
    let trending = deals.filter(
      (deal) => deal.is_trending === true
    );

    // Apply category filter if not "all"
    if (selectedCategory !== "all") {
      const expectedServiceType = categoryToServiceType[selectedCategory];
      if (expectedServiceType) {
        trending = trending.filter(
          (deal) => deal.service_type === expectedServiceType,
        );
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
      debugLog("⚠️ [getTopRestaurants] No deals available");
      return [];
    }

    // Filter ONLY dining deals
    let restaurants = deals.filter((deal) => {
      return deal.service_type === "dining";
    });

    debugLog(
      `✅ [getTopRestaurants] Found ${restaurants.length} dining deals out of ${deals.length} total deals`,
    );

    // Calculate and add distance for each restaurant
    if (userLat && userLon) {
      debugLog(
        `📍 [getTopRestaurants] User location available: ${userLat}, ${userLon}`,
      );

      restaurants = restaurants.map((deal) => {
        const dealLat = deal.latitude || deal.partner_latitude;
        const dealLon = deal.longitude || deal.partner_longitude;

        if (!dealLat || !dealLon) {
          return {
            ...deal,
            distanceKm: Infinity,
            distanceFormatted: "Location not available",
          };
        }

        const distance = calculateDistance(userLat, userLon, dealLat, dealLon);
        return {
          ...deal,
          distanceKm: distance,
          distanceFormatted: formatDistance(distance),
        };
      });

      // Filter by 25km radius (but keep deals without location)
      const withinRadius = restaurants.filter((r) => r.distanceKm <= 25);
      const withoutLocation = restaurants.filter(
        (r) => !isFinite(r.distanceKm),
      );

      restaurants = [...withinRadius, ...withoutLocation];

      // Sort by distance ASC (nearest first), deals without location go to end
      restaurants.sort((a, b) => {
        if (!isFinite(a.distanceKm)) return 1;
        if (!isFinite(b.distanceKm)) return -1;
        return a.distanceKm - b.distanceKm;
      });

      debugLog(
        `✅ [getTopRestaurants] After filtering: ${withinRadius.length} within 25km, ${withoutLocation.length} without location`,
      );
    } else {
      debugLog(
        "⚠️ [getTopRestaurants] No user location - showing all dining deals",
      );
      restaurants = restaurants.map((deal) => ({
        ...deal,
        distanceKm: Infinity,
        distanceFormatted: "Distance unavailable",
      }));
    }

    debugLog(
      `✅ [getTopRestaurants] Returning ${restaurants.length} restaurants`,
    );
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
    let events = deals.filter((deal) => deal.service_type === "events");

    // Filter for ongoing events
    events = events.filter((event) => {
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
    let events = deals.filter((deal) => deal.service_type === "events");

    // Filter for upcoming events (start_date > now)
    events = events.filter((event) => {
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
    if (selectedCategory !== "all") {
      const expectedServiceType = categoryToServiceType[selectedCategory];
      if (expectedServiceType) {
        allDeals = allDeals.filter(
          (deal) => deal.service_type === expectedServiceType,
        );
      }
    }

    return allDeals;
  };

  /**
   * Sort deals by active filter (distance, discount, rating, price).
   * Returns new array; when sortBy is null, returns deals unchanged.
   */
  const sortDealsBy = (deals, sortBy) => {
    if (!deals?.length || !sortBy) return deals || [];
    const arr = [...deals];
    if (sortBy === "distance") {
      arr.sort((a, b) => {
        const da = a.distance_km != null ? Number(a.distance_km) : Infinity;
        const db = b.distance_km != null ? Number(b.distance_km) : Infinity;
        return da - db;
      });
    } else if (sortBy === "discount") {
      arr.sort((a, b) => {
        const pctA = a.originalPrice > 0 ? ((a.originalPrice - (a.price || 0)) / a.originalPrice) * 100 : 0;
        const pctB = b.originalPrice > 0 ? ((b.originalPrice - (b.price || 0)) / b.originalPrice) * 100 : 0;
        return pctB - pctA; // higher discount first
      });
    } else if (sortBy === "rating") {
      arr.sort((a, b) => (Number(b.rating) || 0) - (Number(a.rating) || 0));
    } else if (sortBy === "price") {
      arr.sort((a, b) => (Number(a.price) || 0) - (Number(b.price) || 0));
    }
    return arr;
  };

  // ============================================
  // MEMOIZED SECTION DATA (Derived from allDeals)
  // ============================================

  const trendingDeals = useMemo(
    () => getTrendingDeals(allDeals, activeCategory),
    [allDeals, activeCategory],
  );

  const topRestaurants = useMemo(
    () =>
      getTopRestaurants(
        allDeals,
        userCoordinates.latitude,
        userCoordinates.longitude,
      ),
    [allDeals, userCoordinates.latitude, userCoordinates.longitude],
  );

  const liveEvents = useMemo(() => getLiveEvents(allDeals), [allDeals]);

  const upcomingEvents = useMemo(() => getUpcomingEvents(allDeals), [allDeals]);

  // Attach client-side distance to live events when user location is available (near real-time)
  const liveEventsWithDistance = useMemo(() => {
    const lat = userCoordinates?.latitude;
    const lon = userCoordinates?.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return liveEvents.map((e) => ({ ...e, distanceKmClient: null }));
    }
    return liveEvents.map((e) => {
      const dLat = e.latitude ?? e.partner_latitude;
      const dLon = e.longitude ?? e.partner_longitude;
      const km = dLat != null && dLon != null && Number.isFinite(dLat) && Number.isFinite(dLon)
        ? calculateDistance(lat, lon, dLat, dLon)
        : null;
      return { ...e, distanceKmClient: km };
    });
  }, [liveEvents, userCoordinates?.latitude, userCoordinates?.longitude]);

  // Attach client-side distance to upcoming events when user location is available
  const upcomingEventsWithDistance = useMemo(() => {
    const lat = userCoordinates?.latitude;
    const lon = userCoordinates?.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return upcomingEvents.map((e) => ({ ...e, distanceKmClient: null }));
    }
    return upcomingEvents.map((e) => {
      const dLat = e.latitude ?? e.partner_latitude;
      const dLon = e.longitude ?? e.partner_longitude;
      const km = dLat != null && dLon != null && Number.isFinite(dLat) && Number.isFinite(dLon)
        ? calculateDistance(lat, lon, dLat, dLon)
        : null;
      return { ...e, distanceKmClient: km };
    });
  }, [upcomingEvents, userCoordinates?.latitude, userCoordinates?.longitude]);

  const allPartnerDeals = useMemo(
    () => getAllPartnerDeals(allDeals, activeCategory),
    [allDeals, activeCategory],
  );

  const sortedTrendingDeals = useMemo(
    () => sortDealsBy(trendingDeals, activeFilter),
    [trendingDeals, activeFilter],
  );

  // Deduplication: deal IDs already shown in campaign sections above — exclude from Trending so same deal never appears twice
  const campaignShownDealIds = useMemo(() => {
    const set = new Set();
    activeCampaigns.forEach((c) => (c.offers || []).forEach((o) => set.add(o.id)));
    return set;
  }, [activeCampaigns]);

  const trendingDealsDeduped = useMemo(
    () => sortedTrendingDeals.filter((d) => !campaignShownDealIds.has(d.id)),
    [sortedTrendingDeals, campaignShownDealIds],
  );

  // Trending badge only for top 20% by booking velocity (current_redemptions)
  const top20TrendingIds = useMemo(() => {
    const sorted = [...trendingDealsDeduped].sort(
      (a, b) => (b.current_redemptions || 0) - (a.current_redemptions || 0),
    );
    const n = Math.max(1, Math.ceil(sorted.length * 0.2));
    return new Set(sorted.slice(0, n).map((d) => d.id));
  }, [trendingDealsDeduped]);

  // Search: filter by venue name, title, cuisine/category, area (description)
  const searchFilteredTrending = useMemo(() => {
    const q = (searchKeyword || "").trim().toLowerCase();
    if (!q) return trendingDealsDeduped;
    return trendingDealsDeduped.filter(
      (d) =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.partner_name && d.partner_name.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        (d.category_name && d.category_name.toLowerCase().includes(q)) ||
        (d.partner_cuisine_types && String(d.partner_cuisine_types).toLowerCase().includes(q)),
    );
  }, [trendingDealsDeduped, searchKeyword]);

  // Trending sorted by distance (ascending) from user; client-side Haversine. No coords → default order; missing deal coords → bottom.
  const trendingSortedByDistance = useMemo(() => {
    const list = searchFilteredTrending;
    const lat = userCoordinates?.latitude;
    const lon = userCoordinates?.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return list;
    }
    const withDistance = list.map((d) => {
      const dLat = d.latitude ?? d.partner_latitude;
      const dLon = d.longitude ?? d.partner_longitude;
      const distanceKm = dLat != null && dLon != null && Number.isFinite(dLat) && Number.isFinite(dLon)
        ? calculateDistance(lat, lon, dLat, dLon)
        : Infinity;
      return { ...d, distanceKmClient: distanceKm === Infinity ? null : distanceKm };
    });
    withDistance.sort((a, b) => (a.distanceKmClient ?? Infinity) - (b.distanceKmClient ?? Infinity));
    return withDistance;
  }, [searchFilteredTrending, userCoordinates?.latitude, userCoordinates?.longitude]);

  const sortedAllPartnerDeals = useMemo(
    () => sortDealsBy(allPartnerDeals, activeFilter),
    [allPartnerDeals, activeFilter],
  );

  const searchFilteredPartnerDeals = useMemo(() => {
    const q = (searchKeyword || "").trim().toLowerCase();
    if (!q) return sortedAllPartnerDeals;
    return sortedAllPartnerDeals.filter(
      (d) =>
        (d.title && d.title.toLowerCase().includes(q)) ||
        (d.partner_name && d.partner_name.toLowerCase().includes(q)) ||
        (d.description && d.description.toLowerCase().includes(q)) ||
        (d.category_name && d.category_name.toLowerCase().includes(q)) ||
        (d.partner_cuisine_types && String(d.partner_cuisine_types).toLowerCase().includes(q)),
    );
  }, [sortedAllPartnerDeals, searchKeyword]);

  // All Partner Deals: inject client-side distance when user location available so every card shows distance (near real-time)
  const searchFilteredPartnerDealsWithDistance = useMemo(() => {
    const lat = userCoordinates?.latitude;
    const lon = userCoordinates?.longitude;
    if (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) {
      return searchFilteredPartnerDeals;
    }
    return searchFilteredPartnerDeals.map((d) => {
      const dLat = d.latitude ?? d.partner_latitude;
      const dLon = d.longitude ?? d.partner_longitude;
      const km = dLat != null && dLon != null && Number.isFinite(dLat) && Number.isFinite(dLon)
        ? calculateDistance(lat, lon, dLat, dLon)
        : null;
      return { ...d, distance_km: km ?? d.distance_km };
    });
  }, [searchFilteredPartnerDeals, userCoordinates?.latitude, userCoordinates?.longitude]);

  // ============================================
  // DATA FETCHING
  // ============================================

  /**
   * Fetch all deals (single source of truth). Pass coords when "Near Me" is on for geo-sort and distance_km.
   * Server-side filters (max_distance_km, min_rating, price_min, price_max) applied when set.
   */
  const loadAllDeals = async (coords = null) => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: "100", is_active: "true" });
      if (coords?.latitude != null && coords?.longitude != null) {
        params.set("user_latitude", coords.latitude);
        params.set("user_longitude", coords.longitude);
      }
      if (maxDistanceKm != null && maxDistanceKm > 0) params.set("max_distance_km", String(maxDistanceKm));
      if (minRating != null && minRating >= 0) params.set("min_rating", String(minRating));
      if (priceMin != null && priceMin >= 0) params.set("price_min", String(priceMin));
      if (priceMax != null && priceMax > 0) params.set("price_max", String(priceMax));
      // Do NOT filter by service_type here: we need all deals so Top Restaurants, Live Now,
      // and Upcoming Events always have data. Category filter is applied client-side for
      // Trending Experiences and All Partner Deals only.
      if (cuisineTypes.length > 0) cuisineTypes.forEach((c) => params.append("cuisine_types", c));
      if (mealType.length > 0) mealType.forEach((m) => params.append("meal_type", m));
      if (therapyType.length > 0) therapyType.forEach((t) => params.append("therapy_type", t));
      if (durationMin != null && durationMin >= 0) params.set("duration_min", String(durationMin));
      if (durationMax != null && durationMax > 0) params.set("duration_max", String(durationMax));
      if (eventType.length > 0) eventType.forEach((e) => params.append("event_type", e));
      if (eventDate) params.set("event_date", eventDate);
      if (starRating != null && starRating >= 0) params.set("star_rating", String(starRating));
      if (refundable) params.set("refundable", "true");
      if (specialization.length > 0) specialization.forEach((s) => params.append("specialization", s));
      const url = `${API_BASE}/api/v1/offers?${params.toString()}`;

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        console.error("[Offers] API error:", response.status, result?.message || result?.error || result);
        setAllDeals([]);
        return;
      }

      // Support common response shapes: { data: [] }, { data: { items: [] } }, or array at top level
      const rawList = Array.isArray(result?.data)
        ? result.data
        : Array.isArray(result?.data?.items)
          ? result.data.items
          : Array.isArray(result?.items)
            ? result.items
            : Array.isArray(result) ? result : [];
      if (rawList.length > 0) {
        // Format deals with consistent structure
        const formattedDeals = rawList.map((item) => ({
          id: item.id,
          title: item.title || item.name,
          description: item.description,
          price: item.discounted_price || item.original_price || 0,
          originalPrice: item.original_price,
          image:
            item.image_url ||
            "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
          service_type: item.service_type || "others",
          is_trending: item.is_trending || false, // Offer-level trending flag
          partner_approved_for_featured: Boolean(item.partner_approved_for_featured), // Venue-level premium status
          rating: item.rating || item.partner_rating || 4.5,
          location: item.partner_name || item.location,
          latitude: item.latitude || item.partner_latitude,
          longitude: item.longitude || item.partner_longitude,
          start_date: item.start_date,
          end_date: item.end_date,
          partner_id: item.partner_id,
          partner_name: item.partner_name,
          category_name: item.category_name,
          perk_type: item.perk_type || "discount",
          perk_description: item.perk_description,
          min_tier_name: item.min_tier_name || null,
          distance_km: item.distance_km != null ? Number(item.distance_km) : null,
          partner_cuisine_types: item.partner_cuisine_types || null,
          partner_avg_cost_for_two: item.partner_avg_cost_for_two != null ? Number(item.partner_avg_cost_for_two) : null,
          experience_metadata: item.experience_metadata || undefined,
          partner_address: item.partner_address || null,
          co_pay_percentage: item.co_pay_percentage != null ? Number(item.co_pay_percentage) : null,
          current_redemptions: item.current_redemptions != null ? Number(item.current_redemptions) : 0,
        }));

        setAllDeals(formattedDeals);
        console.log(`✅ Loaded ${formattedDeals.length} deals`);
      } else {
        setAllDeals([]);
        if (result.success && result.data && !Array.isArray(result.data)) {
          console.warn("[Offers] API returned data that is not an array:", typeof result.data);
        } else if (result.success) {
          console.warn("[Offers] API returned 0 deals. Ensure partners are active/approved, offers are active and not expired. See DEALS-VISIBILITY.md");
        }
      }
    } catch (error) {
      console.error("Error loading deals:", error);
      setAllDeals([]);
    } finally {
      setLoading(false);
    }
  };

  const formatDealFromApi = (item) => ({
    id: item.id,
    title: item.title || item.name,
    description: item.description,
    price: item.discounted_price || item.original_price || 0,
    originalPrice: item.original_price,
    image: item.image_url || "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80",
    service_type: item.service_type || "others",
    is_trending: item.is_trending || false,
    partner_approved_for_featured: Boolean(item.partner_approved_for_featured),
    rating: (item.rating || item.partner_rating) ?? 4.5,
    location: item.partner_name || item.location,
    latitude: item.latitude || item.partner_latitude,
    longitude: item.longitude || item.partner_longitude,
    start_date: item.start_date,
    end_date: item.end_date,
    partner_id: item.partner_id,
    partner_name: item.partner_name,
    partner_address: item.partner_address || null,
    category_name: item.category_name,
    perk_type: item.perk_type || "discount",
    perk_description: item.perk_description,
    min_tier_name: item.min_tier_name || null,
    distance_km: item.distance_km != null ? Number(item.distance_km) : null,
    partner_cuisine_types: item.partner_cuisine_types || null,
    partner_avg_cost_for_two: item.partner_avg_cost_for_two != null ? Number(item.partner_avg_cost_for_two) : null,
    experience_metadata: item.experience_metadata || undefined,
    co_pay_percentage: item.co_pay_percentage != null ? Number(item.co_pay_percentage) : null,
    current_redemptions: item.current_redemptions != null ? Number(item.current_redemptions) : 0,
  });

  const getUserLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          setUserCoordinates({ latitude, longitude });
          setCurrentLocation("Your location");
          localStorage.setItem("userLocation", "Your location");
        },
        (err) => {
          if (isDev) console.warn("[HomePage] Location permission denied or unavailable — trending will use default order.", err?.message || err);
          const savedLocation = localStorage.getItem("userLocation");
          setCurrentLocation(savedLocation || "Mumbai, India");
        },
      );
    } else {
      const savedLocation = localStorage.getItem("userLocation");
      setCurrentLocation(savedLocation || "Mumbai, India");
    }
  };

  useEffect(() => {
    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    setUser(userData);

    getUserLocation();

    const loadCampaigns = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/collections/active-campaigns`);
        const j = await r.json();
        if (j.success && Array.isArray(j.data)) setActiveCampaigns(j.data);
      } catch (e) {
        setActiveCampaigns([]);
      }
    };
    loadCampaigns();

    // Listen for book deal event from menu pane
    const handleBookDealEvent = (e) => {
      handleBookDeal(e.detail);
    };
    window.addEventListener("bookDeal", handleBookDealEvent);

    return () => {
      window.removeEventListener("bookDeal", handleBookDealEvent);
    };
  }, []);

  // Refetch when server-side filters or category change (and on mount)
  useEffect(() => {
    loadAllDeals(showNearMe ? userCoordinates : null);
  }, [showNearMe, userCoordinates?.latitude, userCoordinates?.longitude, maxDistanceKm, minRating, priceMin, priceMax, activeCategory, cuisineTypes, mealType, therapyType, durationMin, durationMax, eventType, eventDate, starRating, refundable, specialization]);

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
    if (e.target.closest(".card-action-btn")) {
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
      sessionStorage.setItem(
        "pendingBooking",
        JSON.stringify({
          dealId: deal.id,
          dealTitle: deal.title,
          serviceType: deal.service_type,
          partnerId: deal.partner_id,
          redirectPath: `/home`,
        }),
      );
      // Redirect to login with return path
      navigate("/login", {
        state: {
          from: { pathname: "/home" },
          bookingDealId: deal.id,
        },
      });
      return;
    }

    // User is authenticated - proceed with booking
    // For dining deals, navigate to restaurant booking
    if (deal.service_type === "dining") {
      // Navigate to booking page or open booking modal
      // For now, navigate to a booking route with deal info
      navigate(`/events/booking`, {
        state: {
          deal: deal,
          dealId: deal.id,
          serviceType: "dining",
        },
      });
    }
    // For events, navigate to event booking
    else if (deal.service_type === "events") {
      navigate(`/events/booking`, {
        state: {
          deal: deal,
          dealId: deal.id,
          serviceType: "events",
        },
      });
    }
    // For other types, use generic booking
    else {
      navigate(`/events/booking`, {
        state: {
          deal: deal,
          dealId: deal.id,
          serviceType: deal.service_type || "others",
        },
      });
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("userInfo");
    localStorage.removeItem("userToken");
    window.dispatchEvent(new Event('elizian-logout'));
    navigate("/login", { replace: true });
  };

  const handleNavigation = (section) => {
    setCurrentSection(section);
    setMobileMenuOpen(false);
    if (section === "home") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (section === "profile") {
      navigate("/profile");
    }
  };

  // Format price for display
  const formatPrice = (price) => {
    if (!price) return "₹0";
    return `₹${parseFloat(price).toLocaleString("en-IN")}`;
  };

  // Value proposition for EZT co-pay: avoid misleading "₹0" — show actual value exchange
  const formatPriceLabel = (deal) => {
    const price = deal?.price != null ? Number(deal.price) : 0;
    const original = deal?.originalPrice != null ? Number(deal.originalPrice) : 0;
    const coPay = deal?.co_pay_percentage != null ? Number(deal.co_pay_percentage) : null;
    if (price > 0 && original > price) {
      return (
        <span>
          <span className="original-price" style={{ textDecoration: "line-through", marginRight: "0.35rem" }}>{formatPrice(original)}</span>
          <span>{formatPrice(price)} with EZT</span>
        </span>
      );
    }
    if (price === 0 && (coPay != null && coPay > 0)) {
      return <span>Pay with EZT • {coPay}% co-pay</span>;
    }
    if (price === 0) {
      return <span>Pay with EZT</span>;
    }
    return formatPrice(price);
  };

  return (
    <div className="elizian-container elizian-theme">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header className="elizian-header-minimal">
        <div className="elizian-header-inner">
          <button
            type="button"
            className="elizian-logo-crest"
            onClick={() => navigate("/home")}
            aria-label="Home"
          >
            <img src="/assets/z.png" alt="" className="elizian-crest-img" />
          </button>
          <h1 className="elizian-brand-name">Elizian</h1>
          <button
            type="button"
            className="elizian-avatar-wrap"
            onClick={() => navigate("/profile")}
            aria-label="Profile"
          >
            {user?.first_name ? (
              <span className="elizian-avatar">{String(user.first_name[0]).toUpperCase()}</span>
            ) : (
              <span className="elizian-avatar elizian-avatar-icon">👤</span>
            )}
          </button>
        </div>
      </header>

      <main id="main-content" className="main-content">
        <div className="container main-container">
          <section className="elizian-hero">
            <h2 className="elizian-hero-title">Discover Curated Experiences</h2>
            <p className="elizian-hero-sub">Luxury. Premium. Members-only.</p>
          </section>

          <section className="search-section">
            <div className="search-wrapper">
              <div className="elizian-search-bar">
                <span className="elizian-search-icon" aria-hidden>🔍</span>
                <input
                  type="text"
                  className="elizian-search-input"
                  placeholder="Search dining, spa, events…"
                  aria-label="Search experiences"
                  value={searchKeyword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setSearchKeyword(v);
                    const lower = (v || "").trim().toLowerCase();
                    if (lower.includes("massage") || lower.includes("spa") || lower.includes("salon")) setActiveCategory("spa");
                    else if (lower.includes("concert") || lower.includes("event") || lower.includes("show") || lower.includes("ticket")) setActiveCategory("events");
                    else if (lower.includes("stay") || lower.includes("hotel") || lower.includes("resort")) setActiveCategory("travel");
                    else if (lower.includes("doctor") || lower.includes("clinic") || lower.includes("health")) setActiveCategory("healthcare");
                    else if (lower.includes("yoga") || lower.includes("wellness")) setActiveCategory("wellness");
                  }}
                />
                <button
                  type="button"
                  className={`elizian-filter-toggle ${activeFilter ? "active" : ""}`}
                  onClick={() => setIsFilterOpen(!isFilterOpen)}
                  aria-label="Toggle filters"
                >
                  <span className="filter-icon">⚙️</span>
                  {activeFilter && <span className="filter-badge">•</span>}
                </button>
              </div>

              {isFilterOpen && (
                <div className="elizian-filter-panel">
                  <div className="filter-header">
                    <h4>Sort by</h4>
                    <button
                      type="button"
                      className="clear-filters"
                      onClick={() => { setActiveFilter(null); setMaxDistanceKm(null); setMinRating(null); setPriceMin(null); setPriceMax(null); setCuisineTypes([]); setMealType([]); setTherapyType([]); setDurationMin(null); setDurationMax(null); setEventType([]); setEventDate(null); setStarRating(null); setRefundable(false); setSpecialization([]); setIsFilterOpen(false); }}
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="filter-options">
                    {filters.map((filter) => (
                      <button
                        type="button"
                        key={filter.id}
                        className={`filter-chip ${activeFilter === filter.id ? "active" : ""}`}
                        onClick={() => { setActiveFilter(filter.id); setIsFilterOpen(false); }}
                        aria-pressed={activeFilter === filter.id}
                      >
                        <span className="filter-chip-icon">{filter.icon}</span>
                        <span>{filter.name}</span>
                      </button>
                    ))}
                  </div>
                  <div className="filter-header" style={{ marginTop: "12px" }}>
                    <h4 style={{ fontSize: "0.9rem" }}>Filter (server)</h4>
                  </div>
                  <div className="filter-options">
                    <button
                      type="button"
                      className={`filter-chip ${maxDistanceKm === 10 ? "active" : ""}`}
                      onClick={() => { setMaxDistanceKm(maxDistanceKm === 10 ? null : 10); setIsFilterOpen(false); }}
                    >
                      📍 Within 10 km
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${maxDistanceKm === 25 ? "active" : ""}`}
                      onClick={() => { setMaxDistanceKm(maxDistanceKm === 25 ? null : 25); setIsFilterOpen(false); }}
                    >
                      📍 Within 25 km
                    </button>
                    <button
                      type="button"
                      className={`filter-chip ${minRating === 4 ? "active" : ""}`}
                      onClick={() => { setMinRating(minRating === 4 ? null : 4); setIsFilterOpen(false); }}
                    >
                      ⭐ 4+ rating
                    </button>
                    </div>
                  {(() => {
                    const { categoryFilters } = getFiltersForCategory(activeCategory);
                    if (categoryFilters.length === 0) return null;
                    const chips = [];
                    categoryFilters.forEach((f) => {
                      if (f.type === "multi-select" && f.options) {
                        f.options.slice(0, 5).forEach((opt) => {
                          const key = f.key;
                          const arr = key === "cuisine" ? cuisineTypes : key === "mealType" ? mealType : key === "therapyType" ? therapyType : key === "eventType" ? eventType : key === "specialization" ? specialization : [];
                          const isActive = arr.includes(opt);
                          const toggle = () => {
                            const setter = key === "cuisine" ? setCuisineTypes : key === "mealType" ? setMealType : key === "therapyType" ? setTherapyType : key === "eventType" ? setEventType : setSpecialization;
                            setter(isActive ? arr.filter((x) => x !== opt) : [...arr, opt]);
                            setIsFilterOpen(false);
                          };
                          chips.push(
                            <button key={`${f.key}-${opt}`} type="button" className={`filter-chip ${isActive ? "active" : ""}`} onClick={toggle}>
                              {opt}
                            </button>
                          );
                        });
                      } else if (f.type === "boolean" && f.apiKey === "refundable") {
                        chips.push(
                          <button key={f.key} type="button" className={`filter-chip ${refundable ? "active" : ""}`} onClick={() => { setRefundable(!refundable); setIsFilterOpen(false); }}>
                            Refundable
                          </button>
                        );
                      }
                    });
                    if (chips.length === 0) return null;
                    return (
                      <div className="filter-header" style={{ marginTop: "12px" }}>
                        <h4 style={{ fontSize: "0.9rem" }}>Category filters</h4>
                        <div className="filter-options">{chips}</div>
                      </div>
                    );
                  })()}
                </div>
              )}
            </div>
          </section>

          <section className="elizian-category-section">
            <div className="elizian-category-scroll">
              {categories.map((category) => (
                <button
                  key={category.id}
                  type="button"
                  className={`elizian-category-pill ${activeCategory === category.id ? "active" : ""}`}
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

          {/* Dynamic campaign sections (from active campaigns API) */}
          {activeCampaigns.length > 0 &&
            activeCampaigns.map((campaign) => {
              const offers = campaign.offers || [];
              const byCategory = activeCategory === "all" ? offers : offers.filter((o) => (o.service_type || "others") === (categoryToServiceType[activeCategory] || activeCategory));
              const q = (searchKeyword || "").trim().toLowerCase();
              const filtered = !q ? byCategory : byCategory.filter(
                (o) =>
                  (o.title && o.title.toLowerCase().includes(q)) ||
                  (o.partner_name && (o.partner_name || "").toLowerCase().includes(q)) ||
                  (o.description && o.description.toLowerCase().includes(q)) ||
                  (o.category_name && o.category_name.toLowerCase().includes(q)),
              );
              if (filtered.length === 0) return null;
              return (
                <section key={campaign.id} className="trending-section" style={{ marginBottom: "2rem" }}>
                  <div className="section-header">
                    <h2 className="section-title">
                      <span className="title-icon">🔥</span>
                      {campaign.name}
                    </h2>
                    {campaign.description && <span className="section-subtitle">{campaign.description}</span>}
                  </div>
                  <div className="trending-grid">
                    {filtered.map((item) => (
                      <div key={item.id} className="trending-card" onClick={(e) => handleDealCardClick(formatDealFromApi(item), e)}>
                        <div className="card-image" style={{ backgroundImage: `url(${item.image_url || item.image || "https://images.unsplash.com/photo-1544161515-4ab6ce6db874?ixlib=rb-4.0.3&auto=format&fit=crop&w=500&q=80"})` }} role="img" aria-label={item.title}>
                          <div className="card-badge trending">🔥 Trending</div>
                          {item.min_tier_name && (
                            <div className="card-badge" style={{ background: "rgba(167, 139, 250, 0.9)", color: "#fff" }} title={`Unlock at ${item.min_tier_name} tier`}>Unlock at {item.min_tier_name}</div>
                          )}
                          <div className="card-rating">
                            <span className="rating-star">⭐</span>
                            <span>{Number(item.rating || item.partner_rating || 4.5).toFixed(1)}</span>
                          </div>
                        </div>
                        <div className="card-content">
                          <div className="card-meta-row">
                            {item.category_name && <span className="card-category">{item.category_name}</span>}
                            {item.distance_km != null && <span className="card-distance">{formatDistance(item.distance_km)}</span>}
                          </div>
                          <h3 className="card-title">{item.title}</h3>
                          <p className="card-description">{item.description}</p>
                          <div className="card-footer">
                            <div className="card-price">{formatPriceLabel(formatDealFromApi(item))}</div>
                            <div className="card-actions">
                              {item.partner_id && (
                                <button className="card-action-btn" onClick={() => handleBookDeal(formatDealFromApi(item))} aria-label={`Book ${item.title}`}>
                                  Book
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              );
            })}

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
                  onClick={() => {
                    if (!showNearMe) {
                      if (navigator.geolocation) {
                        navigator.geolocation.getCurrentPosition(
                          (pos) => {
                            const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
                            setUserCoordinates(c);
                            setShowNearMe(true);
                            loadAllDeals(c);
                          },
                          () => setShowNearMe(false),
                          { enableHighAccuracy: false, timeout: 8000 }
                        );
                      } else setShowNearMe(false);
                    } else {
                      setShowNearMe(false);
                      loadAllDeals();
                    }
                  }}
                  aria-pressed={showNearMe}
                >
                  <span className="toggle-icon">📍</span>
                  <span>Near Me</span>
                </button>
                <button
                  className="view-all-btn"
                  onClick={() => navigate("/venues/map")}
                  style={{ marginLeft: "8px" }}
                  title="View venues on map"
                >
                  Map
                </button>
                <button
                  className="view-all-btn"
                  onClick={() => navigate("/trending")}
                  style={{ marginLeft: "8px" }}
                  title="View all trending"
                >
                  View all
                </button>
                <span className="section-subtitle">Popular this week</span>
              </div>
            </div>

            {loading ? (
              <div className="trending-grid" style={{ gap: "1rem" }}>
                <SkeletonLoader variant="card" count={6} />
              </div>
            ) : trendingSortedByDistance.length === 0 ? (
              <div className="empty-state">
                <p>
                  {searchKeyword?.trim()
                    ? `No experiences match "${searchKeyword.trim()}".`
                    : `No trending experiences found${activeCategory !== "all" ? " in " + (categories.find((c) => c.id === activeCategory)?.name ?? "") : ""}.`}
                </p>
              </div>
            ) : (
              <div className="trending-scroll-container">
                {trendingSortedByDistance.map((item) => (
                  <div
                    key={item.id}
                    className="trending-card trending-scroll-card"
                    onClick={(e) => handleDealCardClick(item, e)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDealCardClick(item, e); } }}
                    aria-label={`View details for ${item.title}`}
                  >
                    <div
                      className="card-image"
                      style={{ backgroundImage: `url(${item.image || item.image_url})` }}
                      role="img"
                      aria-label={item.title}
                    >
                      <div className="card-badge trending">🔥 Trending</div>
                      {item.min_tier_name && (
                        <div className="card-badge" style={{ background: "rgba(167, 139, 250, 0.9)", color: "#fff" }} title={`Unlock at ${item.min_tier_name} tier`}>Unlock at {item.min_tier_name}</div>
                      )}
                      <div className="card-rating">
                        <span className="rating-star">⭐</span>
                        <span>{Number(item.rating).toFixed(1)}</span>
                      </div>
                    </div>
                    <div className="card-content">
                      <div className="card-meta-row">
                        {item.category_name && <span className="card-category">{item.category_name}</span>}
                        <span className="card-distance">{formatDistance(item.distanceKmClient ?? item.distance_km)}</span>
                      </div>
                      <h3 className="card-title">{item.title}</h3>
                      {(item.perk_type && item.perk_type !== "discount") || item.perk_description ? (
                        <p className="card-perks">{item.perk_description || (item.perk_type === "free_item" ? "Free item" : item.perk_type === "secret_menu" ? "Secret menu" : item.perk_type === "priority_access" ? "Priority access" : item.perk_type)}</p>
                      ) : null}
                      <p className="card-description">{item.description}</p>
                      <div className="card-footer">
                        <div className="card-price">
                          {formatPriceLabel(item)}
                        </div>
                        <div className="card-actions">
                          {item.partner_id && (
                            <button
                              type="button"
                              className="card-link-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/venue/${item.partner_id}`);
                              }}
                            >
                              View venue
                            </button>
                          )}
                          <button
                            type="button"
                            className="card-action-btn"
                            onClick={(e) => { e.stopPropagation(); handleBookDeal(item); }}
                          >
                            Book Now
                          </button>
                        </div>
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
          <section className="home-section restaurants-section">
            <div className="section-header-modern">
              <div className="section-header-accent" aria-hidden />
              <h2 className="section-title-modern">
                <span className="title-icon">🍽️</span>
                Top Restaurants Near You
              </h2>
              <button
                className="view-all-btn-modern"
                onClick={() => {
                  setActiveCategory("dining");
                  setTimeout(() => {
                    document.getElementById("all-partner-deals")?.scrollIntoView({ behavior: "smooth" });
                  }, 100);
                }}
              >
                View all
              </button>
            </div>

            {loading ? (
              <div className="loading-state-modern">
                <p>Loading restaurants...</p>
              </div>
            ) : topRestaurants.length === 0 ? (
              <div className="empty-state-modern">
                <p>No restaurants found near you.</p>
              </div>
            ) : (
              <div className="restaurants-scroll-container">
                {topRestaurants.map((restaurant) => (
                  <div
                    key={restaurant.id}
                    className="home-card restaurant-scroll-card"
                    onClick={(e) => handleDealCardClick(restaurant, e)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDealCardClick(restaurant, e); } }}
                    aria-label={`View ${restaurant.title}`}
                  >
                    <div
                      className="home-card-image"
                      style={{ backgroundImage: `url(${restaurant.image})` }}
                      role="img"
                      aria-label={restaurant.title}
                    >
                      <div className="home-card-badge rating">⭐ {Number(restaurant.rating).toFixed(1)}</div>
                    </div>
                    <div className="home-card-body">
                      <h3 className="home-card-title">{restaurant.title}</h3>
                      <p className="home-card-meta">{restaurant.category_name || "Multi-cuisine"} · {restaurant.priceRange || "$$"}</p>
                      <div className="home-card-footer">
                        <span className="home-card-distance">{restaurant.distanceFormatted || "—"}</span>
                        <button
                          type="button"
                          className="home-card-cta"
                          onClick={(e) => { e.stopPropagation(); handleBookDeal(restaurant); }}
                        >
                          Book
                        </button>
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
          <section className="home-section events-section">
            <div className="section-header-modern">
              <div className="section-header-accent live" aria-hidden />
              <h2 className="section-title-modern">
                <span className="title-icon">🎪</span>
                Live Now
              </h2>
              <span className="section-subtitle-modern">Happening right now</span>
            </div>

            {loading ? (
              <div className="loading-state-modern">
                <p>Loading live events...</p>
              </div>
            ) : liveEvents.length === 0 ? (
              <div className="empty-state-modern">
                <p>No live events at the moment.</p>
              </div>
            ) : (
              <div className="events-scroll-container">
                {liveEventsWithDistance.map((event) => (
                  <div
                    key={event.id}
                    className="home-card event-scroll-card"
                    onClick={(e) => handleDealCardClick(event, e)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDealCardClick(event, e); } }}
                    aria-label={`Join ${event.title}`}
                  >
                    <div
                      className="home-card-image"
                      style={{ backgroundImage: `url(${event.image})` }}
                      role="img"
                      aria-label={event.title}
                    >
                      <div className="home-card-badge live">LIVE</div>
                    </div>
                    <div className="home-card-body">
                      <h3 className="home-card-title">{event.title}</h3>
                      <p className="home-card-meta">{event.category_name || "Event"}</p>
                      <div className="home-card-meta-row">
                        <span>🕒 {event.start_date ? new Date(event.start_date).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "Ongoing"}</span>
                        <span>📍 {event.location || event.partner_name || "—"}</span>
                        <span className="home-card-distance">📍 {formatDistance(event.distanceKmClient ?? event.distance_km)}</span>
                      </div>
                      <button
                        type="button"
                        className="home-card-cta primary"
                        onClick={(e) => { e.stopPropagation(); handleBookDeal(event); }}
                      >
                        Join now
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
          <section className="home-section upcoming-section">
            <div className="section-header-modern">
              <div className="section-header-accent upcoming" aria-hidden />
              <h2 className="section-title-modern">
                <span className="title-icon">🎭</span>
                Upcoming Events
              </h2>
              <button
                className="view-all-btn-modern"
                onClick={() => navigate("/events")}
              >
                View all
              </button>
            </div>

            {loading ? (
              <div className="loading-state-modern">
                <p>Loading upcoming events...</p>
              </div>
            ) : upcomingEvents.length === 0 ? (
              <div className="empty-state-modern">
                <p>No upcoming events scheduled.</p>
              </div>
            ) : (
              <div className="upcoming-scroll-container">
                {upcomingEventsWithDistance.map((event) => (
                  <div
                    key={`upcoming-${event.id}`}
                    className="home-card upcoming-scroll-card"
                    onClick={(e) => handleDealCardClick(event, e)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handleDealCardClick(event, e); } }}
                    aria-label={`View ${event.title}`}
                  >
                    <div
                      className="home-card-image"
                      style={{ backgroundImage: `url(${event.image})` }}
                      role="img"
                      aria-label={event.title}
                    />
                    <div className="home-card-body compact">
                      <h4 className="home-card-title small">{event.title}</h4>
                      <p className="home-card-meta">
                        {event.category_name || "Event"} · {event.start_date ? new Date(event.start_date).toLocaleDateString("en-IN", { month: "short", day: "numeric" }) : "Soon"}
                      </p>
                      <p className="home-card-distance">📍 {formatDistance(event.distanceKmClient ?? event.distance_km)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ============================================
              5. ALL PARTNER DEALS (Affected by category filter)
              ============================================ */}
          <section id="all-partner-deals" className="home-section deals-section">
            <div className="section-header-modern">
              <div className="section-header-accent deals" aria-hidden />
              <h2 className="section-title-modern">
                <span className="title-icon">🎁</span>
                All Partner Deals
              </h2>
              <span className="section-subtitle-modern">Discover amazing deals</span>
            </div>

            {loading ? (
              <div className="loading-state-modern">
                <p>Loading deals...</p>
              </div>
            ) : searchFilteredPartnerDealsWithDistance.length === 0 ? (
              <div className="empty-state-modern">
                <p>
                  {searchKeyword?.trim()
                    ? `No deals match "${searchKeyword.trim()}".`
                    : `No deals available${activeCategory !== "all" ? " in " + (categories.find((c) => c.id === activeCategory)?.name ?? "") : ""}.`}
                </p>
              </div>
            ) : (
              <div className="deals-scroll-container">
                {searchFilteredPartnerDealsWithDistance.map((deal) => (
                  <div key={deal.id} className="deals-scroll-card">
                    <ExperienceCard
                      deal={deal}
                      onBook={handleBookDeal}
                      formatPrice={formatPrice}
                      formatPriceLabel={formatPriceLabel}
                      formatDistance={formatDistance}
                    />
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

      <style>{`
        .elizian-theme {
          --primary-color: #D4AF37;
          --secondary-color: #5B4BB4;
          --accent-color: #D4AF37;
          --text-color: #F3F4F6;
          --text-light: #9CA3AF;
          --bg-color: #111827;
          --bg-light: #0B0F1A;
          --border-color: rgba(212, 175, 55, 0.2);
          --shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
          --shadow-lg: 0 20px 60px rgba(0, 0, 0, 0.5);
          --radius: 12px;
          --radius-sm: 8px;
          --radius-xl: 20px;
          min-height: 100vh;
          padding-bottom: 80px;
          background: var(--bg-light);
          color: var(--text-color);
        }

        .elizian-container * {
          box-sizing: border-box;
        }

        .main-container {
          width: 100%;
        }
        .elizian-container .container {
          max-width: auto;
          margin: 0 auto;
          padding: 0 16px;
        }

        .elizian-container .main-content {
          padding-bottom: 80px;
        }

        .skip-link {
          position: absolute;
          top: -40px;
          left: 0;
          background: var(--primary-color);
          color: #0B0F1A;
          padding: 8px;
          z-index: 1000;
          text-decoration: none;
        }

        .skip-link:focus {
          top: 0;
        }

        .elizian-header-minimal {
          position: sticky;
          top: 0;
          z-index: 100;
          background: rgba(11, 15, 26, 0.9);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(212, 175, 55, 0.1);
          transition: background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        @media (min-width: 769px) {
          .elizian-header-minimal {
            display: none;
          }
        }

        .elizian-header-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 12px 16px;
          max-width: 1200px;
          margin: 0 auto;
        }

        .elizian-logo-crest {
          background: none;
          border: none;
          padding: 4px;
          cursor: pointer;
        }

        .elizian-crest-img {
          width: 32px;
          height: 32px;
          display: block;
          filter: brightness(1.1);
        }

        .elizian-brand-name {
          font-family: var(--font-serif), Georgia, serif;
          font-size: 1.5rem;
          font-weight: 600;
          color: var(--text-color);
          letter-spacing: 0.02em;
          margin: 0;
        }

        .elizian-avatar-wrap {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: 1px solid rgba(212, 175, 55, 0.3);
          background: rgba(17, 24, 39, 0.8);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .elizian-avatar-wrap:hover {
          border-color: var(--primary-color);
          box-shadow: 0 0 12px rgba(212, 175, 55, 0.2);
        }

        .elizian-avatar {
          font-size: 0.9rem;
          font-weight: 600;
          color: var(--primary-color);
        }

        .elizian-avatar-icon {
          font-size: 1rem;
        }

        .elizian-hero {
          padding: 2.5rem 0 2rem;
          text-align: center;
          animation: elizian-fade-in 0.6s cubic-bezier(0.4, 0, 0.2, 1) forwards;
        }
        @media (min-width: 769px) {
          .elizian-hero {
            padding: 0.75rem 0 1rem;
          }
          .search-section {
            padding: 0.5rem 0 0.75rem;
          }
          .elizian-category-section {
            padding: 0.5rem 0 1rem;
          }
          .main-content .container {
            padding-top: 0;
          }
        }

        @keyframes elizian-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .elizian-hero-title {
          font-family: var(--font-serif), Georgia, serif;
          font-size: clamp(1.75rem, 5vw, 2.5rem);
          font-weight: 700;
          color: var(--text-color);
          letter-spacing: -0.02em;
          line-height: 1.2;
          margin: 0 0 0.75rem 0;
        }

        .elizian-hero-sub {
          font-size: 0.95rem;
          color: var(--text-light);
          letter-spacing: 0.04em;
          margin: 0;
        }

        .elizian-search-bar {
          display: flex;
          align-items: center;
          gap: 12px;
          background: rgba(17, 24, 39, 0.7);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border: 1px solid rgba(212, 175, 55, 0.25);
          border-radius: 16px;
          padding: 12px 16px;
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }

        .elizian-search-bar:focus-within {
          border-color: rgba(212, 175, 55, 0.5);
          box-shadow: 0 0 0 1px rgba(212, 175, 55, 0.15);
        }

        .elizian-search-icon {
          font-size: 1rem;
          opacity: 0.8;
        }

        .elizian-search-input {
          flex: 1;
          border: none;
          background: transparent;
          color: var(--text-color);
          font-size: 1rem;
          outline: none;
        }

        .elizian-search-input::placeholder {
          color: var(--text-light);
        }

        .elizian-filter-toggle {
          background: none;
          border: none;
          color: var(--text-light);
          cursor: pointer;
          padding: 4px;
        }

        .elizian-filter-toggle.active {
          color: var(--primary-color);
        }

        .elizian-category-section {
          padding: 1rem 0 1.25rem;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
          scrollbar-width: none;
        }

        .elizian-category-section::-webkit-scrollbar {
          display: none;
        }

        .elizian-category-scroll {
          display: flex;
          gap: 10px;
          padding-bottom: 4px;
        }

        .elizian-category-pill {
          flex-shrink: 0;
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 16px;
          background: rgba(17, 24, 39, 0.6);
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 20px;
          color: var(--text-light);
          font-size: 0.875rem;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }

        .elizian-category-pill:hover {
          border-color: rgba(212, 175, 55, 0.3);
          color: var(--text-color);
        }

        .elizian-category-pill.active {
          background: rgba(212, 175, 55, 0.15);
          border-color: rgba(212, 175, 55, 0.4);
          color: var(--primary-color);
        }

        .elizian-filter-panel {
          position: absolute;
          top: 100%;
          left: 0;
          right: 0;
          margin-top: 8px;
          background: var(--bg-color);
          border: 1px solid var(--border-color);
          border-radius: var(--radius);
          padding: 16px;
          box-shadow: var(--shadow-lg);
          z-index: 10;
          color: var(--text-color);
        }
        .elizian-filter-panel h4,
        .elizian-filter-panel .filter-header {
          color: var(--text-color);
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
          color: #0B0F1A;
          transition: opacity 0.25s ease, box-shadow 0.25s ease;
        }

        .btn-primary:hover {
          opacity: 0.95;
          box-shadow: 0 0 16px rgba(212, 175, 55, 0.3);
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
          transition: all 0.25s ease;
          color: var(--text-color);
        }

        .filter-chip.active {
          background: var(--primary-color);
          color: #0B0F1A;
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
          padding: 48px 24px;
          min-height: 200px;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: var(--text-light);
        }

        .loading-state p,
        .empty-state p {
          margin: 0;
          font-size: 1rem;
          color: var(--text-color);
        }

        .trending-grid,
        .restaurants-grid,
        .events-grid {
          display: grid;
          gap: 20px;
        }

        /* Trending Experiences: single horizontal scroll row, swipeable on mobile */
        .trending-scroll-container {
          display: flex;
          overflow-x: auto;
          gap: 16px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 8px;
          scrollbar-width: none;
        }
        .trending-scroll-container::-webkit-scrollbar {
          display: none;
        }
        .trending-scroll-container .trending-scroll-card {
          min-width: 280px;
          max-width: 280px;
          flex-shrink: 0;
          scroll-snap-align: start;
          border-radius: 20px;
          overflow: hidden;
          border: 1px solid rgba(212, 175, 55, 0.12);
          transition: border-color 0.25s ease, box-shadow 0.25s ease;
        }
        .trending-scroll-container .trending-scroll-card:hover {
          border-color: rgba(212, 175, 55, 0.35);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
        }
        .trending-scroll-container .card-image {
          height: 180px;
          position: relative;
        }
        .trending-scroll-container .card-image::after {
          content: "";
          position: absolute;
          inset: 0;
          background: linear-gradient(to top, rgba(11, 15, 26, 0.85) 0%, transparent 50%);
          pointer-events: none;
        }
        .trending-scroll-container .card-content {
          position: relative;
          margin-top: -48px;
          padding: 12px 14px 16px;
          z-index: 1;
        }
        .trending-scroll-container .card-title {
          font-family: var(--font-serif), Georgia, serif;
          font-size: 1.15rem;
          color: var(--text-color);
        }
        .trending-scroll-container .card-distance {
          font-size: 0.75rem;
          color: var(--text-light);
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
          transition:
            transform 0.2s,
            box-shadow 0.2s;
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
          background: var(--primary-color);
          color: #0B0F1A;
          font-size: 0.7rem;
          padding: 4px 10px;
          border-radius: 8px;
        }

        .card-badge.perk {
          top: 12px;
          left: auto;
          right: 12px;
          background: #059669;
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

        .card-meta-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 6px;
          flex-wrap: wrap;
        }
        .card-category {
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--primary-color);
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .card-distance {
          font-size: 0.8rem;
          color: var(--text-light);
        }
        .card-perks {
          font-size: 0.8rem;
          color: #059669;
          margin-bottom: 6px;
          font-style: italic;
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

        .card-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .card-link-btn {
          padding: 6px 12px;
          background: transparent;
          color: var(--primary-color);
          border: 1px solid var(--primary-color);
          border-radius: var(--radius-sm);
          font-size: 0.875rem;
          cursor: pointer;
        }

        .card-link-btn:hover {
          background: rgba(0, 0, 0, 0.05);
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

        /* ========== HOME SECTIONS: Futuristic global / app-like ========== */
        .home-section {
          margin-bottom: 2.5rem;
          padding: 0;
        }
        .home-section:last-of-type {
          margin-bottom: 3rem;
        }

        .section-header-modern {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px 16px;
          margin-bottom: 1.25rem;
          padding-bottom: 0.75rem;
          position: relative;
        }
        .section-header-accent {
          position: absolute;
          left: 0;
          bottom: 0;
          width: 40px;
          height: 3px;
          border-radius: 2px;
          background: linear-gradient(90deg, var(--primary-color), var(--secondary-color));
        }
        .section-header-accent.live {
          background: linear-gradient(90deg, #10b981, #059669);
        }
        .section-header-accent.upcoming {
          background: linear-gradient(90deg, #8b5cf6, #6366f1);
        }
        .section-header-accent.deals {
          background: linear-gradient(90deg, var(--accent-color), #f97316);
        }
        .section-title-modern {
          display: flex;
          align-items: center;
          gap: 8px;
          font-family: var(--font-serif), Georgia, serif;
          font-size: 1.35rem;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text-color);
          margin: 0;
        }
        .title-icon {
          font-size: 1.2rem;
        }
        .section-subtitle-modern {
          font-size: 0.8rem;
          color: var(--text-light);
          margin-left: auto;
        }
        .view-all-btn-modern {
          margin-left: auto;
          padding: 8px 14px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--primary-color);
          background: rgba(0, 79, 74, 0.08);
          border: none;
          border-radius: 20px;
          cursor: pointer;
          transition: background 0.2s, color 0.2s;
        }
        .view-all-btn-modern:hover {
          background: rgba(0, 79, 74, 0.14);
        }

        .loading-state-modern,
        .empty-state-modern {
          text-align: center;
          padding: 2.5rem 1rem;
          min-height: 140px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .loading-state-modern p,
        .empty-state-modern p {
          margin: 0;
          font-size: 0.95rem;
          color: var(--text-light);
        }

        /* Horizontal scroll rows (mobile-first, swipeable) */
        .restaurants-scroll-container,
        .events-scroll-container,
        .upcoming-scroll-container {
          display: flex;
          overflow-x: auto;
          gap: 16px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 12px;
          scrollbar-width: none;
        }
        .restaurants-scroll-container::-webkit-scrollbar,
        .events-scroll-container::-webkit-scrollbar,
        .upcoming-scroll-container::-webkit-scrollbar {
          display: none;
        }

        .home-card {
          flex-shrink: 0;
          scroll-snap-align: start;
          background: var(--bg-color);
          border-radius: 16px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.06);
          transition: transform 0.2s ease, box-shadow 0.2s ease;
          border: 1px solid rgba(0, 0, 0, 0.04);
        }
        .home-card:hover,
        .home-card:focus-visible {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
        }
        .restaurant-scroll-card,
        .event-scroll-card,
        .upcoming-scroll-card {
          min-width: 280px;
          max-width: 280px;
        }

        .home-card-image {
          height: 160px;
          background-size: cover;
          background-position: center;
          position: relative;
        }
        .home-card-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 4px 10px;
          border-radius: 8px;
          font-size: 0.75rem;
          font-weight: 600;
          background: rgba(0, 0, 0, 0.65);
          color: #fff;
        }
        .home-card-badge.live {
          background: linear-gradient(135deg, #10b981, #059669);
          left: auto;
          right: 10px;
        }
        .home-card-badge.rating {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .home-card-body {
          padding: 14px;
        }
        .home-card-body.compact {
          padding: 10px 12px;
        }
        .home-card-title {
          font-size: 1.05rem;
          font-weight: 600;
          margin: 0 0 4px 0;
          color: var(--text-color);
          line-height: 1.3;
        }
        .home-card-title.small {
          font-size: 0.95rem;
        }
        .home-card-meta {
          font-size: 0.8rem;
          color: var(--text-light);
          margin: 0 0 10px 0;
          line-height: 1.4;
        }
        .home-card-meta-row {
          display: flex;
          flex-direction: column;
          gap: 4px;
          font-size: 0.75rem;
          color: var(--text-light);
          margin-bottom: 12px;
        }
        .home-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }
        .home-card-distance {
          font-size: 0.8rem;
          color: var(--text-light);
        }
        .home-card-cta {
          padding: 8px 14px;
          font-size: 0.8rem;
          font-weight: 600;
          color: var(--primary-color);
          background: rgba(0, 79, 74, 0.1);
          border: none;
          border-radius: 10px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .home-card-cta:hover {
          background: rgba(0, 79, 74, 0.18);
        }
        .home-card-cta.primary {
          width: 100%;
          background: var(--primary-color);
          color: #fff;
        }
        .home-card-cta.primary:hover {
          background: #00423d;
        }

        .deals-scroll-container {
          display: flex;
          overflow-x: auto;
          gap: 16px;
          scroll-snap-type: x mandatory;
          -webkit-overflow-scrolling: touch;
          padding-bottom: 12px;
          scrollbar-width: none;
        }
        .deals-scroll-container::-webkit-scrollbar {
          display: none;
        }
        .deals-scroll-card {
          min-width: 280px;
          max-width: 280px;
          flex-shrink: 0;
          scroll-snap-align: start;
        }
        .deals-scroll-card .experience-card {
          width: 100%;
          max-width: 280px;
        }

        @media (max-width: 767px) {
          .container {
            padding: 0 16px;
          }

          .elizian-header-inner {
            padding: 8px 12px;
          }

          .elizian-hero {
            padding: 1rem 0 1rem;
          }

          .elizian-hero-title {
            margin-bottom: 0.35rem;
            font-size: clamp(1.4rem, 5vw, 1.75rem);
          }

          .elizian-hero-sub {
            font-size: 0.85rem;
          }

          .search-section {
            padding: 0.5rem 0;
            width: 100%;
          }
          .search-section .search-wrapper {
            width: 100%;
          }
          .search-section .elizian-search-bar {
            width: 100%;
            box-sizing: border-box;
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

        /* Desktop only: 1024px+ — wider content, less side margins, trending uses width, mobile untouched */
        @media (min-width: 1024px) {
          body {
            padding-left: 0;
            padding-right: 0;
          }
          .elizian-container .container.main-container,
          .main-container {
            width: 100%;
            max-width: 1400px;
            margin: 0 auto;
            padding-left: 40px;
            padding-right: 40px;
            box-sizing: border-box;
          }
          .elizian-container .elizian-hero {
            min-height: auto;
            max-width: 1100px;
            margin-left: auto;
            margin-right: auto;
            padding-top: 20px;
            padding-bottom: 16px;
            text-align: center;
          }
          .elizian-container .elizian-hero-title {
            margin-bottom: 0.35rem;
            text-align: center;
          }
          .elizian-container .elizian-hero-sub {
            margin-top: 0.25rem;
            text-align: center;
          }
          .elizian-container .search-section {
            padding-top: 0;
            padding-bottom: 0.5rem;
            display: block;
          }
          .elizian-container .search-section .search-wrapper {
            width: 100%;
            max-width: 600px;
            margin-top: 24px;
            margin-left: auto;
            margin-right: auto;
            margin-bottom: 0;
          }
          .elizian-container .search-section .elizian-search-bar {
            width: 100%;
            box-sizing: border-box;
          }
          .elizian-container .elizian-category-section {
            margin-top: 12px;
            overflow-x: visible;
            overflow-y: visible;
            padding: 0.5rem 0 1rem;
            -webkit-overflow-scrolling: unset;
          }
          .elizian-container .elizian-category-scroll {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-start;
            gap: 10px 12px;
            padding-bottom: 0;
          }
          .elizian-container .elizian-category-pill {
            flex-shrink: 0;
          }
          .elizian-container .trending-section {
            width: 100%;
            margin-top: 24px;
            box-sizing: border-box;
          }
          .elizian-container .trending-scroll-container {
            max-width: 100%;
            gap: 24px;
          }
          .elizian-container .trending-scroll-container .trending-scroll-card {
            min-width: 320px;
            max-width: 320px;
          }
          .elizian-container .experience-card {
            min-width: 320px;
          }
        }
        @media (min-width: 1600px) {
          .elizian-container .container.main-container,
          .main-container {
            max-width: 1500px;
          }
        }
      `}</style>
    </div>
  );
};

export default HomePage;
