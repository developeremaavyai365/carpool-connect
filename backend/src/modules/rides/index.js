/**
 * JS loader — compiles TypeScript rides module at runtime via tsx, or loads built output.
 */
const path = require('path');
const fs = require('fs');

function loadRidesModule() {
  const compiledPath = path.join(__dirname, '../../../dist/modules/rides/routes/rides.routes.js');
  if (fs.existsSync(compiledPath)) {
    return require(compiledPath);
  }
  const { register } = require('tsx/cjs/api');
  register();
  return require('./routes/rides.routes.ts');
}

function loadRidesRouter() {
  try {
    const { createRidesRouter } = loadRidesModule();
    return createRidesRouter();
  } catch (err) {
    console.warn('[RidesModule] Failed to load TypeScript rides module:', err.message);
    console.warn('[RidesModule] Run: cd backend && npm install && npm run build:rides');
    return null;
  }
}

function loadTripService() {
  try {
    const compiledPath = path.join(__dirname, '../../../dist/modules/rides/services/trip.service.js');
    if (fs.existsSync(compiledPath)) {
      return require(compiledPath).tripService;
    }
    const { register } = require('tsx/cjs/api');
    register();
    return require('./services/trip.service.ts').tripService;
  } catch (err) {
    console.warn('[RidesModule] Trip service unavailable:', err.message);
    return null;
  }
}

function loadTripRepository() {
  try {
    const compiledPath = path.join(__dirname, '../../../dist/modules/rides/repositories/trip.repository.js');
    if (fs.existsSync(compiledPath)) {
      return require(compiledPath).tripRepository;
    }
    const { register } = require('tsx/cjs/api');
    register();
    return require('./repositories/trip.repository.ts').tripRepository;
  } catch (err) {
    return null;
  }
}

/**
 * Sync PostGIS trip when a published_commutes row is created (single ride system).
 */
async function syncGeospatialTripFromCommute(driverId, commute, coords, storedRoute) {
  const tripService = loadTripService();
  if (!tripService || !coords?.source_lat || !coords?.dest_lat) return null;

  try {
    const dto = {
      source_label: commute.route_from,
      dest_label: commute.route_to,
      source_lat: coords.source_lat,
      source_lng: coords.source_lng,
      dest_lat: coords.dest_lat,
      dest_lng: coords.dest_lng,
      departure_at: commute.departure_at,
      seats_available: commute.seats_available,
      price_per_seat: commute.price_per_seat,
      city: commute.city || '',
      commute_id: commute.id,
      stopover_coords: Array.isArray(commute.stopover_coords) ? commute.stopover_coords : [],
    };

    if (storedRoute?.polyline && storedRoute.lineWkt) {
      return await tripService.publishWithRoute(driverId, dto, storedRoute);
    }

    return await tripService.publish(driverId, dto);
  } catch (err) {
    console.warn('[RidesModule] Geospatial sync failed for commute', commute.id, err.message);
    return null;
  }
}

async function cancelGeospatialTripForCommute(commuteId, driverId) {
  const repo = loadTripRepository();
  if (!repo) return;
  try {
    await repo.cancelByCommuteId(commuteId, driverId);
  } catch (err) {
    console.warn('[RidesModule] Could not cancel trip for commute', commuteId, err.message);
  }
}

async function updateGeospatialTripFromCommute(driverId, commute, coords) {
  const tripService = loadTripService();
  if (!tripService || !coords?.source_lat || !coords?.dest_lat) return null;

  try {
    if (typeof tripService.updateByCommuteId === 'function') {
      return await tripService.updateByCommuteId(driverId, commute.id, {
        source_label: commute.route_from,
        dest_label: commute.route_to,
        source_lat: coords.source_lat,
        source_lng: coords.source_lng,
        dest_lat: coords.dest_lat,
        dest_lng: coords.dest_lng,
        departure_at: commute.departure_at,
        seats_available: commute.seats_available,
        price_per_seat: commute.price_per_seat,
        city: commute.city || '',
        commute_id: commute.id,
        stopover_coords: Array.isArray(commute.stopover_coords) ? commute.stopover_coords : [],
      });
    }
    return null;
  } catch (err) {
    console.warn('[RidesModule] Geospatial update failed for commute', commute.id, err.message);
    return null;
  }
}

module.exports = {
  loadRidesRouter,
  syncGeospatialTripFromCommute,
  updateGeospatialTripFromCommute,
  cancelGeospatialTripForCommute,
};
