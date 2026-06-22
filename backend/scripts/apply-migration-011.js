/**
 * Apply migration 011 — Google Maps normalized address + distance fields.
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
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`;
}

async function main() {
  const url = buildDatabaseUrl();
  if (!url) throw new Error('Database URL not configured');
  const sql = fs.readFileSync(
    path.join(__dirname, '../../supabase/migrations/011_google_maps_fields.sql'),
    'utf8',
  );
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(sql);
    console.log('Migration 011 applied successfully.');
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
