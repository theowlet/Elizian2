import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

const AuthContext = createContext(null);

function getStoredUser() {
  try {
    const raw = localStorage.getItem("user");
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getStoredToken() {
  return localStorage.getItem("token") || null;
}

function isTokenExpired(token) {
  if (!token) return true;
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getStoredUser);
  const [token, setToken] = useState(getStoredToken);

  const isAuthenticated = !!token && !isTokenExpired(token);

  const login = useCallback((newToken, newUser) => {
    if (newToken) localStorage.setItem("token", newToken);
    if (newUser != null) {
      localStorage.setItem("user", JSON.stringify(newUser));
      setUser(newUser);
    }
    if (newToken) setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    setToken(null);
    setUser(null);
  }, []);

  useEffect(() => {
    const stored = getStoredToken();
    if (stored !== token) setToken(stored);
    setUser(getStoredUser());
  }, []);

  useEffect(() => {
    const onLogout = () => logout();
    window.addEventListener("elizian-logout", onLogout);
    return () => window.removeEventListener("elizian-logout", onLogout);
  }, [logout]);

  const value = {
    user,
    token,
    isAuthenticated,
    login,
    logout,
    setUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

export default AuthContext;
