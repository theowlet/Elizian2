/**
 * Push Notification utilities for Elizian
 * Handles service worker registration, push subscription, and permission management
 */

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

/**
 * Register service worker and return registration
 */
export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service workers not supported');
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('SW registered:', registration.scope);
    return registration;
  } catch (error) {
    console.error('SW registration failed:', error);
    return null;
  }
}

/**
 * Check if push notifications are supported
 */
export function isPushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Get current notification permission state
 */
export function getPermissionState() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission; // 'default' | 'granted' | 'denied'
}

/**
 * Request notification permission from user
 */
export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';

  const result = await Notification.requestPermission();
  return result; // 'granted' | 'denied' | 'default'
}

/**
 * Subscribe to push notifications
 * Returns the push subscription object to send to backend
 */
export async function subscribeToPush(registration) {
  if (!registration) return null;

  try {
    // Check for existing subscription
    let subscription = await registration.pushManager.getSubscription();
    if (subscription) return subscription;

    // Get VAPID public key from backend
    const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey) {
      console.warn('VAPID public key not configured');
      return null;
    }

    // Convert VAPID key
    const applicationServerKey = urlBase64ToUint8Array(vapidKey);

    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey,
    });

    // Send subscription to backend
    const token = localStorage.getItem('token');
    if (token) {
      await fetch(`${API_BASE}/api/v1/notifications/push-subscribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      });
    }

    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return null;
  }
}

/**
 * Show a local notification (for in-app events)
 */
export async function showLocalNotification(title, body, options = {}) {
  if (Notification.permission !== 'granted') return;

  const registration = await navigator.serviceWorker.ready;
  registration.showNotification(title, {
    body,
    icon: '/assets/z.png',
    badge: '/assets/z.png',
    vibrate: [100, 50, 100],
    tag: options.tag || 'elizian-local',
    data: { url: options.url || '/home' },
    ...options,
  });
}

/**
 * Initialize push notifications (call on app startup)
 */
export async function initPushNotifications() {
  if (!isPushSupported()) return null;

  const registration = await registerServiceWorker();
  if (!registration) return null;

  // Only auto-subscribe if permission already granted
  if (Notification.permission === 'granted') {
    await subscribeToPush(registration);
  }

  return registration;
}

/* ---- Helpers ---- */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
