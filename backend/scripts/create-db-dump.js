#!/usr/bin/env node
/**
 * Create a PostgreSQL database dump.
 * Uses DATABASE_URL from .env. Output: backend/elizian_dump_YYYYMMDD_HHMMSS.dump
 *
 * Run: node scripts/create-db-dump.js
 * Or:  npm run db:dump  (if added to package.json)
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set in .env');
  process.exit(1);
}

const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const outDir = path.join(__dirname, '..');
const outFile = path.join(outDir, `elizian_dump_${timestamp}.dump`);

console.log('📦 Creating database dump...');
console.log(`   Output: ${outFile}`);

try {
  execSync(
    `pg_dump "${DATABASE_URL}" -Fc -f "${outFile}"`,
    { stdio: 'inherit', maxBuffer: 50 * 1024 * 1024 }
  );
  const stats = fs.statSync(outFile);
  console.log(`\n✅ Dump created: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
} catch (err) {
  console.error('\n❌ pg_dump failed:', err.message);
  process.exit(1);
}
