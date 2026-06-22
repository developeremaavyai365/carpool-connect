/**
 * Full lifecycle audit: publish → DB → search (text + geospatial).
 * Run: node scripts/audit-browse-discovery.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { getSupabaseAdmin } = require('../src/lib/supabase');
const db = require('../src/database');
const { routeMatchesFilter } = require('../src/utils/routeMatch');
const { cityMatchesFilter } = require('../src/utils/metroAreas');

async function pgQuery(sql, params = []) {
  const { Pool } = require('pg');
  const ref = (process.env.SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const password = process.env.SUPABASE_DB_PASSWORD;
  const host = process.env.SUPABASE_DB_HOST || `aws-1-ap-southeast-1.pooler.supabase.com`;
  const port = process.env.SUPABASE_DB_PORT || '5432';
  const user = process.env.SUPABASE_DB_USER || `postgres.${ref}`;
  const url = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
  const pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    const { rows } = await pool.query(sql, params);
    return rows;
  } finally {
    await pool.end();
  }
}

async function main() {
  const admin = getSupabaseAdmin();
  const nowIso = new Date().toISOString();

  console.log('\n=== PHASE 2: published_commutes records (active/upcoming, future departure) ===\n');
  const { data: commutes, error: cErr } = await admin
    .from('published_commutes')
    .select('*')
    .in('status', ['active', 'upcoming'])
    .gt('seats_available', 0)
    .gte('departure_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(10);

  if (cErr) {
    console.error('Supabase query error:', cErr);
    process.exit(1);
  }

  console.log(`Found ${commutes?.length || 0} listing(s)\n`);
  for (const row of commutes || []) {
    console.log(JSON.stringify({
      id: row.id,
      driver_id: row.driver_id,
      route_from: row.route_from,
      route_to: row.route_to,
      city: row.city,
      status: row.status,
      seats_available: row.seats_available,
      departure_at: row.departure_at,
      source_lat: row.source_lat,
      source_lng: row.source_lng,
      dest_lat: row.dest_lat,
      dest_lng: row.dest_lng,
      route_polyline: row.route_polyline ? `${row.route_polyline.slice(0, 40)}...` : null,
      route_distance_m: row.route_distance_m,
      stopovers: row.stopovers,
    }, null, 2));
    console.log('---');
  }

  console.log('\n=== PHASE 2: trips table (PostGIS sync) ===\n');
  let trips = [];
  try {
    trips = await pgQuery(`
      SELECT id, driver_id, commute_id, source_label, dest_label, status,
             seats_available, departure_at,
             route_geometry IS NOT NULL AS has_geometry,
             route_polyline IS NOT NULL AS has_polyline
      FROM trips
      WHERE status = 'active' AND departure_at >= now()
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`Found ${trips.length} active trip(s)\n`);
    trips.forEach((t) => console.log(JSON.stringify(t, null, 2)));
  } catch (err) {
    console.error('trips query failed:', err.message);
  }

  const sample = commutes?.[0];
  if (sample) {
    console.log('\n=== PHASE 4: Text search (commuteApi.search / searchCommutes) ===\n');
    const driver2Login = await fetch('http://localhost:3001/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'priya.sharma@company.com', password: 'demo123' }),
    }).then((r) => r.json()).catch(() => null);

    const passengerToken = driver2Login?.token;
    const excludeId = driver2Login?.employee?.id;

    const textResults = await db.searchCommutes({
      excludeDriverId: excludeId,
      route_from: sample.route_from.split(',')[0],
      route_to: sample.route_to.split(',')[0],
    });
    console.log(`searchCommutes("${sample.route_from.split(',')[0]}", "${sample.route_to.split(',')[0]}")`);
    console.log(`excludeDriverId=${excludeId} → ${textResults.length} result(s)`);
    textResults.forEach((c) => console.log(`  - id=${c.id} ${c.route_from} → ${c.route_to} driver=${c.driver_id}`));

    console.log('\n=== routeMatchesFilter debug for sample ===\n');
    const fromQ = sample.route_from.split(',')[0];
    const toQ = sample.route_to.split(',')[0];
    console.log(`route_from match: ${routeMatchesFilter(fromQ, sample.route_from)}`);
    console.log(`route_to match: ${routeMatchesFilter(toQ, sample.route_to)}`);

    if (sample.source_lat && sample.dest_lat) {
      console.log('\n=== PHASE 4: Geospatial search (/api/rides/search) ===\n');
      const geoUrl = new URL('http://localhost:3001/api/rides/search');
      geoUrl.searchParams.set('pickup_lat', String(sample.source_lat));
      geoUrl.searchParams.set('pickup_lng', String(sample.source_lng));
      geoUrl.searchParams.set('drop_lat', String(sample.dest_lat));
      geoUrl.searchParams.set('drop_lng', String(sample.dest_lng));
      const geoRes = await fetch(geoUrl, {
        headers: passengerToken ? { Authorization: `Bearer ${passengerToken}` } : {},
      }).then((r) => r.json()).catch((e) => ({ error: e.message }));
      console.log('GET', geoUrl.pathname + geoUrl.search);
      console.log(`→ ${geoRes.rides?.length ?? 0} ride(s)`);
      (geoRes.rides || []).forEach((r) => console.log(`  - trip id=${r.id} commute_id=${r.commute_id} ${r.source_label} → ${r.dest_label}`));
      if (geoRes.error) console.log('error:', geoRes.error);

      const tripForCommute = trips.find((t) => t.commute_id === sample.id);
      console.log(`\nTrip row for commute_id=${sample.id}: ${tripForCommute ? 'EXISTS' : 'MISSING'}`);
    }
  }

  console.log('\n=== Commute IDs in published_commutes vs trips.commute_id ===\n');
  const commuteIds = new Set((commutes || []).map((c) => c.id));
  const tripCommuteIds = new Set(trips.filter((t) => t.commute_id).map((t) => t.commute_id));
  for (const id of commuteIds) {
    console.log(`commute ${id}: trip sync ${tripCommuteIds.has(id) ? 'YES' : 'NO'}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
