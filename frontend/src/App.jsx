import React, { useState, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import LandingPage from "./pages/LandingPage";
import LoginPage from "./pages/LoginPage";
import OTPScreen from "./pages/OTPScreen";
import SignupPage from "./pages/SignupPage";
import MPinSetupScreen from "./pages/MPinSetupScreen";
import MPinLoginScreen from "./pages/MPinLoginScreen";
import HomePage from "./pages/HomePage";
import Profile from './pages/Profile';
import EventBooking from "./pages/EventBooking";
import BookingHistory from "./pages/BookingHistory";
import BookingDetails from "./pages/BookingDetails";
import RescheduleBooking from "./pages/RescheduleBooking";
import WellnessPage from "./pages/WellnessPage";
import HealthWellnessPage from "./pages/HealthWellnessPage";
import DataEntry from "./pages/DataEntry";
import VenueDetailPage from "./pages/VenueDetailPage";
import VenueMapPage from "./pages/VenueMapPage";
import EventsPage from "./pages/EventsPage";
import EventDetailPage from "./pages/EventDetailPage";
import MyPassesPage from "./pages/MyPassesPage";
import MultiTierAdmin from "./pages/MultiTierAdmin";
import PartnerConsole from "./pages/PartnerConsole";
import AdminDashboard from "./pages/AdminDashboard";
import GovernancePage from "./pages/GovernancePage";
import DeveloperPage from "./pages/DeveloperPage";
import PrivacyPolicyContent from "./pages/PrivacyPolicyContent";
import NfcTapPage from "./pages/NfcTapPage";
import OnboardingPage from "./pages/OnboardingPage";
import WalletPage from "./pages/WalletPage";
import MessagingPage from "./pages/MessagingPage";
import ReservationPage from "./pages/ReservationPage";
import ExclusivesPage from "./pages/ExclusivesPage";
import TrendingExperiencesPage from "./pages/TrendingExperiencesPage";
import NotificationsPage from "./pages/NotificationsPage";
import PWAInstallPrompt from "./components/PWAInstallPrompt";
import ErrorBoundary from "./components/ErrorBoundary";
import { AuthProvider } from "./context/AuthContext";
import { NotificationProvider } from "./context/NotificationContext";
import BottomNav from "./components/BottomNav";
import DesktopTopNav from "./components/DesktopTopNav";
import "./styles/skeleton.css";
import {
  AdminPage,
  PartnerPage,
  PartnerDashboardPage,
  AdminDashboardPage,
} from "./OtherRoute";

// Helper function to check if token is expired
function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch (error) {
    return true;
  }
}

// Protected Route Component
function ProtectedRoute({
  children,
  requireAuth = true,
  requirePartner = false,
  requireAdmin = false,
}) {
  const location = useLocation();
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    const token = localStorage.getItem("token");
    return !!token && !isTokenExpired(token);
  });

  useEffect(() => {
    // Listen for storage changes (e.g. logout in another tab)
    const handleStorageChange = (e) => {
      if (e.key === 'token') {
        const token = e.newValue;
        setIsAuthenticated(!!token && !isTokenExpired(token));
      }
    };

    // Listen for custom logout events (dispatched by handleLogout)
    const handleLogout = () => {
      setIsAuthenticated(false);
    };

    window.addEventListener("storage", handleStorageChange);
    window.addEventListener("elizian-logout", handleLogout);
    window.MY_GLOBAL_CONFIG = {
      apiUrl: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL,
    };

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      window.removeEventListener("elizian-logout", handleLogout);
    };
  }, []);

  if (requireAuth && !isAuthenticated) {
    // Redirect to login, preserving the intended destination
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requirePartner) {
    const partnerToken = localStorage.getItem("partnerToken");
    if (!partnerToken) {
      return <Navigate to="/partner/login" replace />;
    }
  }

  if (requireAdmin) {
    const adminToken =
      localStorage.getItem("adminToken") || localStorage.getItem("token");
    if (!adminToken) {
      return <Navigate to="/admin/login" replace />;
    }
  }

  return children;
}

