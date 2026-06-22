const INDIAN_CITIES = [
  'Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Chennai',
  'Kolkata', 'Pune', 'Ahmedabad', 'Jaipur', 'Lucknow',
  'Chandigarh', 'Kochi', 'Indore', 'Nagpur', 'Gurgaon',
  'Noida', 'Thane', 'Visakhapatnam', 'Bhopal', 'Coimbatore',
];

const CITY_ALIASES = {
  bengaluru: 'Bangalore',
  bangalore: 'Bangalore',
  bombay: 'Mumbai',
  madras: 'Chennai',
  calcutta: 'Kolkata',
  gurugram: 'Gurgaon',
  gurgaon: 'Gurgaon',
  newdelhi: 'Delhi',
  delhi: 'Delhi',
  vizag: 'Visakhapatnam',
  visakhapatnam: 'Visakhapatnam',
};

const REVERSE_CACHE_TTL_MS = 10 * 60 * 1000;
const NOMINATIM_MIN_INTERVAL_MS = 1100;
const FETCH_TIMEOUT_MS = 15000;

const reverseCache = new Map();
let nominatimLastCall = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function reverseCacheKey(lat, lng) {
  return `${Number(lat).toFixed(4)},${Number(lng).toFixed(4)}`;
}

function readReverseCache(lat, lng) {
  const key = reverseCacheKey(lat, lng);
  const hit = reverseCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > REVERSE_CACHE_TTL_MS) {
    reverseCache.delete(key);
    return null;
  }
  return hit.location;
}

function writeReverseCache(lat, lng, location) {
  reverseCache.set(reverseCacheKey(lat, lng), { at: Date.now(), location });
  if (reverseCache.size > 500) {
    const oldest = reverseCache.keys().next().value;
    reverseCache.delete(oldest);
  }
}

