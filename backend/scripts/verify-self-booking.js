/**
 * Verify drivers cannot book or request seats on their own commutes.
 * Usage: node scripts/verify-self-booking.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3001/api';

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

async function main() {
  console.log('\n=== SELF-BOOKING PREVENTION VERIFICATION ===\n');

  const driver = await login('rajesh.kumar@company.com', 'demo123');
  const passenger = await login('priya.sharma@company.com', 'demo123');
  const driverId = driver.employee.id;

  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const publish = await jsonFetch(`${BASE}/commutes`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${driver.token}`,
    },
    body: JSON.stringify({
      route_from: 'Delhi, India',
      route_to: 'Jaipur, India',
      departure_date: tomorrow,
      departure_time: '08:00',
      seats_available: 2,
      price_per_seat: 120,
      source_lat: 28.6139,
      source_lng: 77.209,
      dest_lat: 26.9124,
      dest_lng: 75.7873,
    }),
  });

  if (publish.res.status !== 201) {
    throw new Error(`Publish failed: ${publish.data.error}`);
  }
  const commute = publish.data.commute;
  console.log(`Published commute id=${commute.id} driver=${commute.driver_id}`);

  // Browse search must exclude own commute
  const search = await jsonFetch(`${BASE}/commutes/search?route_from=Delhi&route_to=Jaipur`, {
    headers: { Authorization: `Bearer ${driver.token}` },
  });
  const ownInBrowse = search.data.commutes?.some((c) => Number(c.id) === Number(commute.id));
  console.log(ownInBrowse ? '✗ FAIL: own commute in browse search' : '✓ Browse search excludes own commute');

  // Seat request blocked
  const req = await jsonFetch(`${BASE}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${driver.token}`,
    },
    body: JSON.stringify({
      receiver_id: commute.driver_id,
      commute_id: commute.id,
      message: 'Self request',
    }),
  });
  console.log(
    req.res.status === 403
      ? '✓ Seat request on own commute rejected (403)'
      : `✗ Seat request status ${req.res.status}: ${req.data.error}`,
  );

  // Geo search excludes own trips
  await new Promise((r) => setTimeout(r, 1500));
  const geo = await jsonFetch(
    `${BASE}/rides/search?pickup_lat=28.6139&pickup_lng=77.209&drop_lat=26.9124&drop_lng=75.7873`,
    { headers: { Authorization: `Bearer ${driver.token}` } },
  );
  const ownInGeo = geo.data.rides?.some(
    (t) => Number(t.commute_id) === Number(commute.id) || Number(t.driver_id) === Number(driverId),
  );
  console.log(ownInGeo ? '✗ FAIL: own trip in geo search' : '✓ Geo search excludes own trips');

  // Instant book blocked if trip exists
  const withTrip = await jsonFetch(`${BASE}/commutes/search?route_from=Delhi&route_to=Jaipur`, {
    headers: { Authorization: `Bearer ${passenger.token}` },
  });
  const tripRow = withTrip.data.commutes?.find((c) => Number(c.id) === Number(commute.id));
  if (tripRow?.trip_id) {
    const book = await jsonFetch(`${BASE}/rides/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${driver.token}`,
      },
      body: JSON.stringify({
        trip_id: tripRow.trip_id,
        seats: 1,
        pickup_lat: 28.6139,
        pickup_lng: 77.209,
        drop_lat: 26.9124,
        drop_lng: 75.7873,
      }),
    });
    console.log(
      book.res.status === 403
        ? '✓ Instant book on own trip rejected (403)'
        : `✗ Instant book status ${book.res.status}: ${book.data.error}`,
    );
  } else {
    console.log('⚠ Skipped instant book test (trip_id not synced yet)');
  }

  // Passenger can still request
  const okReq = await jsonFetch(`${BASE}/requests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${passenger.token}`,
    },
    body: JSON.stringify({
      receiver_id: commute.driver_id,
      commute_id: commute.id,
      message: 'Passenger request',
    }),
  });
  console.log(
    okReq.res.status === 201 || okReq.res.status === 409
      ? '✓ Other passenger can request seat'
      : `✗ Passenger request failed ${okReq.res.status}`,
  );

  console.log('\nDone.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
