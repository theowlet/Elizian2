# ElizianAppExpo - Professional Project Structure

## 🏗️ Project Architecture

This project follows a professional, modular architecture with clear separation of concerns:

```
ElizianAppExpo/
├── backend/                ← Shared Node.js + Express + PostgreSQL API
│   ├── server.js          ← Original monolithic server
│   ├── server-modular.js  ← NEW: Modular server with route separation
│   ├── routes/            ← Modular API routes
│   │   ├── auth.js        ← Authentication & user management
│   │   ├── partners.js    ← Partner/restaurant management
│   │   ├── categories.js  ← Category management
│   │   └── eznet/         ← EZNet module (Events + Dining + Tickets)
│   │       ├── events.js  ← Event management
│   │       ├── bookings.js← Booking system
│   │       ├── venues.js  ← Venue management
│   │       └── reviews.js ← Review & rating system
│   ├── models/            ← Database schemas
│   │   └── eznet.sql      ← EZNet database schema
│   ├── config/            ← Configuration files
│   │   └── database.js    ← Database configuration
│   ├── middleware/        ← Custom middleware
│   │   └── validation.js  ← Input validation
│   └── ...
│
├── frontend/
│   ├── elizian/           ← Existing loyalty app (blockchain, rewards)
│   ├── eznet/             ← NEW: Expo app (Events + Dining + Tickets)
│   └── public/            ← Web interfaces
│       ├── admin.html     ← EZNet Admin Console
│       └── mockups/       ← HTML mockups
│
├── EZNet_Reverse/         ← Reference-only folder (decompiled old app)
│   ├── assets/            ← Original app assets
│   ├── layouts/           ← UI layout files
│   ├── strings/           ← Text strings and localization
│   └── notes.md           ← Reverse engineering documentation
│
└── README.md              ← This file
```

## 🚀 Quick Start

### Backend Setup

1. **Install dependencies:**
   ```bash
   cd backend
   npm install
   ```

2. **Environment setup:**
   ```bash
   cp .env.example .env
   # Edit .env with your database credentials
   ```

3. **Database setup:**
   ```bash
   # Create database and run schema
   psql -U postgres -c "CREATE DATABASE elizian;"
   psql -U postgres -d elizian -f db/elizian_schema.sql
   psql -U postgres -d elizian -f models/eznet.sql
   ```

4. **Start server:**
   ```bash
   # Original monolithic server
   npm start
   
   # OR new modular server
   node server-modular.js
   ```

### Frontend Setup

1. **Serve web interfaces:**
   ```bash
   cd frontend/public
   python3 -m http.server 8080
   ```

2. **Access interfaces:**
   - Admin Console: `http://localhost:8080/admin.html`
   - App Mockup: `http://localhost:8080/mockups/elzmockup5.html`

## 📱 App Ecosystem

### EZNet (Main App)
- **Purpose**: User management, authentication, partner discovery
- **Features**: 
  - Phone-based OTP authentication
  - JWT token management
  - Partner discovery and filtering
  - User profile management

### Resy-like App (Booking System)
- **Purpose**: Restaurant/partner booking and management
- **Features**:
  - Event creation and management
  - Booking system with QR codes
  - Venue management
  - Review and rating system
  - Real-time notifications

## 🔧 API Endpoints

### Authentication
- `POST /api/v1/auth/register` - User registration with OTP
- `POST /api/v1/auth/login` - User login
- `POST /api/v1/auth/send-otp` - Send OTP
- `POST /api/v1/auth/verify-otp` - Verify OTP
- `GET /api/v1/auth/profile` - Get user profile

### Partners & Categories
- `GET /api/v1/partners` - Get all partners
- `GET /api/v1/categories` - Get all categories
- `POST /api/v1/partners` - Create partner
- `POST /api/v1/categories` - Create category

### EZNet Events
- `GET /api/v1/eznet/events` - Get all events
- `POST /api/v1/eznet/events` - Create event
- `GET /api/v1/eznet/events/:id/bookings` - Get event bookings