async function fetchWithTimeout(url, options = {}, ms = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function matchCity(name) {
  if (!name) return null;
  const key = name.toLowerCase().replace(/\s+/g, '');
  if (CITY_ALIASES[key]) return CITY_ALIASES[key];
  const found = INDIAN_CITIES.find(
    (c) => c.toLowerCase() === name.toLowerCase() || key.includes(c.toLowerCase()),
  );
  return found || null;
}

function parseNominatimResult(data) {
  const addr = data.address || {};
  const cityRaw = addr.city || addr.town || addr.village || addr.state_district || addr.county || '';
  const city = matchCity(cityRaw) || matchCity(addr.state) || null;
  const area = addr.suburb || addr.neighbourhood || addr.quarter || addr.road || addr.residential || '';
  const locality = [area, addr.city_district || addr.district].filter(Boolean).join(', ');
  const home_address = locality || data.display_name?.split(',').slice(0, 2).join(', ') || '';
  const route_from = area || cityRaw || home_address.split(',')[0] || '';

  return {
    home_address: home_address.trim(),
    route_from: route_from.trim(),
    city,
    full_address: data.display_name || home_address,
    lat: parseFloat(data.lat),
    lng: parseFloat(data.lon),
  };
}

function parsePhotonFeature(feature, lat, lng) {
  const props = feature.properties || {};
  const cityRaw = props.city || props.district || props.county || props.state || '';
  const city = matchCity(cityRaw) || matchCity(props.state);
  const area = props.name || props.street || props.suburb || props.district || '';
  const parts = [
    props.housenumber,
    props.street,
    props.suburb || props.district,
    props.city,
    props.state,
  ].filter(Boolean);
  const full_address = parts.join(', ') || [area, cityRaw, props.country].filter(Boolean).join(', ');
  const home_address = parts.slice(0, 2).join(', ') || area || cityRaw;
  const route_from = props.street || props.name || area || cityRaw || home_address.split(',')[0] || '';

  return {
    home_address: (home_address || '').trim(),
    route_from: (route_from || '').trim(),
    city,
    full_address: full_address || home_address,
    lat: lat ?? feature.geometry?.coordinates?.[1],
    lng: lng ?? feature.geometry?.coordinates?.[0],
  };
}

function photonFeatureScore(feature) {
  const p = feature.properties || {};
  return (p.housenumber ? 4 : 0) + (p.street ? 3 : 0) + (p.suburb ? 2 : 0) + (p.name ? 1 : 0);
}

function mapSearchResults(items) {
  return items.map((item) => {
    const parsed = parseNominatimResult(item);
    return {
      label: item.display_name,
      home_address: parsed.home_address,
      route_from: parsed.route_from,
      route_to: parsed.route_from,
      city: parsed.city,
      lat: parsed.lat,
      lng: parsed.lng,
    };
  });
}

function locationIQBaseUrl() {
  return process.env.LOCATIONIQ_BASE_URL || 'https://us1.locationiq.com/v1';
}

async function locationIQFetch(path, apiKey) {
  const separator = path.includes('?') ? '&' : '?';
  const url = `${locationIQBaseUrl()}${path}${separator}key=${encodeURIComponent(apiKey)}&format=json&addressdetails=1`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error('LocationIQ lookup failed');
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

async function locationIQReverseGeocode(lat, lng, apiKey) {
  const data = await locationIQFetch(`/reverse?lat=${lat}&lon=${lng}&zoom=16`, apiKey);
  return parseNominatimResult(data);
}

async function locationIQSearchPlaces(query, { city }, apiKey) {
  const q = city ? `${query}, ${city}, India` : `${query}, India`;
  const data = await locationIQFetch(
    `/search?q=${encodeURIComponent(q)}&countrycodes=in&limit=6`,
    apiKey,
  );
  return mapSearchResults(Array.isArray(data) ? data : []);
}

async function nominatimFetch(path) {
  const now = Date.now();
  const wait = nominatimLastCall + NOMINATIM_MIN_INTERVAL_MS - now;
  if (wait > 0) await sleep(wait);
  nominatimLastCall = Date.now();

  const res = await fetchWithTimeout(`https://nominatim.openstreetmap.org${path}`, {
    headers: { 'User-Agent': 'CarPoolConnect/1.0 (carpool app; contact: support@carpoolconnect.local)' },
  });
  if (!res.ok) throw new Error(`Location lookup failed (${res.status})`);
  const data = await res.json();
  if (data?.error) throw new Error(data.error);
  return data;
}

async function reverseGeocode(lat, lng) {
  const data = await nominatimFetch(
    `/reverse?lat=${lat}&lon=${lng}&format=json&addressdetails=1&zoom=16`,
  );
  return parseNominatimResult(data);
}

async function photonReverseGeocode(lat, lng) {
  const url = `https://photon.komoot.io/reverse?lat=${lat}&lon=${lng}&lang=en`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Photon lookup failed (${res.status})`);
  const data = await res.json();
  const features = data.features || [];
  if (!features.length) throw new Error('No address for this point');

  const best = [...features].sort((a, b) => photonFeatureScore(b) - photonFeatureScore(a))[0];
  return parsePhotonFeature(best, lat, lng);
}

async function photonSearchPlaces(query, { city } = {}) {
  const q = city ? `${query} ${city} India` : `${query} India`;
  const url = `https://photon.komoot.io/api?q=${encodeURIComponent(q)}&limit=6&lang=en`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error(`Photon search failed (${res.status})`);
  const data = await res.json();
  const features = data.features || [];
  return features.map((feature) => {
    const parsed = parsePhotonFeature(feature);
    const label = parsed.full_address || parsed.home_address || parsed.route_from;
    return {
      label,
      home_address: parsed.home_address,
      route_from: parsed.route_from,
      route_to: parsed.route_from,
      city: parsed.city,
      lat: parsed.lat,
      lng: parsed.lng,
    };
  }).filter((item) => item.label);
}

async function searchPlaces(query, { city } = {}) {
  const googleMaps = require('../services/googleMaps');
  if (googleMaps.preferGoogle()) {
    try {
      const results = await googleMaps.searchPlaces(query, { city });
      if (results.length) return results;
    } catch (err) {
      console.warn('[geocode] Google Places failed:', err.message);
    }
  }

  const locationIQKey = process.env.LOCATIONIQ_API_KEY;
  if (locationIQKey) {
    try {
      const results = await locationIQSearchPlaces(query, { city }, locationIQKey);
      if (results.length) return results;
    } catch {
      /* fall through */
    }
  }

  try {
    const q = city ? `${query}, ${city}, India` : `${query}, India`;
    const results = await nominatimFetch(
      `/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=6&countrycodes=in`,
    );
    const mapped = mapSearchResults(Array.isArray(results) ? results : []);
    if (mapped.length) return mapped;
  } catch {
    /* fall through */
  }

  return photonSearchPlaces(query, { city });
}

async function googleReverseGeocode(lat, lng, apiKey) {
  const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${apiKey}&region=in`;
  const res = await fetchWithTimeout(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.results?.[0]) return null;

  const result = data.results[0];
  const components = result.address_components || [];
  const get = (type) => components.find((c) => c.types.includes(type))?.long_name;

  const cityRaw = get('locality') || get('administrative_area_level_2') || '';
  const city = matchCity(cityRaw);
  const area = get('sublocality') || get('neighborhood') || get('route') || '';
  const home_address = [area, cityRaw].filter(Boolean).join(', ') || result.formatted_address;

  return {
    home_address,
    route_from: area || cityRaw,
    city,
    full_address: result.formatted_address,
    lat,
    lng,
  };
}

async function tryReverseProvider(label, fn) {
  try {
    const result = await fn();
    if (result?.home_address || result?.route_from || result?.full_address) {
      return { ...result, source: result.source || label };
    }
  } catch (err) {
    console.warn(`[geocode] ${label} reverse failed:`, err.message);
  }
  return null;
}

async function resolveCoordinates(lat, lng) {
  const cached = readReverseCache(lat, lng);
  if (cached) return { ...cached, source: cached.source || 'cache' };

  const googleKey = process.env.GOOGLE_MAPS_API_KEY;
  const locationIQKey = process.env.LOCATIONIQ_API_KEY;
  const googleMaps = require('../services/googleMaps');

  if (googleMaps.preferGoogle() && googleKey) {
    const google = await tryReverseProvider('google', () => googleReverseGeocode(lat, lng, googleKey));
    if (google) {
      writeReverseCache(lat, lng, google);
      return google;
    }
  }

  if (locationIQKey) {
    const liq = await tryReverseProvider('locationiq', () => locationIQReverseGeocode(lat, lng, locationIQKey));
    if (liq) {
      writeReverseCache(lat, lng, liq);
      return liq;
    }
  }

  if (googleKey && !googleMaps.preferGoogle()) {
    const google = await tryReverseProvider('google', () => googleReverseGeocode(lat, lng, googleKey));
    if (google) {
      writeReverseCache(lat, lng, google);
      return google;
    }
  }

  const osm = await tryReverseProvider('nominatim', () => reverseGeocode(lat, lng));
  if (osm) {
    writeReverseCache(lat, lng, osm);
    return osm;
  }

  const photon = await tryReverseProvider('photon', () => photonReverseGeocode(lat, lng));
  if (photon) {
    writeReverseCache(lat, lng, photon);
    return photon;
  }

  throw new Error('All geocoding providers failed');
}

module.exports = {
  INDIAN_CITIES,
  matchCity,
  reverseGeocode,
  searchPlaces,
  resolveCoordinates,
  locationIQReverseGeocode,
  locationIQSearchPlaces,
  photonReverseGeocode,
};