function AppRoutes() {
  window.MY_GLOBAL_CONFIG = {
    apiUrl: import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_API_URL,
  };
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/otp" element={<OTPScreen />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/mpin-setup" element={<MPinSetupScreen />} />
      <Route path="/mpin-login" element={<MPinLoginScreen />} />
      <Route path="/tap/:puckCode" element={<NfcTapPage />} />
      <Route path="/onboarding" element={<OnboardingPage />} />

      {/* Protected User Routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute requireAuth={true}>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route path="/venue/:id" element={<VenueDetailPage />} />
      <Route path="/venues/map" element={<VenueMapPage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route
        path="/events/booking"
        element={
          <ProtectedRoute requireAuth={true}>
            <EventBooking />
          </ProtectedRoute>
        }
      />
      <Route path="/events/:id" element={<EventDetailPage />} />
      <Route path="/passes" element={<ProtectedRoute requireAuth={true}><MyPassesPage /></ProtectedRoute>} />
       <Route
        path="/profile"
        element={
          <ProtectedRoute requireAuth={true}>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/governance" element={<ProtectedRoute requireAuth={true}><GovernancePage /></ProtectedRoute>} />
      <Route path="/developer" element={<ProtectedRoute requireAuth={true}><DeveloperPage /></ProtectedRoute>} />
      <Route path="/wallet" element={<ProtectedRoute requireAuth={true}><WalletPage /></ProtectedRoute>} />
      <Route path="/messages" element={<ProtectedRoute requireAuth={true}><MessagingPage /></ProtectedRoute>} />
      <Route path="/messages/conversation/:conversationId" element={<ProtectedRoute requireAuth={true}><MessagingPage /></ProtectedRoute>} />
      <Route path="/messages/:partnerId" element={<ProtectedRoute requireAuth={true}><MessagingPage /></ProtectedRoute>} />
      <Route path="/reserve" element={<ProtectedRoute requireAuth={true}><ReservationPage /></ProtectedRoute>} />
      <Route path="/exclusives" element={<ProtectedRoute requireAuth={true}><ExclusivesPage /></ProtectedRoute>} />
      <Route path="/trending" element={<ProtectedRoute requireAuth={true}><TrendingExperiencesPage /></ProtectedRoute>} />
      <Route path="/notifications" element={<ProtectedRoute requireAuth={true}><NotificationsPage /></ProtectedRoute>} />
      <Route
        path="/privacy_policy"
        element={
          <ProtectedRoute requireAuth={true}>
            <PrivacyPolicyContent />
          </ProtectedRoute>
        }
      />
      <Route
        path="/bookings"
        element={
          <ProtectedRoute requireAuth={true}>
            <BookingHistory />
          </ProtectedRoute>
        }
      />
      <Route
        path="/booking/:id"
        element={
          <ProtectedRoute requireAuth={true}>
            <BookingDetails />
          </ProtectedRoute>
        }
      />
      <Route
        path="/booking/:id/reschedule"
        element={
          <ProtectedRoute requireAuth={true}>
            <RescheduleBooking />
          </ProtectedRoute>
        }
      />
      <Route
        path="/wellness"
        element={
          <ProtectedRoute requireAuth={true}>
            <WellnessPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/health-wellness"
        element={
          <ProtectedRoute requireAuth={true}>
            <HealthWellnessPage />
          </ProtectedRoute>
        }
      />

      {/* Partner Routes */}
      <Route path="/partner/login" element={<PartnerPage />} />
      <Route
        path="/partner/console"
        element={
          <ProtectedRoute requireAuth={false} requirePartner={true}>
            <PartnerConsole />
          </ProtectedRoute>
        }
      />

      {/* Admin Routes */}
      <Route path="/admin/login" element={<AdminPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAuth={true} requireAdmin={true}>
            <AdminDashboard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin/multi-tier"
        element={
          <ProtectedRoute requireAdmin={true}>
            <MultiTierAdmin />
          </ProtectedRoute>
        }
      />

      {/* Data Entry - Protected */}
      <Route
        path="/data-entry"
        element={
          <ProtectedRoute requireAuth={true}>
            <DataEntry />
          </ProtectedRoute>
        }
      />

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function AppShell() {
  // Disable legacy global functions that may be injected by static HTML
  useEffect(() => {
    [
      "navigateTo",
      "handleLogin",
      "initMap",
      "loadBottomNavigation",
      "loadBottomNav",
    ].forEach((fn) => {
      if (typeof window !== "undefined" && window[fn]) {
        window[fn] = () => console.warn(`Legacy ${fn} disabled`);
      }
    });
  }, []);

  return (
    <div className="app-shell">
      <DesktopTopNav />
      <main className="app-content">
        <AppRoutes />
      </main>
      <BottomNav />
      <PWAInstallPrompt />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <Router>
        <AuthProvider>
          <NotificationProvider>
            <AppShell />
          </NotificationProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  );
}

export default App;
