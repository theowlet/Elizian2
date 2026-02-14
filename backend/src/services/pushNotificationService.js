/**
 * Push Notification Sender Service
 * Uses web-push library to send real push notifications to subscribed users.
 * Falls back gracefully if web-push is not installed or VAPID keys are not configured.
 */

const { getPool } = require('../config/db');
const { logError } = require('../../utils/logger');

let webpush = null;
let pushConfigured = false;

// Lazy-load web-push — graceful fallback if not installed
try {
  webpush = require('web-push');

  const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
  const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
  const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hello@elizian.app';

  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
    pushConfigured = true;
    console.log('[Push] Web push configured successfully');
  } else {
    console.warn('[Push] VAPID keys not set — push notifications disabled');
  }
} catch (_) {
  console.warn('[Push] web-push package not installed — push notifications disabled. Run: npm install web-push');
}

/**
 * Send push notification to a specific user
 * @param {string} userId - UUID of the user
 * @param {object} payload - { title, body, url, tag, icon, actions }
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendToUser(userId, payload) {
  if (!pushConfigured || !webpush) {
    return { sent: 0, failed: 0, reason: 'push_not_configured' };
  }

  const pool = getPool();
  let sent = 0;
  let failed = 0;

  try {
    const result = await pool.query(
      'SELECT id, endpoint, keys FROM push_subscriptions WHERE user_id = $1',
      [userId]
    );

    for (const sub of result.rows) {
      try {
        const subscription = {
          endpoint: sub.endpoint,
          keys: typeof sub.keys === 'string' ? JSON.parse(sub.keys) : sub.keys,
        };

        await webpush.sendNotification(subscription, JSON.stringify(payload));
        sent++;
      } catch (err) {
        failed++;
        // Remove invalid subscriptions (410 Gone or 404)
        if (err.statusCode === 410 || err.statusCode === 404) {
          await pool.query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    }
  } catch (error) {
    logError('Push sendToUser error:', error);
  }

  return { sent, failed };
}

/**
 * Send push notification to multiple users
 * @param {string[]} userIds - Array of user UUIDs
 * @param {object} payload - Push notification payload
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function sendToUsers(userIds, payload) {
  let totalSent = 0;
  let totalFailed = 0;

  for (const userId of userIds) {
    const { sent, failed } = await sendToUser(userId, payload);
    totalSent += sent;
    totalFailed += failed;
  }

  return { sent: totalSent, failed: totalFailed };
}

/**
 * Send push notification to all users (broadcast)
 * Used for system-wide announcements
 * @param {object} payload - Push notification payload
 * @returns {Promise<{ sent: number, failed: number }>}
 */
async function broadcast(payload) {
  if (!pushConfigured || !webpush) {
    return { sent: 0, failed: 0, reason: 'push_not_configured' };
  }

  const pool = getPool();
  let sent = 0;
  let failed = 0;

  try {
    const result = await pool.query('SELECT DISTINCT user_id FROM push_subscriptions');
    const userIds = result.rows.map(r => r.user_id);
    return sendToUsers(userIds, payload);
  } catch (error) {
    logError('Push broadcast error:', error);
    return { sent, failed };
  }
}

/**
 * Send notification for common app events
 */
const notifications = {
  bookingConfirmed: (userId, bookingRef) => sendToUser(userId, {
    title: 'Booking Confirmed!',
    body: `Your booking ${bookingRef} has been confirmed.`,
    url: '/bookings',
    tag: 'booking-confirmed',
  }),

  redemptionPending: (userId, venueName) => sendToUser(userId, {
    title: 'Redemption Pending',
    body: `${venueName} started your redemption. Please confirm.`,
    url: '/bookings',
    tag: 'redemption-pending',
  }),

  tierUpgrade: (userId, newTier) => sendToUser(userId, {
    title: 'Tier Upgrade!',
    body: `Congratulations! You've reached ${newTier} tier.`,
    url: '/wallet',
    tag: 'tier-upgrade',
  }),

  achievementUnlocked: (userId, achievementName) => sendToUser(userId, {
    title: 'Achievement Unlocked!',
    body: `You've earned: ${achievementName}`,
    url: '/profile',
    tag: 'achievement',
  }),

  newMessage: (userId, partnerName) => sendToUser(userId, {
    title: `Message from ${partnerName}`,
    body: 'You have a new message. Tap to read.',
    url: '/messages',
    tag: 'message',
  }),

  campaignNotification: (userId, title, body) => sendToUser(userId, {
    title,
    body,
    url: '/home',
    tag: 'campaign',
  }),

  voucherExpiringSoon: (userId, venueName, expiryDate) => sendToUser(userId, {
    title: 'Voucher Expiring Soon',
    body: `Your voucher for ${venueName} expires on ${expiryDate}. Don't miss out!`,
    url: '/bookings',
    tag: 'voucher-expiring',
  }),
};

module.exports = {
  sendToUser,
  sendToUsers,
  broadcast,
  notifications,
  isPushConfigured: () => pushConfigured,
};
