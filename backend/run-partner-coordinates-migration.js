#!/usr/bin/env node
/**
 * Set latitude/longitude for existing partners that have none (so they show on the venue map).
 * Run from backend: node run-partner-coordinates-migration.js
 */
const path = require('path');
const fs = require('fs');
const { getPool } = require('./src/config/db');

async function run() {
  const migrationPath = path.join(__dirname, 'db', 'migrations', '2026-02-partners-set-default-coordinates.sql');
  if (!fs.existsSync(migrationPath)) {
    throw new Error('Migration file not found: ' + migrationPath);
  }
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const pool = getPool();
  const result = await pool.query(sql);
  console.log('Partner coordinates migration completed. Rows updated:', result.rowCount ?? 'see above');
  process.exit(0);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