### EZNet Bookings
- `GET /api/v1/eznet/bookings` - Get user bookings
- `POST /api/v1/eznet/bookings` - Create booking
- `PUT /api/v1/eznet/bookings/:id/confirm` - Confirm booking
- `PUT /api/v1/eznet/bookings/:id/cancel` - Cancel booking

### EZNet Venues
- `GET /api/v1/eznet/venues` - Get all venues
- `GET /api/v1/eznet/venues/search` - Search venues
- `POST /api/v1/eznet/venues` - Create venue

### EZNet Reviews
- `GET /api/v1/eznet/reviews` - Get reviews
- `POST /api/v1/eznet/reviews` - Create review
- `GET /api/v1/eznet/reviews/stats/:venue_id` - Get venue stats

## 🛡️ Security Features

- **Rate limiting** on all endpoints
- **CORS protection** with whitelisted origins
- **Input validation** and sanitization
- **JWT authentication** with secure secrets
- **Password hashing** with bcrypt
- **Environment validation** on startup

## 📊 Database Schema

### Core Tables
- `users` - User accounts and profiles
- `otp_sessions` - OTP verification sessions
- `categories` - Partner categories
- `partners` - Restaurant/partner information

### EZNet Tables
- `venues` - Event venues and locations
- `events` - Events and performances
- `bookings` - User bookings and reservations
- `reviews` - User reviews and ratings
- `review_likes` - Review likes system

## 🔄 Development Workflow

1. **Backend Development**: Use `server-modular.js` for new features
2. **Frontend Development**: Develop in `frontend/eznet/` for Expo app
3. **Testing**: Use admin console at `http://localhost:8080/admin.html`
4. **Reference**: Check `EZNet_Reverse/` for original app insights

## 📝 Environment Variables

```env
# Database
DB_HOST=localhost
DB_NAME=elizian
DB_USER=postgres
DB_PASSWORD=your_password
DB_PORT=5432

# Security
JWT_SECRET=your-super-secure-jwt-secret-key-here

# URLs
FRONTEND_URL=http://localhost:3000
ADMIN_URL=http://localhost:8080

# Environment
NODE_ENV=development
LOG_OTP=true
```

## 🚀 Deployment

### Production Setup
1. Set `NODE_ENV=production`
2. Configure production database
3. Set secure `JWT_SECRET`
4. Configure CORS origins
5. Use `server-modular.js` for better performance

### Docker Support
```bash
# Build and run with Docker
docker build -t elizian-backend .
docker run -p 5001:5001 elizian-backend
```

## 🎨 Frontend UI Upgrade (Nov 2025)

- **Category/filter fidelity:** Category slugs and filter keys are read directly from `frontend/public/index.html` (`.category-tabs .tab[data-category]`) by `frontend/public/ui-components.js`, ensuring all seven categories (and their query params) remain untouched.
- **Compatibility wrappers:** `ui-components.js` wraps the existing global functions `toggleFilter`, `clearFilters`, and `loadHomeScreenData` so new filter chips stay in sync without changing API payloads.
- **Modular components & theme:** New UI pieces live in:
  - `frontend/public/styles/styles.css`
  - `frontend/public/components/ui/cards.js`
  - `frontend/public/components/ui/nav.js`
  - `frontend/public/ui-components.js`
- **Testing the refreshed UI:**
  1. `cd frontend && npm install` (once)
  2. `npm run dev` (or serve `frontend/public/index.html` via any static server)
3. Verify category quick strip, filter chips, voucher wallet, EZT dashboard, QR scanner, and bottom navigation—all reuse the existing endpoints and query parameters.

## 📞 Support

For questions or issues:
1. Check the API documentation at `/api/v1`
2. Review the admin console for system health
3. Check server logs for detailed error information

---

**Powered by Hungry Diner** 🍽️