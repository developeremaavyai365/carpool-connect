/**
 * Google Maps Platform — server-side proxy (keys never sent to client).
 * APIs: Geocoding, Places, Directions, Distance Matrix
 */
const FETCH_TIMEOUT_MS = 20000;
const BASE = 'https://maps.googleapis.com/maps/api';

function getApiKey() {
  return (process.env.GOOGLE_MAPS_API_KEY || '').trim();
}

function isGoogleMapsEnabled() {
  return Boolean(getApiKey());
}

function preferGoogle() {
  if (!isGoogleMapsEnabled()) return false;
  const flag = process.env.GOOGLE_MAPS_PREFERRED;
  if (flag === 'false' || flag === '0') return false;
  return true;
}

async function googleFetch(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error_message || `Google Maps API error (${res.status})`);
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function parseAddressComponents(components = []) {
  const get = (type) => components.find((c) => c.types?.includes(type))?.long_name;
  return {
    city: get('locality') || get('administrative_area_level_2') || get('administrative_area_level_1') || '',
    area: get('sublocality') || get('sublocality_level_1') || get('neighborhood') || get('route') || '',
    state: get('administrative_area_level_1') || '',
    country: get('country') || '',
  };
}

function toSearchResult(result, lat, lng) {
  const components = result.address_components || [];
  const parsed = parseAddressComponents(components);
  const formatted = result.formatted_address || result.name || '';
  return {
    label: formatted,
    place_id: result.place_id || null,
    home_address: [parsed.area, parsed.city].filter(Boolean).join(', ') || formatted,
    route_from: parsed.area || parsed.city || formatted.split(',')[0] || '',
    route_to: parsed.area || parsed.city || formatted.split(',')[0] || '',
    city: parsed.city || null,
    lat: lat ?? result.geometry?.location?.lat,
    lng: lng ?? result.geometry?.location?.lng,
    source: 'google',
  };
}

/** Places Autocomplete (legacy REST) */
async function placesAutocomplete(input, { city, lat, lng } = {}) {
  const key = getApiKey();
  if (!key || !input?.trim()) return [];

  const params = new URLSearchParams({
    input: city ? `${input.trim()}, ${city}, India` : `${input.trim()}, India`,
    key,
    components: 'country:in',
    language: 'en',
  });
  if (lat != null && lng != null) {
    params.set('location', `${lat},${lng}`);
    params.set('radius', '50000');
  }

  const data = await googleFetch(`${BASE}/place/autocomplete/json?${params}`);
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status || 'Places autocomplete failed');
  }

  return (data.predictions || []).map((p) => ({
    label: p.description,
    place_id: p.place_id,
    home_address: p.description,
    route_from: p.structured_formatting?.main_text || p.description,
    route_to: p.structured_formatting?.main_text || p.description,
    city: null,
    lat: null,
    lng: null,
    source: 'google',
  }));
}

/** Place Details — resolve place_id to coordinates */
async function placeDetails(placeId) {
  const key = getApiKey();
  if (!key || !placeId) return null;

  const params = new URLSearchParams({
    place_id: placeId,
    key,
    fields: 'formatted_address,geometry,address_components,name',
  });
  const data = await googleFetch(`${BASE}/place/details/json?${params}`);
  if (data.status !== 'OK' || !data.result) return null;

  const { lat, lng } = data.result.geometry?.location || {};
  return toSearchResult(data.result, lat, lng);
}

/** Text search fallback for place search */
async function placesTextSearch(query, { city } = {}) {
  const key = getApiKey();
  if (!key) return [];

  const q = city ? `${query}, ${city}, India` : `${query}, India`;
  const params = new URLSearchParams({ query: q, key, region: 'in' });
  const data = await googleFetch(`${BASE}/place/textsearch/json?${params}`);
  if (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') {
    throw new Error(data.error_message || data.status);
  }

  return (data.results || []).slice(0, 6).map((r) => {
    const lat = r.geometry?.location?.lat;
    const lng = r.geometry?.location?.lng;
    return toSearchResult(r, lat, lng);
  });
}

/** Geocoding — forward geocode */
async function geocodeAddress(address) {
  const key = getApiKey();
  if (!key || !address?.trim()) return null;

  const params = new URLSearchParams({
    address: address.trim(),
    key,
    region: 'in',
  });
  const data = await googleFetch(`${BASE}/geocode/json?${params}`);
  if (data.status !== 'OK' || !data.results?.[0]) return null;

  const r = data.results[0];
  const lat = r.geometry?.location?.lat;
  const lng = r.geometry?.location?.lng;
  return toSearchResult(r, lat, lng);
}

/** Reverse geocode */
async function reverseGeocode(lat, lng) {
  const key = getApiKey();
  if (!key) return null;

  const params = new URLSearchParams({
    latlng: `${lat},${lng}`,
    key,
    region: 'in',
  });
  const data = await googleFetch(`${BASE}/geocode/json?${params}`);
  if (data.status !== 'OK' || !data.results?.[0]) return null;

  return toSearchResult(data.results[0], lat, lng);
}

