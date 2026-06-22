#!/usr/bin/env node
/**
 * QA verification for route engine + OpenRouteService key.
 * Usage: node scripts/verify-route-engine.js
 */
require('dotenv').config();
const { calculateRoutes } = require('../src/services/routeEngine');

async function assert(condition, message) {
  if (!condition) {
    console.error('FAIL:', message);
    process.exit(1);
  }
  console.log('OK:', message);
}

async function main() {
  const key = process.env.OPENROUTESERVICE_API_KEY;
  await assert(Boolean(key && key.trim()), 'OPENROUTESERVICE_API_KEY is loaded');

  const direct = await calculateRoutes({ route_from: 'Delhi', route_to: 'Jaipur' });
  await assert(direct.routes?.length > 0, 'Delhi → Jaipur returns routes');
  await assert(['ors', 'osrm'].includes(direct.source), `Route source is ${direct.source}`);
  const d0 = direct.routes[0];
  await assert(d0.distance_m > 200000, `Distance realistic (${d0.distance_m} m)`);
  await assert(d0.duration_s > 3600, `Duration realistic (${d0.duration_s} s)`);
  await assert(d0.encoded_polyline?.length > 100, 'Encoded polyline present');
  await assert(d0.route_geometry_wkt?.includes('LINESTRING'), 'Geometry WKT present');
  await assert(d0.polyline?.length > 10, 'Lat/lng polyline present');

  const withStops = await calculateRoutes({
    route_from: 'Delhi',
    route_to: 'Jaipur',
    stopovers: ['Gurgaon', 'Neemrana'],
  });
  await assert(withStops.routes?.length > 0, 'Delhi → Gurgaon → Neemrana → Jaipur returns routes');
  const s0 = withStops.routes[0];
  await assert(
    s0.distance_m !== d0.distance_m || s0.encoded_polyline !== d0.encoded_polyline,
    `Stopover route differs from direct (${s0.distance_m} vs ${d0.distance_m} m)`,
  );
  await assert(
    withStops.waypoints?.length === 4,
    `Waypoints include stopovers (${withStops.waypoints?.length})`,
  );

  const tollRoute = withStops.routes.find((r) => r.id === 'with_tolls' || r.hasTolls);
  const noTollRoute = withStops.routes.find((r) => r.id === 'without_tolls' || !r.hasTolls);
  if (direct.source === 'ors') {
    await assert(Boolean(tollRoute), 'Toll route option present');
    await assert(Boolean(noTollRoute), 'No-toll route option present');
  }

  console.log('\nAll route engine checks passed.');
}

main().catch((err) => {
  console.error('Verification failed:', err.message);
  process.exit(1);
});
