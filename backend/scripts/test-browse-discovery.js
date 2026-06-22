/**
 * Phase 11 — Browse discovery tests (publish → search must find ride).
 * Run: node scripts/test-browse-discovery.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3001/api';

const ROUTES = {
  delhi_jaipur: {
    route_from: 'Delhi, India',
    route_to: 'Jaipur, India',
    source_lat: 28.6139, source_lng: 77.2090,
    dest_lat: 26.9124, dest_lng: 75.7873,
    stopovers: ['Gurgaon', 'Manesar', 'Neemrana'],
  },
  noida_gurgaon: {
    route_from: 'Noida, Uttar Pradesh, India',
    route_to: 'Gurgaon, Haryana, India',
    source_lat: 28.5355, source_lng: 77.3910,
    dest_lat: 28.4595, dest_lng: 77.0266,
    stopovers: [],
  },
  mumbai_pune: {
    route_from: 'Mumbai, Maharashtra, India',
    route_to: 'Pune, Maharashtra, India',
    source_lat: 19.0760, source_lng: 72.8777,
    dest_lat: 18.5204, dest_lng: 73.8567,
    stopovers: [],
  },
  bangalore_mysore: {
    route_from: 'Bangalore, Karnataka, India',
    route_to: 'Mysore, Karnataka, India',
    source_lat: 12.9716, source_lng: 77.5946,
    dest_lat: 12.2958, dest_lng: 76.6394,
    stopovers: [],
  },
};

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Login failed for ${email}`);
  return data;
}

async function publish(token, route, label) {
  const tomorrow = new Date(Date.now() + 86400000);
  const departure_date = tomorrow.toISOString().slice(0, 10);
  const body = {
    route_from: route.route_from,
    route_to: route.route_to,
    departure_date,
    departure_time: '10:30',
    seats_available: 3,
    price_per_seat: 150,
    stopovers: route.stopovers || [],
    source_lat: route.source_lat,
    source_lng: route.source_lng,
    dest_lat: route.dest_lat,
    dest_lng: route.dest_lng,
    route_distance_m: 250000,
    route_duration_s: 14400,
    route_label: label,
  };
  const res = await fetch(`${BASE}/commutes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Publish failed');
  return data.commute;
}

async function textSearch(token, { route_from, route_to, date }) {
  const qs = new URLSearchParams();
  if (route_from) qs.set('route_from', route_from);
  if (route_to) qs.set('route_to', route_to);
  if (date) qs.set('date', date);
  const res = await fetch(`${BASE}/commutes/search?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.commutes || [];
}

async function geoSearch(token, pickup, drop, date) {
  const qs = new URLSearchParams({
    pickup_lat: String(pickup.lat),
    pickup_lng: String(pickup.lng),
    drop_lat: String(drop.lat),
    drop_lng: String(drop.lng),
  });
  if (date) qs.set('date', date);
  const res = await fetch(`${BASE}/rides/search?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json();
  return data.rides || [];
}

function foundInText(commutes, commuteId, searchFrom, searchTo) {
  return commutes.some((c) => c.id === commuteId
    || (searchFrom && searchTo && c.route_from?.includes(searchFrom.split(',')[0])));
}

async function runTest(name, {
  routeKey, searchFrom, searchTo, pickup, drop, stopoverSearch,
}) {
  const route = ROUTES[routeKey];
  const driver = await login('rajesh.kumar@company.com', 'demo123');
  const passenger = await login('priya.sharma@company.com', 'demo123');

  const commute = await publish(driver.token, route, name);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  const fromQ = searchFrom || route.route_from.split(',')[0];
  const toQ = searchTo || route.route_to.split(',')[0];

  const textResults = await textSearch(passenger.token, {
    route_from: fromQ,
    route_to: toQ,
    date: tomorrow,
  });

  const textHit = textResults.some((c) => c.id === commute.id);
  let geoHit = false;
  if (pickup && drop) {
    const geoResults = await geoSearch(passenger.token, pickup, drop, tomorrow);
    geoHit = geoResults.some((r) => Number(r.commute_id) === commute.id || Number(r.id) === commute.id);
  }

  const pass = textHit || geoHit;
  console.log(`${pass ? 'PASS' : 'FAIL'} — ${name}`);
  console.log(`  Published commute id=${commute.id} status=${commute.status}`);
  console.log(`  Search: "${fromQ}" → "${toQ}"`);
  console.log(`  Text results: ${textResults.length} (found=${textHit})`);
  if (pickup) console.log(`  Geo results: found=${geoHit}`);
  if (stopoverSearch) console.log(`  Stopover segment search enabled`);
  console.log('');
  return pass;
}

async function main() {
  console.log('\n=== PHASE 11: Browse Discovery Tests ===\n');

  const results = [];

  results.push(await runTest('Test 1: Delhi → Jaipur', {
    routeKey: 'delhi_jaipur',
    searchFrom: 'Delhi',
    searchTo: 'Jaipur',
    pickup: { lat: 28.6139, lng: 77.2090 },
    drop: { lat: 26.9124, lng: 75.7873 },
  }));

  results.push(await runTest('Test 2: Noida → Gurgaon', {
    routeKey: 'noida_gurgaon',
    searchFrom: 'Noida',
    searchTo: 'Gurgaon',
    pickup: { lat: 28.5355, lng: 77.3910 },
    drop: { lat: 28.4595, lng: 77.0266 },
  }));

  results.push(await runTest('Test 3: Gurgaon → Neemrana (stopover segment)', {
    routeKey: 'delhi_jaipur',
    searchFrom: 'Gurgaon',
    searchTo: 'Neemrana',
    pickup: { lat: 28.4595, lng: 77.0266 },
    drop: { lat: 27.9889, lng: 76.3847 },
    stopoverSearch: true,
  }));

  results.push(await runTest('Test 4: Mumbai → Pune', {
    routeKey: 'mumbai_pune',
    searchFrom: 'Mumbai',
    searchTo: 'Pune',
    pickup: { lat: 19.0760, lng: 72.8777 },
    drop: { lat: 18.5204, lng: 73.8567 },
  }));

  results.push(await runTest('Test 5: Bangalore → Mysore', {
    routeKey: 'bangalore_mysore',
    searchFrom: 'Bangalore',
    searchTo: 'Mysore',
    pickup: { lat: 12.9716, lng: 77.5946 },
    drop: { lat: 12.2958, lng: 76.6394 },
  }));

  const passed = results.filter(Boolean).length;
  console.log(`Summary: ${passed}/${results.length} passed\n`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
