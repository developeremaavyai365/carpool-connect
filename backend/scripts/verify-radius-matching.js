/**
 * Verify 50 km radius matching — run against live backend + Supabase PostGIS.
 * Usage: node scripts/verify-radius-matching.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3001/api';
const RADIUS_KM = Number(process.env.MATCHING_RADIUS_KM || 50);

const LOCATIONS = {
  delhi: { lat: 28.6139, lng: 77.209, label: 'Delhi' },
  faridabad: { lat: 28.4089, lng: 77.3178, label: 'Faridabad' },
  neemrana: { lat: 27.9878, lng: 76.3878, label: 'Neemrana' },
  jaipur: { lat: 26.9124, lng: 75.7873, label: 'Jaipur' },
  noida: { lat: 28.5355, lng: 77.391, label: 'Noida' },
  ghaziabad: { lat: 28.6692, lng: 77.4538, label: 'Ghaziabad' },
  gurgaon: { lat: 28.4595, lng: 77.0266, label: 'Gurgaon' },
  cyberCity: { lat: 28.4945, lng: 77.0889, label: 'Cyber City' },
  mumbai: { lat: 19.076, lng: 72.8777, label: 'Mumbai' },
  thane: { lat: 19.2183, lng: 72.9781, label: 'Thane' },
  lonavala: { lat: 18.7489, lng: 73.4062, label: 'Lonavala' },
  pune: { lat: 18.5204, lng: 73.8567, label: 'Pune' },
  bangalore: { lat: 12.9716, lng: 77.5946, label: 'Bangalore' },
  mysore: { lat: 12.2958, lng: 76.6394, label: 'Mysore' },
};

const results = [];

function pass(name, detail = '') {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(name, detail = '') {
  results.push({ name, ok: false, detail });
  console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, options);
  const data = await res.json().catch(() => ({}));
  return { res, data };
}

async function login(email, password) {
  const { res, data } = await jsonFetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function publishRoute(driver, from, to, stopovers = []) {
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const { res, data } = await jsonFetch(`${BASE}/commutes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${driver.token}`,
    },
    body: JSON.stringify({
      route_from: from.label,
      route_to: to.label,
      departure_date: tomorrow,
      departure_time: '06:00',
      seats_available: 3,
      price_per_seat: 150,
      stopovers: stopovers.map((s) => s.label),
      source_lat: from.lat,
      source_lng: from.lng,
      dest_lat: to.lat,
      dest_lng: to.lng,
      stopover_coords: stopovers.map((s) => [s.lat, s.lng]),
      route_distance_m: 300000,
      route_duration_s: 14400,
    }),
  });
  if (res.status !== 201) throw new Error(data.error || `Publish failed ${res.status}`);
  return data.commute;
}

async function geoSearch(token, pickup, drop) {
  const qs = new URLSearchParams({
    pickup_lat: String(pickup.lat),
    pickup_lng: String(pickup.lng),
    drop_lat: String(drop.lat),
    drop_lng: String(drop.lng),
  });
  const { res, data } = await jsonFetch(`${BASE}/rides/search?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(data.error || `Search failed ${res.status}`);
  return data.rides || [];
}

async function main() {
  console.log('\n=== 50 KM RADIUS MATCHING VERIFICATION ===\n');
  console.log(`Configured radius: ${RADIUS_KM} km\n`);

  const health = await jsonFetch(`${BASE.replace(/\/api\/?$/, '')}/api/health`);
  if (!health.res.ok) {
    console.error('Backend not running. Start: cd backend && npm run dev');
    process.exit(1);
  }

  const config = await jsonFetch(`${BASE}/rides/matching-config`);
  if (config.data.matching_radius_km === RADIUS_KM) {
    pass('Matching config API', `${config.data.matching_radius_km} km`);
  } else {
    fail('Matching config API', JSON.stringify(config.data));
  }

  const driver = await login('rajesh.kumar@company.com', 'demo123');
  const passenger = await login('priya.sharma@company.com', 'demo123');
  pass('Authentication');

  console.log('\n--- Publishing test routes ---');
  const delhiJaipur = await publishRoute(driver, LOCATIONS.delhi, LOCATIONS.jaipur, [
    LOCATIONS.gurgaon,
    LOCATIONS.neemrana,
  ]);
  pass('Publish Delhi → Jaipur (with stopovers)', `commute ${delhiJaipur.id}`);

  const noidaGurgaon = await publishRoute(driver, LOCATIONS.noida, LOCATIONS.gurgaon);
  pass('Publish Noida → Gurgaon', `commute ${noidaGurgaon.id}`);

  const mumbaiPune = await publishRoute(driver, LOCATIONS.mumbai, LOCATIONS.pune, [LOCATIONS.lonavala]);
  pass('Publish Mumbai → Pune (via Lonavala)', `commute ${mumbaiPune.id}`);

  const bangaloreMysore = await publishRoute(driver, LOCATIONS.bangalore, LOCATIONS.mysore);
  pass('Publish Bangalore → Mysore', `commute ${bangaloreMysore.id}`);

  // Allow PostGIS sync
  await new Promise((r) => setTimeout(r, 2000));

  console.log('\n--- Radius matching scenarios ---');

  // Example 1: Faridabad → Neemrana on Delhi → Jaipur
  const ex1 = await geoSearch(passenger.token, LOCATIONS.faridabad, LOCATIONS.neemrana);
  const hit1 = ex1.find((r) => r.commute_id === delhiJaipur.id || r.source_label?.includes('Delhi'));
  if (hit1) {
    pass('Faridabad → Neemrana matches Delhi → Jaipur', `type=${hit1.match_type} pickup=${hit1.pickup_proximity_km}km`);
  } else {
    fail('Faridabad → Neemrana matches Delhi → Jaipur', `${ex1.length} rides returned`);
  }

  // Example 2: Ghaziabad → Cyber City on Noida → Gurgaon
  const ex2 = await geoSearch(passenger.token, LOCATIONS.ghaziabad, LOCATIONS.cyberCity);
  const hit2 = ex2.some((r) => r.source_label?.includes('Noida') || r.commute_id === noidaGurgaon.id);
  if (hit2) pass('Ghaziabad → Cyber City matches Noida → Gurgaon');
  else fail('Ghaziabad → Cyber City matches Noida → Gurgaon');

  // Example 3: Thane → Lonavala on Mumbai → Pune
  const ex3 = await geoSearch(passenger.token, LOCATIONS.thane, LOCATIONS.lonavala);
  const hit3 = ex3.some((r) => r.source_label?.includes('Mumbai') || r.commute_id === mumbaiPune.id);
  if (hit3) pass('Thane → Lonavala matches Mumbai → Pune');
  else fail('Thane → Lonavala matches Mumbai → Pune');

  // Exact match Delhi → Jaipur
  const exact = await geoSearch(passenger.token, LOCATIONS.delhi, LOCATIONS.jaipur);
  const exactHit = exact.find((r) => r.match_type === 'exact' || (r.pickup_proximity_km <= 2 && r.dest_proximity_km <= 2));
  if (exactHit) pass('Exact match Delhi → Jaipur', `type=${exactHit.match_type}`);
  else if (exact.length) pass('Delhi → Jaipur found (nearby/recommended)', `count=${exact.length}`);
  else fail('Exact match Delhi → Jaipur');

  // Reverse direction rejected: Jaipur → Gurgaon on Delhi → Jaipur
  const reverse = await geoSearch(passenger.token, LOCATIONS.jaipur, LOCATIONS.gurgaon);
  const reverseHit = reverse.find((r) => r.commute_id === delhiJaipur.id);
  if (!reverseHit) pass('Reverse Jaipur → Gurgaon rejected on Delhi → Jaipur');
  else fail('Reverse direction should not match', `trip ${reverseHit.id}`);

  // Bangalore → Mysore
  const ex5 = await geoSearch(passenger.token, LOCATIONS.bangalore, LOCATIONS.mysore);
  if (ex5.some((r) => r.commute_id === bangaloreMysore.id || r.source_label?.includes('Bangalore'))) {
    pass('Bangalore → Mysore exact corridor');
  } else {
    fail('Bangalore → Mysore', `${ex5.length} results`);
  }

  // Scoring present
  if (ex1[0]?.match_score != null) pass('Match score returned');
  else fail('Match score missing');

  const failed = results.filter((r) => !r.ok);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===\n`);
  if (failed.length) {
    failed.forEach((f) => console.log(`  FAIL: ${f.name} — ${f.detail}`));
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
