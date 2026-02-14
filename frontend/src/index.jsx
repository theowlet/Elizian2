import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles.css';
import App from './App';
import { initPushNotifications } from './utils/pushNotifications';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);

// Initialize service worker and push notifications after app renders
if (import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === 'true') {
  initPushNotifications().catch(() => {});
}
