/**
 * Real-time route engine — Google Directions (preferred) + OpenRouteService + OSRM fallback.
 */
const { searchPlaces } = require('../utils/geocode');
const googleMaps = require('./googleMaps');

const ORS_BASE = process.env.OPENROUTESERVICE_BASE_URL || 'https://api.openrouteservice.org';
const OSRM_BASE = process.env.OSRM_BASE_URL || 'https://router.project-osrm.org';
const ROUTE_CACHE_TTL_MS = 15 * 60 * 1000;
const routeCache = new Map();

function cacheKey(parts) {
  return JSON.stringify(parts);
}

function readCache(key) {
  const hit = routeCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > ROUTE_CACHE_TTL_MS) {
    routeCache.delete(key);
    return null;
  }
  return hit.value;
}

function writeCache(key, value) {
  routeCache.set(key, { at: Date.now(), value });
  if (routeCache.size > 200) {
    routeCache.delete(routeCache.keys().next().value);
  }
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

function formatDistance(meters) {
  const km = (meters / 1000).toFixed(meters >= 10000 ? 0 : 1);
  return `${km} km`;
}

function estimateFuelInr(distanceM) {
  const km = distanceM / 1000;
  return Math.round(km * 8);
}

function estimateTollInr(distanceM, hasTolls) {
  if (!hasTolls) return 0;
  return Math.round((distanceM / 1000) * 2.2);
}

function encodePolyline(coords) {
  let lastLat = 0;
  let lastLng = 0;
  let result = '';
  for (const [lng, lat] of coords) {
    const ilat = Math.round(lat * 1e5);
    const ilng = Math.round(lng * 1e5);
    result += encodeSigned(ilat - lastLat);
    result += encodeSigned(ilng - lastLng);
    lastLat = ilat;
    lastLng = ilng;
  }
  return result;
}

function encodeSigned(num) {
  let s = num << 1;
  if (num < 0) s = ~s;
  let out = '';
  while (s >= 0x20) {
    out += String.fromCharCode((0x20 | (s & 0x1f)) + 63);
    s >>= 5;
  }
  out += String.fromCharCode(s + 63);
  return out;
}

function decodePolyline(encoded) {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlat = (result & 1) ? ~(result >> 1) : (result >> 1);
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    const dlng = (result & 1) ? ~(result >> 1) : (result >> 1);
    lng += dlng;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function lineWktFromEncodedPolyline(encoded) {
  const latLng = decodePolyline(encoded);
  if (latLng.length < 2) return null;
  const coordinates = latLng.map(([lat, lng]) => [lng, lat]);
  return coordsToLineWkt(coordinates);
}

function coordsToLineWkt(coordinates) {
  const pts = coordinates.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `SRID=4326;LINESTRING(${pts})`;
}

function latLngPolyline(coordinates) {
  return coordinates.map(([lng, lat]) => [lat, lng]);
}

function computeEta(departureAt, durationS) {
  if (!departureAt) return null;
  const base = new Date(departureAt).getTime();
  if (Number.isNaN(base)) return null;
  return new Date(base + durationS * 1000).toISOString();
}

async function geocodeLabel(label, city) {
  const trimmed = (label || '').trim();
  if (!trimmed) return null;

  try {
    const results = await searchPlaces(trimmed, city ? { city } : {});
    const hit = results?.[0];
    if (hit?.lat != null && hit?.lng != null) {
      return { lat: hit.lat, lng: hit.lng, label: hit.label || trimmed };
    }
  } catch {
    /* try again without city */
  }

  try {
    const results = await searchPlaces(trimmed);
    const hit = results?.[0];
    if (hit?.lat != null && hit?.lng != null) {
      return { lat: hit.lat, lng: hit.lng, label: hit.label || trimmed };
    }
  } catch {
    /* fall through */
  }

  return null;
}

async function resolveWaypoints({ routeFrom, routeTo, stopovers = [], city }) {
  const stops = Array.isArray(stopovers) ? stopovers.filter((s) => String(s).trim()) : [];
  const labels = [routeFrom, ...stops, routeTo];
  const resolved = await Promise.all(labels.map((label) => geocodeLabel(label, city)));

  const missing = labels.filter((_, i) => !resolved[i]);
  if (missing.length) {
    const err = new Error(`Location not found: ${missing.join(', ')}`);
    err.code = 'GEOCODE_FAILED';
    err.missing = missing;
    throw err;
  }

  return resolved;
}

function haversineM(a, b) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function estimatePathLengthM(coordinates) {
  let total = 0;
  for (let i = 1; i < coordinates.length; i += 1) {
    const [lngA, latA] = coordinates[i - 1];
    const [lngB, latB] = coordinates[i];
    total += haversineM({ lat: latA, lng: lngA }, { lat: latB, lng: lngB });
  }
  return total;
}

async function fetchOpenRouteService(coordinates, { avoidTolls = false, alternatives = true } = {}) {
  const apiKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!apiKey) return null;

  const pathLen = estimatePathLengthM(coordinates);
  const useAlternatives = alternatives && pathLen <= 120000;

  const buildBody = (withAlternatives) => {
    const body = {
      coordinates,
      preference: 'recommended',
    };
    if (withAlternatives) {
      body.alternative_routes = { target_count: 2, share_factor: 0.6, weight_factor: 1.4 };
    }
    if (avoidTolls) {
      body.options = { avoid_features: ['tollways'] };
    }
    return body;
  };

  async function request(withAlternatives) {
    const res = await fetch(`${ORS_BASE}/v2/directions/driving-car/geojson`, {
      method: 'POST',
      headers: {
        Authorization: apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildBody(withAlternatives)),
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const err = new Error(`OpenRouteService error ${res.status}: ${text.slice(0, 120)}`);
      err.status = res.status;
      throw err;
    }

    const data = await res.json();
    return (data.features || []).map((feature, index) => {
      const coordinatesRaw = feature.geometry?.coordinates || [];
      const summary = feature.properties?.summary || {};
      const segments = feature.properties?.segments || [];
      const road = segments[0]?.steps?.[0]?.name || 'Main road';

      return {
        index,
        coordinates: coordinatesRaw,
        distance_m: Math.round(summary.distance || 0),
        duration_s: Math.round(summary.duration || 0),
        road,
        hasTolls: !avoidTolls,
        avoidTolls,
      };
    }).filter((r) => r.coordinates.length >= 2);
  }

  try {
    return await request(useAlternatives);
  } catch (err) {
    if (useAlternatives && (err.status === 400 || String(err.message).includes('2004'))) {
      return request(false);
    }
    throw err;
  }
}

async function fetchOsrm(coordinates, { alternatives = true } = {}) {
  const coordStr = coordinates.map(([lng, lat]) => `${lng},${lat}`).join(';');
  const url = `${OSRM_BASE}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true${alternatives ? '&alternatives=true' : ''}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!res.ok) throw new Error(`OSRM error ${res.status}`);

  const data = await res.json();
  if (data.code !== 'Ok' || !data.routes?.length) {
    throw new Error(data.message || 'OSRM could not find a route');
  }

  return data.routes.map((route, index) => {
    const coordinatesRaw = route.geometry?.coordinates || [];
    const road = route.legs?.[0]?.steps?.[0]?.name || 'Main road';
    return {
      index,
      coordinates: coordinatesRaw,
      distance_m: Math.round(route.distance || 0),
      duration_s: Math.round(route.duration || 0),
      road,
      hasTolls: false,
      avoidTolls: true,
    };
  }).filter((r) => r.coordinates.length >= 2);
}

function routeToOption(raw, id, type, label, waypoints, departureAt) {
  const from = waypoints[0];
  const to = waypoints[waypoints.length - 1];
  const stopoverCoords = waypoints.slice(1, -1).map((w) => [w.lat, w.lng]);
  const tollCost = estimateTollInr(raw.distance_m, raw.hasTolls);

  return {
    id,
    type,
    label,
    summary: `${formatDuration(raw.duration_s)} · ${raw.hasTolls ? 'With tolls' : 'No tolls'}`,
    detail: `${formatDistance(raw.distance_m)} · ${raw.road}`,
    distance_m: raw.distance_m,
    duration_s: raw.duration_s,
    distance_label: formatDistance(raw.distance_m),
    duration_label: formatDuration(raw.duration_s),
    hasTolls: raw.hasTolls,
    toll_cost_inr: tollCost,
    fuel_estimate_inr: estimateFuelInr(raw.distance_m),
    polyline: latLngPolyline(raw.coordinates),
    encoded_polyline: encodePolyline(raw.coordinates),
    route_geometry_wkt: coordsToLineWkt(raw.coordinates),
    from: [from.lat, from.lng],
    to: [to.lat, to.lng],
    stopover_coords: stopoverCoords,
    eta: computeEta(departureAt, raw.duration_s),
    variant: raw.index,
  };
}

function dedupeRoutes(routes) {
  const seen = new Set();
  return routes.filter((r) => {
    const key = `${r.distance_m}-${r.duration_s}-${r.hasTolls}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function classifyRoutes(rawRoutes, waypoints, departureAt) {
  if (!rawRoutes.length) return [];

  const sortedByDuration = [...rawRoutes].sort((a, b) => a.duration_s - b.duration_s);
  const sortedByDistance = [...rawRoutes].sort((a, b) => a.distance_m - b.distance_m);
  const tollRoutes = rawRoutes.filter((r) => r.hasTolls);
  const noTollRoutes = rawRoutes.filter((r) => !r.hasTolls);

  const picks = [];
  const fastest = sortedByDuration[0];
  const shortest = sortedByDistance[0];
  const recommended = rawRoutes[0];
  const withTolls = tollRoutes.sort((a, b) => a.duration_s - b.duration_s)[0] || fastest;
  const withoutTolls = noTollRoutes.sort((a, b) => a.duration_s - b.duration_s)[0]
    || rawRoutes.find((r) => !r.hasTolls)
    || fastest;

  picks.push(routeToOption(fastest, 'fastest', 'fastest', 'Fastest route', waypoints, departureAt));
  picks.push(routeToOption(recommended, 'recommended', 'recommended', 'Recommended route', waypoints, departureAt));
  picks.push(routeToOption(shortest, 'shortest', 'shortest', 'Shortest route', waypoints, departureAt));
  picks.push(routeToOption(withTolls, 'with_tolls', 'with_tolls', 'Route with tolls', waypoints, departureAt));

  if (withoutTolls && (withoutTolls.distance_m !== withTolls.distance_m || withoutTolls.duration_s !== withTolls.duration_s)) {
    picks.push(routeToOption(withoutTolls, 'without_tolls', 'without_tolls', 'Route without tolls', waypoints, departureAt));
  }

  for (const raw of rawRoutes.slice(1, 4)) {
    picks.push(routeToOption(raw, `alt-${raw.index}`, 'alternative', `Alternative ${raw.index}`, waypoints, departureAt));
  }

  return dedupeRoutes(picks);
}

/**
 * Calculate real driving routes for source → stopovers → destination.
 */
async function calculateRoutes({
  route_from: routeFrom,
  route_to: routeTo,
  stopovers = [],
  city,
  departure_at: departureAt,
}) {
  const fromLabel = (routeFrom || '').trim();
  const toLabel = (routeTo || '').trim();
  if (!fromLabel || !toLabel) {
    return { routes: [], source: 'none', error: 'Source and destination are required.' };
  }

  const stops = Array.isArray(stopovers)
    ? stopovers.map((s) => String(s).trim()).filter(Boolean)
    : [];

  const key = cacheKey([fromLabel, toLabel, stops, city || '']);
  const cached = readCache(key);
  if (cached) return cached;

  const waypoints = await resolveWaypoints({
    routeFrom: fromLabel,
    routeTo: toLabel,
    stopovers: stops,
    city,
  });

  const coordinates = waypoints.map((w) => [w.lng, w.lat]);
  let rawRoutes = [];
  let source = 'osrm';

  if (googleMaps.preferGoogle()) {
    try {
      const wpLatLng = waypoints.map((w) => ({ lat: w.lat, lng: w.lng }));
      const withTolls = await googleMaps.fetchDirections(wpLatLng, { avoidTolls: false, alternatives: true });
      let withoutTolls = [];
      try {
        withoutTolls = await googleMaps.fetchDirections(wpLatLng, { avoidTolls: true, alternatives: false }) || [];
      } catch (tollErr) {
        console.warn('[RouteEngine] Google no-toll route skipped:', tollErr.message);
      }
      rawRoutes = [...(withTolls || []), ...withoutTolls];
      if (rawRoutes.length) source = 'google';
    } catch (err) {
      console.warn('[RouteEngine] Google Directions failed:', err.message);
    }
  }

  const orsKey = process.env.OPENROUTESERVICE_API_KEY;
  if (!rawRoutes.length && orsKey) {
    try {
      const withTolls = await fetchOpenRouteService(coordinates, { avoidTolls: false, alternatives: true });
      let withoutTolls = [];
      try {
        withoutTolls = await fetchOpenRouteService(coordinates, { avoidTolls: true, alternatives: false }) || [];
      } catch (tollErr) {
        console.warn('[RouteEngine] ORS no-toll route skipped:', tollErr.message);
      }
      rawRoutes = [...(withTolls || []), ...withoutTolls];
      if (rawRoutes.length) source = 'ors';
    } catch (err) {
      console.warn('[RouteEngine] ORS failed:', err.message);
    }
  }

  if (!rawRoutes.length) {
    try {
      rawRoutes = await fetchOsrm(coordinates, { alternatives: true });
      source = 'osrm';
    } catch (err) {
      console.error('[RouteEngine] OSRM failed:', err.message);
      const error = {
        routes: [],
        source: 'none',
        error: 'Unable to calculate route. Routing service unavailable.',
        retryable: true,
      };
      throw Object.assign(new Error(error.error), { payload: error });
    }
  }

  const routes = classifyRoutes(rawRoutes, waypoints, departureAt);
  if (!routes.length) {
    throw Object.assign(new Error('Unable to calculate route.'), {
      payload: { routes: [], source: 'none', error: 'Unable to calculate route.', retryable: true },
    });
  }

  const result = {
    routes,
    source,
    waypoints: waypoints.map((w) => ({ lat: w.lat, lng: w.lng, label: w.label })),
    default_route_id: routes.find((r) => r.id === 'recommended')?.id || routes[0].id,
  };

  writeCache(key, result);
  return result;
}

module.exports = {
  calculateRoutes,
  geocodeLabel,
  resolveWaypoints,
  encodePolyline,
  decodePolyline,
  lineWktFromEncodedPolyline,
  coordsToLineWkt,
  formatDuration,
  formatDistance,
  estimateFuelInr,
  estimateTollInr,
};
