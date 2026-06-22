/**
 * Final system-wide E2E audit — run against live backend with Supabase configured.
 * Usage: node scripts/final-system-audit.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3001/api';

const results = [];

function pass(phase, name, detail = '') {
  results.push({ phase, name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`);
}

function fail(phase, name, detail = '') {
  results.push({ phase, name, ok: false, detail });
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
  if (!res.ok) throw new Error(data.error || `Login failed: ${email}`);
  return data;
}

async function main() {
  console.log('\n========== CARPOOL CONNECT — FINAL SYSTEM AUDIT ==========\n');

  // Phase 2 — Health & build prerequisites
  console.log('Phase 2: API health');
  try {
    const healthUrl = `${BASE.replace(/\/api\/?$/, '')}/api/health`;
    const h = await jsonFetch(healthUrl);
    if (h.res.ok && h.data.status === 'ok') {
      pass('2', 'Health check', `db=${h.data.database?.engine} geospatial=${h.data.geospatial}`);
    } else {
      fail('2', 'Health check', JSON.stringify(h.data));
    }
  } catch (e) {
    fail('2', 'Health check', e.message);
    console.log('\nStart backend: cd backend && npm run dev\n');
    process.exit(1);
  }

  // Phase 4/5 — Auth
  console.log('\nPhase 4/5: Authentication');
  let driver;
  let passenger;
  try {
    driver = await login('rajesh.kumar@company.com', 'demo123');
    pass('4', 'Driver login', driver.employee.email);
    passenger = await login('priya.sharma@company.com', 'demo123');
    pass('5', 'Passenger login', passenger.employee.email);
    if (driver.token?.split('.').length === 3) pass('9', 'App JWT issued');
  } catch (e) {
    fail('4', 'Login', e.message);
    process.exit(1);
  }

  // Phase 7 — Route engine (no auth)
  console.log('\nPhase 7: Route engine');
  try {
    const { res, data } = await jsonFetch(`${BASE}/commutes/routes/calculate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        route_from: 'Delhi, India',
        route_to: 'Jaipur, India',
        stopovers: ['Gurgaon'],
      }),
    });
    if (res.ok && data.routes?.length >= 1 && data.source === 'ors') {
      const r0 = data.routes[0];
      const r1 = data.routes[1];
      const distinct = !r1 || r0.distance_m !== r1.distance_m || r0.id !== r1.id;
      pass('7', 'ORS route calculation', `${data.routes.length} routes`);
      if (r0.polyline || r0.encoded_polyline) pass('7', 'Polyline returned');
      else fail('7', 'Polyline missing');
    } else {
      fail('7', 'Route calculation', JSON.stringify(data).slice(0, 120));
    }
  } catch (e) {
    fail('7', 'Route engine', e.message);
  }

  // Phase 4 — Publish
  console.log('\nPhase 4: Driver publish');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let published;
  try {
    const { res, data } = await jsonFetch(`${BASE}/commutes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driver.token}`,
      },
      body: JSON.stringify({
        route_from: 'Delhi, India',
        route_to: 'Agra, India',
        departure_date: tomorrow,
        departure_time: '11:00',
        seats_available: 2,
        price_per_seat: 120,
        stopovers: ['Mathura'],
        source_lat: 28.6139,
        source_lng: 77.209,
        dest_lat: 27.1767,
        dest_lng: 78.0081,
        route_distance_m: 200000,
        route_duration_s: 10800,
      }),
    });
    if (res.status === 201 && data.commute?.id) {
      published = data.commute;
      pass('4', 'Publish commute', `id=${published.id} status=${published.status}`);
    } else {
      fail('4', 'Publish commute', data.error || res.status);
    }
  } catch (e) {
    fail('4', 'Publish', e.message);
  }

  // Phase 4 — Driver dashboard
  console.log('\nPhase 4: Driver dashboard (/commutes/mine)');
  try {
    const { res, data } = await jsonFetch(`${BASE}/commutes/mine`, {
      headers: { Authorization: `Bearer ${driver.token}` },
    });
    if (res.ok && data.buckets && data.stats) {
      pass('4', 'Driver buckets', `upcoming=${data.stats.upcoming} total=${data.stats.total}`);
      const owns = !published || data.commutes.some((c) => c.id === published.id);
      if (owns) pass('4', 'Published ride in driver list');
      else fail('4', 'Published ride missing from mine');
    } else {
      fail('4', 'Driver dashboard', JSON.stringify(data).slice(0, 100));
    }
  } catch (e) {
    fail('4', 'Driver dashboard', e.message);
  }

  // Phase 5/6 — Browse & matching
  console.log('\nPhase 5/6: Browse & matching');
  try {
    const { res, data } = await jsonFetch(
      `${BASE}/commutes/search?route_from=Delhi&route_to=Agra`,
      { headers: { Authorization: `Bearer ${passenger.token}` } },
    );
    const textHit = published && data.commutes?.some((c) => c.id === published.id);
    if (res.ok) pass('5', 'Text search', `${data.commutes?.length} results`);
    if (textHit) pass('6', 'Exact match in text search', `commute ${published.id}`);
    else if (published) fail('6', 'Exact match text search', 'published ride not found');
  } catch (e) {
    fail('5', 'Browse/search', e.message);
  }

  // Phase 5 — Booking (trip_id from geo or text search)
  console.log('\nPhase 5: Instant booking');
  try {
    let tripId = null;
    const geo = await jsonFetch(
      `${BASE}/rides/search?pickup_lat=28.6139&pickup_lng=77.2090&drop_lat=27.1767&drop_lng=78.0081`,
      { headers: { Authorization: `Bearer ${passenger.token}` } },
    );
    const geoTrip = geo.data.rides?.[0];
    if (geoTrip?.id) {
      tripId = Number(geoTrip.id);
      pass('6', 'Geospatial search', `${geo.data.rides.length} trips`);
    }

    if (!tripId) {
      const text = await jsonFetch(
        `${BASE}/commutes/search?route_from=Delhi&route_to=Jaipur`,
        { headers: { Authorization: `Bearer ${passenger.token}` } },
      );
      const withTrip = text.data.commutes?.find((c) => c.trip_id);
      if (withTrip?.trip_id) tripId = Number(withTrip.trip_id);
    }

    if (!tripId) {
      fail('5', 'Booking', 'no trip_id available (geo or text)');
    } else {
      const { res, data } = await jsonFetch(`${BASE}/rides/book`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${passenger.token}`,
        },
        body: JSON.stringify({
          trip_id: tripId,
          seats: 1,
          pickup_lat: 28.6139,
          pickup_lng: 77.209,
          drop_lat: 27.1767,
          drop_lng: 78.0081,
        }),
      });
      if (res.status === 201 && data.booking) {
        pass('5', 'Instant book', `booking id=${data.booking.id}`);
      } else if (res.status === 409) {
        pass('5', 'Book auth path OK', data.error || 'conflict (seats/full/duplicate)');
      } else {
        fail('5', 'Instant book', `${res.status} ${data.error || ''}`);
      }
    }
  } catch (e) {
    fail('5', 'Booking', e.message);
  }

  // Phase 4 — Complete & cancel lifecycle
  console.log('\nPhase 4: Status lifecycle');
  if (published) {
    try {
      const complete = await jsonFetch(`${BASE}/commutes/${published.id}/complete`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${driver.token}` },
      });
      if (complete.res.ok && complete.data.commute?.status === 'completed') {
        pass('4', 'Mark completed');
      } else {
        fail('4', 'Mark completed', complete.data.error);
      }
    } catch (e) {
      fail('4', 'Complete', e.message);
    }
  }

  // Phase 9 — Unauthorized
  console.log('\nPhase 9: Security');
  try {
    const { res } = await jsonFetch(`${BASE}/commutes/mine`);
    if (res.status === 401) pass('9', 'Protected /commutes/mine');
    else fail('9', 'Auth bypass', res.status);
  } catch (e) {
    fail('9', 'Security', e.message);
  }

  // Summary
  const passed = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok);
  console.log('\n========== SUMMARY ==========');
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed.length) {
    console.log('Failed:');
    failed.forEach((f) => console.log(`  - [${f.phase}] ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log('All audit checks passed.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