/** Combined place search: autocomplete + details enrichment */
async function searchPlaces(query, options = {}) {
  const trimmed = (query || '').trim();
  if (!trimmed) return [];

  try {
    const suggestions = await placesAutocomplete(trimmed, options);
    const enriched = await Promise.all(
      suggestions.slice(0, 6).map(async (s) => {
        if (s.place_id && (s.lat == null || s.lng == null)) {
          const details = await placeDetails(s.place_id);
          if (details) return { ...s, ...details, label: s.label || details.label };
        }
        return s;
      }),
    );
    const withCoords = enriched.filter((r) => r.lat != null && r.lng != null);
    if (withCoords.length) return withCoords;
  } catch (err) {
    console.warn('[GoogleMaps] autocomplete failed:', err.message);
  }

  try {
    return await placesTextSearch(trimmed, options);
  } catch (err) {
    console.warn('[GoogleMaps] text search failed:', err.message);
    return [];
  }
}

function decodeGooglePolyline(encoded) {
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
    points.push([lng / 1e5, lat / 1e5]);
  }
  return points;
}

/**
 * Directions API — waypoints as [{lat,lng}] in order (source → stops → dest)
 */
async function fetchDirections(waypoints, { avoidTolls = false, alternatives = true } = {}) {
  const key = getApiKey();
  if (!key || waypoints.length < 2) return [];

  const origin = `${waypoints[0].lat},${waypoints[0].lng}`;
  const destination = `${waypoints[waypoints.length - 1].lat},${waypoints[waypoints.length - 1].lng}`;
  const middle = waypoints.slice(1, -1);
  const params = new URLSearchParams({
    origin,
    destination,
    key,
    region: 'in',
    mode: 'driving',
    alternatives: alternatives ? 'true' : 'false',
  });
  if (middle.length) {
    params.set('waypoints', middle.map((w) => `${w.lat},${w.lng}`).join('|'));
  }
  if (avoidTolls) {
    params.set('avoid', 'tolls');
  }

  const data = await googleFetch(`${BASE}/directions/json?${params}`);
  if (data.status !== 'OK' || !data.routes?.length) {
    throw new Error(data.error_message || data.status || 'Directions failed');
  }

  return data.routes.map((route, index) => {
    const leg = route.legs?.[0];
    const totalDistance = route.legs?.reduce((s, l) => s + (l.distance?.value || 0), 0) || leg?.distance?.value || 0;
    const totalDuration = route.legs?.reduce((s, l) => s + (l.duration?.value || 0), 0) || leg?.duration?.value || 0;
    const coordinates = decodeGooglePolyline(route.overview_polyline?.points || '');
    const road = leg?.steps?.[0]?.html_instructions?.replace(/<[^>]+>/g, '') || 'Main road';

    return {
      index,
      coordinates,
      distance_m: Math.round(totalDistance),
      duration_s: Math.round(totalDuration),
      road,
      hasTolls: !avoidTolls,
      avoidTolls,
      encoded_polyline: route.overview_polyline?.points || '',
      provider: 'google',
    };
  }).filter((r) => r.coordinates.length >= 2);
}

/** Distance Matrix — ETA between origin and destination */
async function distanceMatrix(origins, destinations) {
  const key = getApiKey();
  if (!key || !origins?.length || !destinations?.length) return null;

  const params = new URLSearchParams({
    origins: origins.map((o) => `${o.lat},${o.lng}`).join('|'),
    destinations: destinations.map((d) => `${d.lat},${d.lng}`).join('|'),
    key,
    mode: 'driving',
    region: 'in',
  });

  const data = await googleFetch(`${BASE}/distancematrix/json?${params}`);
  if (data.status !== 'OK') {
    throw new Error(data.error_message || data.status);
  }

  const rows = data.rows || [];
  return rows.map((row, i) => (row.elements || []).map((el, j) => ({
    origin_index: i,
    destination_index: j,
    distance_m: el.distance?.value ?? null,
    duration_s: el.duration?.value ?? null,
    status: el.status,
  })));
}

function getBrowserKey() {
  return (
    process.env.GOOGLE_MAPS_BROWSER_KEY
    || process.env.GOOGLE_MAPS_JS_API_KEY
    || ''
  ).trim();
}

function getPublicConfig() {
  const browserKey = getBrowserKey();
  return {
    provider: preferGoogle() ? 'google' : 'fallback',
    google_enabled: isGoogleMapsEnabled(),
    google_preferred: preferGoogle(),
    maps_js_api_key: browserKey || null,
    features: {
      places: isGoogleMapsEnabled(),
      directions: isGoogleMapsEnabled(),
      distance_matrix: isGoogleMapsEnabled(),
      geocoding: isGoogleMapsEnabled(),
    },
  };
}

module.exports = {
  isGoogleMapsEnabled,
  preferGoogle,
  getPublicConfig,
  searchPlaces: searchPlaces,
  googleSearchPlaces: searchPlaces,
  placesAutocomplete,
  placeDetails,
  geocodeAddress,
  reverseGeocode,
  fetchDirections,
  distanceMatrix,
  decodeGooglePolyline,
};
