const { body, query, validationResult } = require('express-validator');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const {
  parseDateInput,
  parseDepartureAt,
  isDepartureInFuture,
  resolveCommuteCity,
  normalizeTimeInput,
} = require('../utils/commuteDates');
const { getRouteOptions } = require('../utils/directions');
const { asyncHandler } = require('../utils/asyncRoute');

const { publishRideCreated } = require('../services/rideRealtime');
const { searchPlaces } = require('../utils/geocode');
const { syncGeospatialTripFromCommute, updateGeospatialTripFromCommute, cancelGeospatialTripForCommute } = require('../modules/rides');

const router = require('express').Router();

const SMOKING = ['not_allowed', 'allowed', 'occasionally'];
const MUSIC = ['any', 'quiet', 'background', 'no_music'];
const PETS = ['not_allowed', 'allowed'];

function validationError(res, errors) {
  const first = errors.array()[0];
  const message = first?.msg || 'Invalid request';
  return res.status(400).json({
    error: message,
    errors: errors.array(),
  });
}

function buildDeparture(body) {
  const dateStr = parseDateInput(body.departure_date);
  const timeStr = normalizeTimeInput(body.departure_time) || body.departure_time;
  const departure_at = parseDepartureAt(dateStr, timeStr);
  if (!dateStr || !departure_at) {
    return { error: 'Invalid departure date or time. Use YYYY-MM-DD and HH:mm.' };
  }
  if (!isDepartureInFuture(departure_at)) {
    return { error: 'Departure must be at least 1 minute from now. Pick a later time or date.' };
  }
  return { dateStr, departure_at };
}

router.get('/routes', [
  query('route_from').trim().isLength({ min: 2, max: 200 }),
  query('route_to').trim().isLength({ min: 2, max: 200 }),
  query('stopovers').optional(),
  query('city').optional().trim(),
  query('departure_at').optional().trim(),
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors);

  try {
    const { route_from, route_to, city, departure_at } = req.query;
    let stopovers = [];
    if (req.query.stopovers) {
      try {
        stopovers = JSON.parse(req.query.stopovers);
      } catch {
        stopovers = String(req.query.stopovers).split('|').map((s) => s.trim()).filter(Boolean);
      }
    }
    const result = await getRouteOptions(route_from, route_to, { stopovers, city, departure_at });
    if (result.error && !result.routes?.length) {
      return res.status(result.retryable ? 502 : 400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('getRouteOptions failed:', err);
    res.status(502).json({ error: 'Could not load route options. Try again.', retryable: true });
  }
});

router.post('/routes/calculate', [
  body('route_from').trim().isLength({ min: 2, max: 200 }),
  body('route_to').trim().isLength({ min: 2, max: 200 }),
  body('stopovers').optional().isArray(),
  body('city').optional().trim(),
  body('departure_at').optional().trim(),
  body('source_lat').optional().isFloat(),
  body('source_lng').optional().isFloat(),
  body('dest_lat').optional().isFloat(),
  body('dest_lng').optional().isFloat(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors);

  const { route_from, route_to, stopovers, city, departure_at } = req.body;
  const result = await getRouteOptions(route_from, route_to, { stopovers, city, departure_at });
  if (result.error && !result.routes?.length) {
    return res.status(result.retryable ? 502 : 400).json(result);
  }
  res.json(result);
}));

router.use(authenticate);

router.get('/search', [
  query('city').optional().trim(),
  query('route_from').optional().trim(),
  query('route_to').optional().trim(),
  query('date').optional().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors);

  const { city, route_from, route_to, date } = req.query;

  const commutes = await db.searchCommutes({
    excludeDriverId: req.user.id,
    city,
    route_from,
    route_to,
    date: date || undefined,
  });

  res.json({ commutes, total: commutes.length });
}));

