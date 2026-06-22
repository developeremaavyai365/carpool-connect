/**
 * Apply migration 009 — trip coverage columns for 50 km radius matching.
 * Usage: node scripts/apply-migration-009.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

function getProjectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || '';
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = getProjectRef();
  if (!password || !ref) return null;

  if (process.env.SUPABASE_DB_HOST) {
    const host = process.env.SUPABASE_DB_HOST;
    const port = process.env.SUPABASE_DB_PORT || '6543';
    const user = process.env.SUPABASE_DB_USER || `postgres.${ref}`;
    const db = process.env.SUPABASE_DB_NAME || 'postgres';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }

  const host = `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT || '5432';
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const db = process.env.SUPABASE_DB_NAME || 'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

async function main() {
  const url = buildDatabaseUrl();
  if (!url) {
    console.error('SUPABASE_DB_PASSWORD and SUPABASE_URL required');
    process.exit(1);
  }

  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/009_matching_radius_coverage.sql'),
    'utf8',
  );

  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration 009 applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
