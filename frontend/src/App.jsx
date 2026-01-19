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
import HomePage from "./pages/HomePage";
import EventBooking from "./pages/EventBooking";
import WellnessPage from "./pages/WellnessPage";
import HealthWellnessPage from "./pages/HealthWellnessPage";
import DataEntry from "./pages/DataEntry";
import MultiTierAdmin from "./pages/MultiTierAdmin";
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
    // Listen for storage changes to update auth state reactively
    const handleStorageChange = () => {
      const token = localStorage.getItem("token");
      setIsAuthenticated(!!token && !isTokenExpired(token));
    };

    // Check auth state periodically (every 5 seconds)
    const interval = setInterval(() => {
      const token = localStorage.getItem("token");
      const isValid = !!token && !isTokenExpired(token);
      if (isValid !== isAuthenticated) {
        setIsAuthenticated(isValid);
      }
    }, 5000);

    window.addEventListener("storage", handleStorageChange);
    window.MY_GLOBAL_CONFIG = {
      apiUrl: import.meta.env.VITE_API_URL,
    };

    return () => {
      clearInterval(interval);
      window.removeEventListener("storage", handleStorageChange);
    };
  }, [isAuthenticated]);

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
    apiUrl: import.meta.env.VITE_API_BASE_URL 
  };
  return (
    <Routes>
      {/* Public Routes */}
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/otp" element={<OTPScreen />} />
      <Route path="/signup" element={<SignupPage />} />

      {/* Protected User Routes */}
      <Route
        path="/home"
        element={
          <ProtectedRoute requireAuth={true}>
            <HomePage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/events/booking"
        element={
          <ProtectedRoute requireAuth={true}>
            <EventBooking />
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
      {/* <Route path="/partner/console" element={<PartnerDashboardPage />} /> */}
      <Route
        path="/partner/console"
        element={
          <ProtectedRoute requireAuth={true} requirePartner = {true}>
            <PartnerDashboardPage />
          </ProtectedRoute>
        }
      />
      {/* old partner console code  */}
      {/* <Route
        path="/partner/console"
        element={
          <ProtectedRoute requirePartner={true}>
            <PartnerConsole />
          </ProtectedRoute>
        }
      /> */}

      {/* Admin Routes */}
      <Route path="/admin/login" element={<AdminPage />} />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAuth={false}>
            <AdminDashboardPage />
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

function App() {
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
    <Router>
      <AppRoutes />
    </Router>
  );
}

export default App;
