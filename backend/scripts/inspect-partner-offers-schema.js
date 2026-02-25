#!/usr/bin/env node
/**
 * Run: node backend/scripts/inspect-partner-offers-schema.js
 * Prints partner_offers columns (same as information_schema query).
 */
const { getPool } = require('../src/config/db');

const SQL = `
  SELECT column_name, data_type, numeric_precision, numeric_scale
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'partner_offers'
  ORDER BY ordinal_position;
`;

async function main() {
  const pool = getPool();
  try {
    const result = await pool.query(SQL);
    console.log('partner_offers columns:\n');
    console.table(result.rows);
    process.exit(0);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
