# JavaScript Files Index

## 📍 Complete Location Guide

---

## 🔵 **REACT COMPONENTS** (New Migration - frontend/src/)

### Core Files
- `frontend/src/index.js` - React entry point
- `frontend/src/App.js` - Main router component

### API
- `frontend/src/api/axios.js` - Axios instance for API calls

### Pages (React Components)
- `frontend/src/pages/LandingPage.js` ✅ (Complete)
- `frontend/src/pages/LoginPage.js` ✅ (Complete)
- `frontend/src/pages/OTPScreen.js` ✅ (Complete)
- `frontend/src/pages/SignupPage.js` ✅ (Complete)
- `frontend/src/pages/HomePage.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/PartnerConsole.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/PartnerLogin.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/AdminLogin.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/AdminDashboard.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/EventBooking.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/WellnessPage.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/HealthWellnessPage.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/DataEntry.js` ⏳ (Stub - needs migration)
- `frontend/src/pages/MultiTierAdmin.js` ⏳ (Stub - needs migration)

---

## 🟢 **FRONTEND VANILLA JS** (Old HTML Files - frontend/public/js/)

### Core Modules
- `frontend/public/js/core/config.js` - Central configuration (API URLs, tier percentages, etc.)
- `frontend/public/js/core/api.js` - API wrapper functions
- `frontend/public/js/core/auth.js` - Authentication functions
- `frontend/public/js/core/storage.js` - LocalStorage utilities

### UI Components
- `frontend/public/js/ui/navigation.js` - Screen navigation logic
- `frontend/public/js/ui/navigation-bar.js` - Navigation bar component
- `frontend/public/js/ui/notifications.js` - Toast/notification system
- `frontend/public/js/ui/map.js` - Map integration (Leaflet)

### Features
- `frontend/public/js/features/events.js` - Event management
- `frontend/public/js/features/restaurants.js` - Restaurant features
- `frontend/public/js/features/payments.js` - Payment processing
- `frontend/public/js/features/paymentCalculator.js` - Payment calculations
- `frontend/public/js/features/rewards.js` - Rewards/tokens system

### Utilities
- `frontend/public/js/utils/utils.js` - General utility functions
- `frontend/public/js/utils/validators.js` - Form validation functions

**Note:** These files are used by the HTML files (`index.html`, `partner-console.html`, etc.) and need to be migrated to React hooks/components.

---

## 🔴 **BACKEND NODE.JS** (backend/)

### Main Server
- `backend/server.js` ⭐ - **Main Express server** (primary entry point)
- `backend/server-modular.js` - Alternative modular server structure

### Configuration
- `backend/config/database.js` - PostgreSQL connection pool

### Middleware
- `backend/middleware/validation.js` - Input validation (email, phone, password, etc.)
- `backend/middleware/rbac.js` - Role-based access control
- `backend/middleware/validateAvailability.js` - Availability validation

### Routes
- `backend/routes/auth.js` - Authentication routes (register, login, OTP)
- `backend/routes/partners.js` - Partner management routes
- `backend/routes/categories.js` - Category management
- `backend/routes/serviceTypes.js` - Service type routes
- `backend/routes/subcategories.js` - Subcategory routes
- `backend/routes/eznet/events.js` - Events API
- `backend/routes/eznet/bookings.js` - Booking API
- `backend/routes/eznet/venues.js` - Venue API
- `backend/routes/eznet/reviews.js` - Reviews API

### Utilities & Services
- `backend/utils/lifecycle.js` - Lifecycle management utilities
- `backend/emailService.js` - Email sending service
- `backend/multi_tier_apis.js` - Multi-tier partner APIs

### Scripts
- `backend/scripts/seed_data.js` - Database seeding script
- `backend/generate-jwt-secret.js` - JWT secret generator

---

## 📊 Migration Status

### ✅ Completed (React)
- Landing Page
- Login Page
- OTP Screen
- Signup Page

### ⏳ In Progress / Needs Migration
- All remaining pages (HomePage, PartnerConsole, AdminDashboard, etc.)
- Frontend vanilla JS modules → React hooks/components
- State management (Context API)

### 📝 Still in Use (HTML Files)
- All files in `frontend/public/js/` are still actively used by HTML files
- These will be migrated gradually as pages are converted

---

## 🎯 Key Files to Migrate Next

### Priority 1: Core Functionality
1. `frontend/public/js/core/auth.js` → React Context (AuthContext)
2. `frontend/public/js/core/api.js` → React hooks (useApi)
3. `frontend/public/js/core/storage.js` → React hooks (useStorage)

### Priority 2: Feature Modules
1. `frontend/public/js/features/events.js` → React components/hooks
2. `frontend/public/js/features/payments.js` → React components
3. `frontend/public/js/ui/navigation.js` → React Router (already done)

### Priority 3: Utilities
1. `frontend/public/js/utils/validators.js` → React hooks or utility functions
2. `frontend/public/js/utils/utils.js` → Keep as utility functions

---

## 📁 File Count Summary

- **React Components:** 17 files
- **Frontend Vanilla JS:** 14 files
- **Backend Node.js:** 15+ files
- **Total:** 46+ JavaScript files

---

## 🔗 Quick Reference

- **React Entry:** `frontend/src/index.js`
- **Backend Entry:** `backend/server.js`
- **API Config:** `frontend/public/js/core/config.js` (old) or `frontend/src/api/axios.js` (new)
- **Auth Logic:** `backend/routes/auth.js` (backend) + `frontend/public/js/core/auth.js` (old frontend)

