import axios from 'axios';

// Base URL for your backend
const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api/v1';

console.log('API Base URL:', BASE_URL);

// Create a reusable Axios instance
const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Optional: attach token automatically if present in localStorage
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle expired tokens — only on 401 (truly expired/invalid), not 403 (forbidden)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      const token = localStorage.getItem('token');
      if (token) {
        // Token is expired or invalid — clear session
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        localStorage.removeItem('userInfo');
        localStorage.removeItem('userToken');
        window.dispatchEvent(new Event('elizian-logout'));
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;