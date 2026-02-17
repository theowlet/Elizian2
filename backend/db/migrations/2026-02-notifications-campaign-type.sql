-- Allow 'campaign' notification type for campaign engine push/in-app notifications
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'notifications'
  ) THEN
    ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_notification_type_check;
    ALTER TABLE notifications ADD CONSTRAINT notifications_notification_type_check
      CHECK (notification_type IN (
        'booking_confirmation',
        'booking_reminder',
        'tier_upgrade',
        'deal_alert',
        'review_request',
        'offer_expiring',
        'promotional',
        'system',
        'achievement_unlocked',
        'referral_completed',
        'voucher_received',
        'voucher_redeemed',
        'campaign'
      ));
  END IF;
END $$;
