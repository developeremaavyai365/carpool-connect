/** Shared constants for geospatial ride matching */

function parseMatchingRadiusKm(): number {
  const raw = process.env.MATCHING_RADIUS_KM;
  const km = raw != null && raw !== '' ? Number(raw) : 50;
  return Number.isFinite(km) && km > 0 ? km : 50;
}

/** Configurable via MATCHING_RADIUS_KM env (default 50 km) */
export const MATCHING_RADIUS_KM = parseMatchingRadiusKm();
export const MATCHING_RADIUS_M = Math.round(MATCHING_RADIUS_KM * 1000);

/** Corridor / waypoint proximity — same as matching radius */
export const ROUTE_PROXIMITY_M = MATCHING_RADIUS_M;
export const MATCH_RADIUS_M = MATCHING_RADIUS_M;

/** Within this distance (km) a match is classified as "exact" */
export const EXACT_MATCH_KM = 2;
/** Within this distance (km) a match is classified as "nearby" */
export const NEARBY_MATCH_KM = 15;

export const CACHE_TTL_ACTIVE_TRIPS_SEC = 120;
export const CACHE_TTL_SEARCH_SEC = 60;

export const TRIP_STATUSES = ['active', 'full', 'cancelled', 'completed'] as const;
export const BOOKING_STATUSES = ['pending', 'confirmed', 'cancelled', 'completed'] as const;

export const RANKING_WEIGHTS = {
  routeOverlap: 0.25,
  pickupProximity: 0.15,
  destProximity: 0.15,
  timeSimilarity: 0.15,
  distanceDeviation: 0.1,
  driverRating: 0.1,
  cancellationPenalty: 0.05,
  price: 0.05,
} as const;
