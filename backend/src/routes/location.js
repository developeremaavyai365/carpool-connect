const { body, query, validationResult } = require('express-validator');
const { resolveCoordinates, searchPlaces, INDIAN_CITIES } = require('../utils/geocode');
const { countNearby, listActive, setLocation } = require('../services/liveLocations');
const { authenticate } = require('../middleware/auth');
const { asyncHandler } = require('../utils/asyncRoute');
const db = require('../database');

const router = require('express').Router();

router.get('/cities', (_req, res) => {
  res.json({ cities: INDIAN_CITIES });
});

router.get('/maps-config', (_req, res) => {
  const googleMaps = require('../services/googleMaps');
  res.json({
    ...googleMaps.getPublicConfig(),
    maps_js_enabled: Boolean(process.env.GOOGLE_MAPS_JS_ENABLED !== 'false'),
  });
});

router.get('/autocomplete', [
  query('q').trim().isLength({ min: 2 }),
  query('city').optional().trim(),
  query('lat').optional().isFloat(),
  query('lng').optional().isFloat(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const googleMaps = require('../services/googleMaps');
    const lat = req.query.lat != null ? parseFloat(req.query.lat) : null;
    const lng = req.query.lng != null ? parseFloat(req.query.lng) : null;
    let results = [];
    if (googleMaps.preferGoogle()) {
      results = await googleMaps.searchPlaces(req.query.q, {
        city: req.query.city,
        lat,
        lng,
      });
    }
    if (!results.length) {
      results = await searchPlaces(req.query.q, { city: req.query.city });
    }
    res.json({ results, provider: results[0]?.source || 'fallback' });
  } catch (err) {
    console.error('[location/autocomplete]', err.message);
    res.status(502).json({ error: 'Place search unavailable' });
  }
});

router.post('/distance', [
  body('origins').isArray({ min: 1 }),
  body('destinations').isArray({ min: 1 }),
  body('origins.*.lat').isFloat(),
  body('origins.*.lng').isFloat(),
  body('destinations.*.lat').isFloat(),
  body('destinations.*.lng').isFloat(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const googleMaps = require('../services/googleMaps');
    if (!googleMaps.isGoogleMapsEnabled()) {
      return res.status(503).json({ error: 'Distance Matrix requires Google Maps API key' });
    }
    const matrix = await googleMaps.distanceMatrix(req.body.origins, req.body.destinations);
    res.json({ matrix, provider: 'google' });
  } catch (err) {
    console.error('[location/distance]', err.message);
    res.status(502).json({ error: err.message || 'Distance calculation failed' });
  }
});

router.get('/reverse', [
  query('lat').isFloat({ min: -90, max: 90 }),
  query('lng').isFloat({ min: -180, max: 180 }),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { lat, lng } = req.query;
    const location = await resolveCoordinates(parseFloat(lat), parseFloat(lng));
    res.json({ location });
  } catch (err) {
    console.error('[location/reverse]', err.message);
    res.status(502).json({ error: 'Could not resolve your location. Enter it manually.' });
  }
});

router.get('/search', [
  query('q').trim().isLength({ min: 2 }),
  query('city').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const results = await searchPlaces(req.query.q, { city: req.query.city });
    res.json({ results });
  } catch {
    res.status(502).json({ error: 'Location search unavailable' });
  }
});

router.get('/nearby', [
  query('lat').optional().isFloat({ min: -90, max: 90 }),
  query('lng').optional().isFloat({ min: -180, max: 180 }),
  query('city').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const lat = req.query.lat != null ? parseFloat(req.query.lat) : null;
  const lng = req.query.lng != null ? parseFloat(req.query.lng) : null;
  const city = req.query.city || null;

  const active = await listActive({ city });
  const nearbyCount = await countNearby({ lat, lng, city, radiusKm: 15 });

  res.json({
    nearbyCount,
    activeCount: active.length,
    colleagues: active.slice(0, 20).map(({ userId, name, city: c, route_from, updatedAt }) => ({
      userId, name, city: c, route_from, updatedAt,
    })),
  });
}));

router.post('/update', authenticate, [
  body('lat').isFloat({ min: -90, max: 90 }),
  body('lng').isFloat({ min: -180, max: 180 }),
  body('accuracy').optional().isFloat({ min: 0 }),
  body('city').optional().trim(),
  body('route_from').optional().trim(),
  body('name').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const employee = await db.findEmployeeById(req.user.id);
  if (!employee) {
    return res.status(404).json({ error: 'Account not found' });
  }

  const { lat, lng, accuracy, city, route_from, name } = req.body;
  const resolvedCity = city || employee.city || null;

  await setLocation(req.user.id, {
    lat,
    lng,
    accuracy,
    city: resolvedCity,
    route_from: route_from || employee.route_from,
    name: name || employee.name,
  });

  const nearbyCount = await countNearby({
    lat,
    lng,
    city: resolvedCity,
    radiusKm: 15,
    excludeUserId: req.user.id,
  });

  const colleagues = (await listActive({ city: resolvedCity, excludeUserId: req.user.id }))
    .slice(0, 20)
    .map(({ userId, name: n, lat: la, lng: ln, route_from: rf, accuracy: acc, updatedAt }) => ({
      userId, name: n, lat: la, lng: ln, route_from: rf, accuracy: acc, updatedAt,
    }));

  res.json({ ok: true, nearbyCount, city: resolvedCity, colleagues });
}));

module.exports = router;
