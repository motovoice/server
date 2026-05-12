import { Pool } from 'pg';

if (!process.env.POSTGRES_URL) {
  throw new Error('POSTGRES_URL not set');
}

export const db = new Pool({
  connectionString: process.env.POSTGRES_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Test connection at startup
db.query('SELECT 1').catch(err => {
  console.error('PostgreSQL connection failed:', err);
  process.exit(1);
});
