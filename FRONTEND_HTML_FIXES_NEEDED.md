# Core Frontend HTML Files - Fix Priority List

## 🎯 Modified Files Requiring Review

Based on git status, these are the **core frontend HTML files** that have been modified and need fixing:

### 1. 🔴 **CRITICAL: `frontend/public/index.html`**
   - **Purpose**: Main customer-facing application (Events & Entertainment)
   - **Changes**: +743 lines (MAJOR REFACTOR)
   - **Issues to Check**:
     - API endpoint URLs (should use `/api/v1/` prefix)
     - Authentication flow integration
     - Error handling and user feedback
     - Mobile responsiveness
     - Asset/image paths
     - JavaScript module imports
     - Event listeners and initialization
   - **Dependencies**:
     - `js/core/api.js`
     - `js/core/auth.js`
     - `js/core/storage.js`
     - `js/features/events.js`
     - `js/features/restaurants.js`
     - `js/features/rewards.js`
     - `css/styles.css`

### 2. 🔴 **HIGH: `frontend/public/partner-console.html`**
   - **Purpose**: Partner dashboard for managing offers and bookings
   - **Changes**: +267 lines (SIGNIFICANT UPDATES)
   - **Issues to Check**:
     - Partner authentication
     - API endpoints for partner operations
     - Offer creation/editing forms
     - Image upload functionality
     - Dashboard statistics
     - Booking management
   - **Dependencies**:
     - Partner authentication system
     - File upload APIs
     - `js/core/api.js`

### 3. 🟡 **MEDIUM: `frontend/public/admin.html`**
   - **Purpose**: Admin console for system management
   - **Changes**: -1 line (MINOR)
   - **Issues to Check**:
     - Admin role verification
     - Bulk operations (approve/reject deals)
     - User management
     - Partner approval workflow
     - System settings
   - **Dependencies**:
     - `js/admin.js`
     - `css/admin.css`

---

## 📋 Additional HTML Files (Not Modified, But Should Be Reviewed)

### 4. `frontend/public/admin-login.html`
   - **Purpose**: Admin authentication page
   - **Priority**: 🟡 MEDIUM
   - **Check**: Email/password login, JWT handling

### 5. `frontend/public/partner-login.html`
   - **Purpose**: Partner authentication page
   - **Priority**: 🟡 MEDIUM
   - **Check**: Partner login flow, redirect after auth

### 6. `frontend/public/multi-tier-admin.html`
   - **Purpose**: Multi-tier partner management
   - **Priority**: 🟢 LOW
   - **Check**: Tier system integration

### 7. `frontend/public/data-entry.html`
   - **Purpose**: Data entry interface
   - **Priority**: 🟢 LOW
   - **Check**: Form validation, data submission

---

## 🔧 Common Issues to Fix Across All HTML Files

### 1. **API Endpoint URLs**
   - ❌ Old: `/api/auth/...`, `/api/offers/...`
   - ✅ New: `/api/v1/auth/...`, `/api/v1/offers/...`

### 2. **Authentication Flow**
   - Ensure proper JWT token storage
   - Check token refresh logic
   - Verify logout functionality
   - Handle 401/403 errors

### 3. **Error Handling**
   - Display user-friendly error messages
   - Log errors for debugging
   - Handle network failures gracefully

### 4. **Mobile Responsiveness**
   - Check viewport meta tags
   - Test on mobile devices
   - Ensure touch-friendly UI

### 5. **Asset Loading**
   - Verify image paths
   - Check CDN/external resource URLs
   - Optimize loading performance

### 6. **JavaScript Dependencies**
   - Ensure all scripts are loaded in correct order
   - Check for module conflicts
   - Verify ES6 module imports

### 7. **CORS Issues**
   - Ensure backend CORS is configured
   - Check credentials mode for API calls
   - Verify allowed origins

---

## 🚀 Recommended Fix Order

1. **Phase 1 - Authentication** (All login pages)
   - Fix admin-login.html
   - Fix partner-login.html
   - Update auth.js core module

2. **Phase 2 - Main Customer App**
   - Fix index.html (biggest changes)
   - Update related JS modules in js/features/
   - Test event browsing, restaurant deals, rewards

3. **Phase 3 - Partner Portal**
   - Fix partner-console.html
   - Test offer creation/editing
   - Verify image uploads

4. **Phase 4 - Admin Console**
   - Fix admin.html
   - Test bulk operations
   - Verify partner approval workflow

5. **Phase 5 - Additional Tools**
   - Fix multi-tier-admin.html
   - Fix data-entry.html

---

## 📊 Change Statistics

```
File                                  Lines Changed
----------------------------------------------------
frontend/public/index.html            +743 lines
frontend/public/partner-console.html  +267 lines
frontend/public/admin.html            -1 line
----------------------------------------------------
Total:                                +1009 lines
```

---

## ✅ Testing Checklist

After fixing each HTML file:

- [ ] Page loads without console errors
- [ ] API calls use correct endpoints (/api/v1/*)
- [ ] Authentication works (login/logout)
- [ ] Forms submit properly
- [ ] Images/assets load correctly
- [ ] Mobile responsive design works
- [ ] Error messages display properly
- [ ] Navigation works between pages
- [ ] Local storage persistence works
- [ ] JWT token refresh works

---

## 🔗 Related Files to Check

### JavaScript Core Files:
- `frontend/public/js/core/api.js` - API client
- `frontend/public/js/core/auth.js` - Authentication
- `frontend/public/js/core/config.js` - Configuration
- `frontend/public/js/core/storage.js` - Local storage

### CSS Files:
- `frontend/public/css/styles.css` - Main styles
- `frontend/public/css/admin.css` - Admin styles

### Backend Routes:
- `backend/routes/authRoutes.js`
- `backend/routes/loyaltyRoutes.js`
- `backend/src/routes/partnerRoutes.js`
- `backend/src/routes/adminRoutes.js`
- `backend/src/routes/offerRoutes.js`
- `backend/src/routes/eventRoutes.js`

---

**Last Updated**: 2025-11-24
**Status**: Pending fixes

