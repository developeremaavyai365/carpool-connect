/**
 * Verify Supabase Realtime ride publishing pipeline.
 * Usage: node scripts/test-ride-realtime.js
 */
require('dotenv').config();

const db = require('../src/database');
const { isSupabaseConfigured } = require('../src/lib/supabase');
const { broadcastNewRide, startRideInsertListener } = require('../src/services/rideRealtime');

async function main() {
  if (!isSupabaseConfigured()) {
    console.log('SKIP: Supabase not configured (set SUPABASE_* in backend/.env)');
    process.exit(0);
  }

  console.log('Starting backend ride INSERT listener…');
  startRideInsertListener();

  await new Promise((r) => setTimeout(r, 2000));

  const employees = await db.searchEmployees({ city: 'Bangalore' });
  const driver = employees[0];
  if (!driver) {
    console.error('No users found to publish test ride');
    process.exit(1);
  }

  const departure = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
  console.log('Creating test ride for driver', driver.email);

  const commute = await db.createCommute({
    driver_id: driver.id,
    route_from: 'Realtime Test Pickup',
    route_to: 'Realtime Test Drop',
    city: driver.city || 'Bangalore',
    departure_at: departure,
    seats_available: 2,
    price_per_seat: 50,
    notes: 'Automated realtime test ride',
    stopovers: [],
    route_label: '',
    route_detail: '',
    smoking: 'not_allowed',
    music: 'any',
    pets: 'not_allowed',
  });

  console.log('Created commute id:', commute.id);
  const broadcastOk = await broadcastNewRide(commute);
  console.log('Broadcast new_ride:', broadcastOk ? 'OK' : 'FAILED');

  await db.deleteCommute(commute.id);
  console.log('Cleaned up test commute');
  console.log('Done — open Browse Rides on two devices; new publishes should appear live.');
  process.exit(broadcastOk ? 0 : 2);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