router.get('/mine', asyncHandler(async (req, res) => {
  const { bucketDriverCommutes, buildDriverStats } = require('../utils/driverCommuteStatus');

  if (typeof db.expireStaleDriverCommutes === 'function') {
    await db.expireStaleDriverCommutes(req.user.id);
  }

  const commutes = await db.listCommutesByDriver(req.user.id, { includeAll: true });
  const buckets = bucketDriverCommutes(commutes);
  const stats = buildDriverStats(buckets);

  let requestCounts = {};
  if (typeof db.countAcceptedRequestsByCommute === 'function') {
    requestCounts = await db.countAcceptedRequestsByCommute(commutes.map((c) => c.id));
  }

  const enriched = commutes.map((c) => ({
    ...c,
    accepted_passengers: requestCounts[c.id] || 0,
    seats_booked: requestCounts[c.id] || 0,
  }));

  const enrichBucket = (list) => list.map((c) => ({
    ...c,
    accepted_passengers: requestCounts[c.id] || 0,
    seats_booked: requestCounts[c.id] || 0,
  }));

  res.json({
    commutes: enriched,
    total: enriched.length,
    buckets: {
      upcoming: enrichBucket(buckets.upcoming),
      active: enrichBucket(buckets.active),
      completed: enrichBucket(buckets.completed),
      cancelled: enrichBucket(buckets.cancelled),
    },
    stats,
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid commute ID' });

  const commute = await db.findCommuteById(id);
  if (!commute) return res.status(404).json({ error: 'Commute not found' });
  if (commute.status === 'cancelled' && commute.driver_id !== req.user.id) {
    return res.status(404).json({ error: 'Commute not found' });
  }

  res.json({ commute });
}));

router.post('/', [
  body('route_from').trim().isLength({ min: 2, max: 200 }),
  body('route_to').trim().isLength({ min: 2, max: 200 }),
  body('city').optional({ values: 'falsy' }).trim(),
  body('departure_date').notEmpty().withMessage('Departure date is required'),
  body('departure_time').custom((value) => {
    if (!normalizeTimeInput(value)) throw new Error('Valid departure time required (HH:mm)');
    return true;
  }),
  body('seats_available').isInt({ min: 1, max: 6 }).toInt(),
  body('price_per_seat').isFloat({ min: 0, max: 10000 }).toFloat(),
  body('notes').optional().trim().isLength({ max: 1000 }),
  body('stopovers').optional().customSanitizer((val) => {
    if (!Array.isArray(val)) return [];
    return val.map((s) => String(s).trim()).filter((s) => s.length >= 2 && s.length <= 80);
  }),
  body('stopovers.*').optional().trim().isLength({ min: 2, max: 80 }),
  body('route_label').optional().trim().isLength({ max: 120 }),
  body('route_detail').optional().trim().isLength({ max: 200 }),
  body('smoking').optional().isIn(SMOKING),
  body('music').optional().isIn(MUSIC),
  body('pets').optional().isIn(PETS),
  body('source_lat').optional().isFloat({ min: -90, max: 90 }).toFloat(),
  body('source_lng').optional().isFloat({ min: -180, max: 180 }).toFloat(),
  body('dest_lat').optional().isFloat({ min: -90, max: 90 }).toFloat(),
  body('dest_lng').optional().isFloat({ min: -180, max: 180 }).toFloat(),
  body('route_polyline').optional().trim(),
  body('route_distance_m').optional().isInt({ min: 0 }).toInt(),
  body('route_duration_s').optional().isInt({ min: 0 }).toInt(),
  body('route_type').optional().trim().isLength({ max: 40 }),
  body('stopover_coords').optional().isArray(),
  body('toll_info').optional().isObject(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors);

  const {
    route_from, route_to, city, departure_date, departure_time,
    seats_available, price_per_seat, notes, stopovers, route_label, route_detail,
    smoking, music, pets,
  } = req.body;

  const departure = buildDeparture({ departure_date, departure_time });
  if (departure.error) {
    return res.status(400).json({ error: departure.error });
  }

  const driver = await db.findEmployeeById(req.user.id);
  if (!driver) return res.status(404).json({ error: 'Account not found' });

  const resolvedCity = resolveCommuteCity(city, driver.city);

  try {
    const commute = await db.createCommute({
      driver_id: req.user.id,
      route_from: route_from.trim(),
      route_to: route_to.trim(),
      city: resolvedCity,
      departure_at: departure.departure_at,
      seats_available,
      price_per_seat: price_per_seat ?? 0,
      notes: notes || '',
      stopovers: stopovers || [],
      route_label: route_label || '',
      route_detail: route_detail || '',
      source_lat: req.body.source_lat ?? null,
      source_lng: req.body.source_lng ?? null,
      dest_lat: req.body.dest_lat ?? null,
      dest_lng: req.body.dest_lng ?? null,
      stopover_coords: req.body.stopover_coords || [],
      route_polyline: req.body.route_polyline || null,
      route_distance_m: req.body.route_distance_m ?? null,
      route_duration_s: req.body.route_duration_s ?? null,
      route_type: req.body.route_type || '',
      toll_info: req.body.toll_info || {},
      smoking: smoking || 'not_allowed',
      music: music || 'any',
      pets: pets || 'not_allowed',
    });

    try {
      await db.updateEmployee(req.user.id, {
        route_from: route_from.trim(),
        route_to: route_to.trim(),
        availability: 'available',
        city: resolvedCity,
      });
    } catch (profileErr) {
      console.warn('Commute published but profile sync failed:', profileErr.message);
    }

    await publishRideCreated(commute, { app: req.app });

    let coords = null;
    let storedRoute = null;
    if (req.body.source_lat != null && req.body.dest_lat != null) {
      coords = {
        source_lat: req.body.source_lat,
        source_lng: req.body.source_lng,
        dest_lat: req.body.dest_lat,
        dest_lng: req.body.dest_lng,
      };
    } else {
      try {
        const [fromResults, toResults] = await Promise.all([
          searchPlaces(route_from.trim(), { city: resolvedCity }),
          searchPlaces(route_to.trim(), { city: resolvedCity }),
        ]);
        const fromHit = fromResults?.[0];
        const toHit = toResults?.[0];
        if (fromHit?.lat != null && toHit?.lat != null) {
          coords = {
            source_lat: fromHit.lat,
            source_lng: fromHit.lng,
            dest_lat: toHit.lat,
            dest_lng: toHit.lng,
          };
        }
      } catch (geoErr) {
        console.warn('Geocode for PostGIS sync skipped:', geoErr.message);
      }
    }

    if (commute.route_polyline && commute.route_distance_m && commute.route_duration_s) {
      const { lineWktFromEncodedPolyline } = require('../services/routeEngine');
      storedRoute = {
        polyline: commute.route_polyline,
        distance_m: commute.route_distance_m,
        duration_s: commute.route_duration_s,
        lineWkt: lineWktFromEncodedPolyline(commute.route_polyline),
      };
    }

    await syncGeospatialTripFromCommute(req.user.id, commute, coords, storedRoute);

    return res.status(201).json({ commute });
  } catch (err) {
    console.error('createCommute failed:', err);
    return res.status(500).json({ error: 'Could not save commute. Please try again.' });
  }
}));

router.put('/:id', [
  body('route_from').optional().trim().isLength({ min: 2, max: 200 }),
  body('route_to').optional().trim().isLength({ min: 2, max: 200 }),
  body('city').optional({ values: 'falsy' }).trim(),
  body('departure_date').optional().notEmpty(),
  body('departure_time').optional().custom((value) => {
    if (value == null || value === '') return true;
    if (!normalizeTimeInput(value)) throw new Error('Valid departure time required (HH:mm)');
    return true;
  }),
  body('seats_available').optional().isInt({ min: 1, max: 6 }).toInt(),
  body('price_per_seat').optional().isFloat({ min: 0, max: 10000 }).toFloat(),
  body('notes').optional().trim().isLength({ max: 1000 }),
  body('stopovers').optional().customSanitizer((val) => {
    if (!Array.isArray(val)) return [];
    return val.map((s) => String(s).trim()).filter((s) => s.length >= 2 && s.length <= 80);
  }),
  body('stopovers.*').optional().trim().isLength({ min: 2, max: 80 }),
  body('route_label').optional().trim().isLength({ max: 120 }),
  body('route_detail').optional().trim().isLength({ max: 200 }),
  body('smoking').optional().isIn(SMOKING),
  body('music').optional().isIn(MUSIC),
  body('pets').optional().isIn(PETS),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return validationError(res, errors);

  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(404).json({ error: 'Invalid commute ID' });

  const existing = await db.findCommuteById(id);
  if (!existing) return res.status(404).json({ error: 'Commute not found' });
  if (existing.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only edit your own commutes' });
  }
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'Cancelled commutes cannot be edited' });
  }

  const {
    route_from, route_to, city, departure_date, departure_time,
    seats_available, price_per_seat, notes, stopovers, route_label, route_detail,
    smoking, music, pets,
  } = req.body;

  const updates = {};
  if (route_from != null) updates.route_from = route_from.trim();
  if (route_to != null) updates.route_to = route_to.trim();
  if (city != null) updates.city = resolveCommuteCity(city, existing.city);
  if (seats_available != null) updates.seats_available = seats_available;
  if (price_per_seat != null) updates.price_per_seat = price_per_seat;
  if (notes != null) updates.notes = notes;
  if (stopovers != null) updates.stopovers = stopovers;
  if (route_label != null) updates.route_label = route_label;
  if (route_detail != null) updates.route_detail = route_detail;
  if (smoking != null) updates.smoking = smoking;
  if (music != null) updates.music = music;
  if (pets != null) updates.pets = pets;

  if (departure_date && departure_time) {
    const departure = buildDeparture({ departure_date, departure_time });
    if (departure.error) {
      return res.status(400).json({ error: departure.error });
    }
    updates.departure_at = departure.departure_at;
  }

  try {
    const commute = await db.updateCommute(id, updates);

    let coords = null;
    if (req.body.source_lat != null && req.body.dest_lat != null) {
      coords = {
        source_lat: req.body.source_lat,
        source_lng: req.body.source_lng,
        dest_lat: req.body.dest_lat,
        dest_lng: req.body.dest_lng,
      };
    } else {
      const fromLabel = commute.route_from || existing.route_from;
      const toLabel = commute.route_to || existing.route_to;
      try {
        const [fromResults, toResults] = await Promise.all([
          searchPlaces(fromLabel, { city: commute.city }),
          searchPlaces(toLabel, { city: commute.city }),
        ]);
        const fromHit = fromResults?.[0];
        const toHit = toResults?.[0];
        if (fromHit?.lat != null && toHit?.lat != null) {
          coords = {
            source_lat: fromHit.lat,
            source_lng: fromHit.lng,
            dest_lat: toHit.lat,
            dest_lng: toHit.lng,
          };
        }
      } catch { /* skip */ }
    }
    await updateGeospatialTripFromCommute(req.user.id, commute, coords);

    return res.json({ commute });
  } catch (err) {
    console.error('updateCommute failed:', err);
    return res.status(500).json({ error: 'Could not update commute. Please try again.' });
  }
}));

router.patch('/:id/complete', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid commute ID' });

  const existing = await db.findCommuteById(id);
  if (!existing) return res.status(404).json({ error: 'Commute not found' });
  if (existing.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only update your own commutes' });
  }
  if (existing.status === 'cancelled') {
    return res.status(400).json({ error: 'Cancelled commutes cannot be marked completed' });
  }

  const commute = await db.updateCommute(id, { status: 'completed' });
  await cancelGeospatialTripForCommute(id, req.user.id);
  return res.json({ commute });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid commute ID' });

  const existing = await db.findCommuteById(id);
  if (!existing) return res.status(404).json({ error: 'Commute not found' });
  if (existing.driver_id !== req.user.id) {
    return res.status(403).json({ error: 'You can only delete your own commutes' });
  }

  const commute = await db.deleteCommute(id);
  await cancelGeospatialTripForCommute(id, req.user.id);
  res.json({ commute, message: 'Commute removed' });
}));

module.exports = router;
