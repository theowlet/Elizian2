# React Migration Plan

## 🎯 Goal
Migrate all HTML/vanilla JavaScript files to React components with proper routing and state management.

## 📋 Migration Status

### ✅ Completed
- [x] React Router setup
- [x] Basic App.js with routing structure
- [x] LandingPage component (from index.html)
- [x] LoginPage component (from index.html login screen)

### 🔄 In Progress
- [ ] OTPScreen component
- [ ] SignupPage component
- [ ] HomePage component

### ⏳ Pending
- [ ] PartnerConsole component (from partner-console.html)
- [ ] PartnerLogin component (from partner-login.html)
- [ ] AdminLogin component (from admin-login.html)
- [ ] AdminDashboard component (from admin.html)
- [ ] EventBooking component
- [ ] WellnessPage component
- [ ] HealthWellnessPage component
- [ ] DataEntry component
- [ ] MultiTierAdmin component

## 📁 New React Structure

```
frontend/src/
├── App.js                    → Main router
├── pages/                    → Page components
│   ├── LandingPage.js       ✅
│   ├── LoginPage.js         ✅
│   ├── OTPScreen.js         🔄
│   ├── SignupPage.js        ⏳
│   ├── HomePage.js          ⏳
│   ├── PartnerConsole.js    ⏳
│   ├── PartnerLogin.js      ⏳
│   ├── AdminLogin.js         ⏳
│   └── AdminDashboard.js    ⏳
├── components/              → Reusable components
│   ├── Header.js
│   ├── Footer.js
│   ├── SearchBar.js
│   ├── CategoryFilter.js
│   └── ExperienceCard.js
├── context/                → React Context for state
│   ├── AuthContext.js
│   └── AppContext.js
├── hooks/                  → Custom hooks
│   ├── useAuth.js
│   └── useApi.js
├── styles/                 → CSS files
│   ├── landing.css        ✅
│   ├── auth.css           ✅
│   └── global.css
└── api/                    → API utilities
    └── axios.js            ✅
```

## 🚀 Next Steps

1. **Complete Authentication Flow**
   - OTPScreen component
   - SignupPage component
   - AuthContext for global auth state

2. **Migrate Main App Pages**
   - HomePage (from index.html home screen)
   - Partner Console
   - Admin Dashboard

3. **Create Reusable Components**
   - Extract common UI elements
   - Create shared components

4. **State Management**
   - Set up React Context
   - Migrate JavaScript functions to React hooks

5. **Remove Old HTML Files**
   - After migration is complete and tested
   - Keep as backup initially

## 📝 Notes

- All API calls should use the axios instance from `src/api/axios.js`
- Use React Router for navigation instead of `showScreen()` functions
- Convert inline styles to CSS modules or styled-components
- Use React hooks (useState, useEffect) for state management
- Extract JavaScript functions to custom hooks

