/**
 * Run review analytics job: compute review_analytics for all partners with reviews.
 * Usage: node scripts/run-review-analytics-job.js
 * Schedule via cron (e.g. every 15 min) or run after bulk review imports.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const reviewAnalyticsJob = require('../src/jobs/reviewAnalyticsJob');

reviewAnalyticsJob
  .runAll()
  .then((result) => {
    console.log('Done:', result);
    process.exit(0);
  })
  .catch((err) => {
    console.error('Job failed:', err);
    process.exit(1);
  });
