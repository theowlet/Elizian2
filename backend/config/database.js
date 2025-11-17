const { Pool } = require('pg');
require('dotenv').config();

// Database configuration - Railway compatible with DATABASE_URL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // How long a client is allowed to remain idle
  connectionTimeoutMillis: 2000, // How long to wait when connecting a new client
});

// Handle pool errors
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT NOW()');
    client.release();
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  }
};

module.exports = { pool, testConnection };
