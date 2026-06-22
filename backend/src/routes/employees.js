const { body, query, validationResult } = require('express-validator');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { findMatches, sanitizeEmployee, INDIAN_CITIES, routeMatchScore } = require('../utils/routeMatcher');
const { computeProfileCompletion, verificationStatus } = require('../utils/profileUtils');

const { asyncHandler } = require('../utils/asyncRoute');

const router = require('express').Router();

router.get('/cities', (_req, res) => {
  res.json({ cities: INDIAN_CITIES });
});

router.use(authenticate);

router.get('/profile', asyncHandler(async (req, res) => {
  const employee = await db.findEmployeeById(req.user.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  const safe = sanitizeEmployee(employee);
  res.json({
    employee: safe,
    profileCompletion: computeProfileCompletion(employee),
    verification: verificationStatus(employee),
  });
}));

router.get('/profile/completion', asyncHandler(async (req, res) => {
  const employee = await db.findEmployeeById(req.user.id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  res.json({
    profileCompletion: computeProfileCompletion(employee),
    verification: verificationStatus(employee),
  });
}));

router.get('/recent-searches', asyncHandler(async (req, res) => {
  const searches = await db.getRecentSearches(req.user.id);
  res.json({ searches });
}));

router.post('/recent-searches', [
  body('route_from').trim().isLength({ min: 2 }),
  body('route_to').optional().trim(),
  body('city').optional().trim(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const employee = await db.addRecentSearch(req.user.id, req.body);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });
  res.json({ searches: employee.recent_searches || [] });
}));

router.put('/profile', [
  body('name').optional().trim().isLength({ min: 2, max: 100 }),
  body('phone').optional().matches(/^[6-9]\d{9}$/),
  body('home_address').optional().trim().custom((v) => v === '' || v.length >= 3)
    .withMessage('Home address must be at least 3 characters or empty'),
  body('office_address').optional().trim().custom((v) => v === '' || v.length >= 3)
    .withMessage('Office address must be at least 3 characters or empty'),
  body('route_from').optional().trim().custom((v) => v === '' || v.length >= 2),
  body('route_to').optional().trim().custom((v) => v === '' || v.length >= 2),
  body('city').optional().trim().isIn(INDIAN_CITIES),
  body('availability').optional().isIn(['available', 'limited', 'unavailable']),
  body('bio').optional().trim().isLength({ max: 500 }),
  body('travel_preferences').optional().trim().isLength({ max: 500 }),
  body('vehicle').optional({ nullable: true }).custom((v) => {
    if (v === null || v === '') return true;
    if (typeof v !== 'object') throw new Error('Vehicle must be an object');
    return true;
  }),
  body('email_notifications').optional().isBoolean().toBoolean(),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const fields = [
    'name', 'phone', 'home_address', 'office_address', 'route_from', 'route_to',
    'city', 'availability', 'bio', 'travel_preferences', 'vehicle', 'email_notifications',
  ];
  const updates = {};
  for (const field of fields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  if (updates.phone) {
    updates.phone = String(updates.phone).replace(/\D/g, '').slice(-10);
  }

  if (updates.vehicle && typeof updates.vehicle === 'object') {
    const v = updates.vehicle;
    if (!v.make?.trim?.() && !v.model?.trim?.()) {
      updates.vehicle = null;
    } else if (v.seats != null && v.seats !== '') {
      updates.vehicle = { ...v, seats: parseInt(String(v.seats), 10) || v.seats };
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  try {
    const employee = await db.updateEmployee(req.user.id, updates);
    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    const io = req.app.get('io');
    if (io) {
      const payload = { city: employee.city, route_from: employee.route_from };
      io.to(`user:${req.user.id}`).emit('recommendations:update', payload);
      if (employee?.city) {
        io.to(`city:${employee.city}`).emit('recommendations:update', payload);
      }
    }

    res.json({
      employee: sanitizeEmployee(employee),
      profileCompletion: computeProfileCompletion(employee),
      verification: verificationStatus(employee),
    });
  } catch (err) {
    if (err.code === 'PHONE_IN_USE') {
      return res.status(409).json({ error: 'This phone number is already used by another account' });
    }
    console.error('Profile update failed:', err.message);
    res.status(500).json({ error: 'Could not save profile. Please try again.' });
  }
}));

router.get('/search', [
  query('city').optional().trim(),
  query('route_from').optional().trim(),
  query('route_to').optional().trim(),
  query('availability').optional().isIn(['available', 'limited', 'unavailable', 'all']),
  query('match').optional().isIn(['true', 'false']),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const current = await db.findEmployeeById(req.user.id);
  if (!current) return res.status(404).json({ error: 'Employee not found' });

  const { city, route_from, route_to, availability, match } = req.query;

  const candidates = (await db.searchEmployees({
    excludeId: req.user.id,
    city,
    route_from,
    route_to,
    availability,
  })).map(sanitizeEmployee);

  if (match === 'true') {
    const matched = findMatches(current, candidates);
    return res.json({ employees: matched, total: matched.length });
  }

  res.json({ employees: candidates, total: candidates.length });
}));

router.get('/recommendations', [
  query('city').optional().trim(),
  query('route_from').optional().trim(),
  query('route_to').optional().trim(),
], asyncHandler(async (req, res) => {
  const current = await db.findEmployeeById(req.user.id);
  if (!current) return res.status(404).json({ error: 'Employee not found' });

  const city = req.query.city || current.city || '';
  const route_from = req.query.route_from || current.route_from || '';
  const route_to = req.query.route_to || current.route_to || '';

  const candidates = (await db.searchEmployees({
    excludeId: req.user.id,
    city: city || undefined,
    route_from: route_from || undefined,
    route_to: route_to || undefined,
    availability: 'all',
  }))
    .filter((e) => e.availability === 'available' || e.availability === 'limited')
    .map(sanitizeEmployee);

  const recommendations = findMatches(current, candidates, { minScore: 35, limit: 12 });

  res.json({
    recommendations,
    total: recommendations.length,
    area: { city, route_from, route_to },
  });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) return res.status(400).json({ error: 'Invalid employee ID' });

  const employee = await db.findEmployeeById(id);
  if (!employee) return res.status(404).json({ error: 'Employee not found' });

  const current = await db.findEmployeeById(req.user.id);
  const score = routeMatchScore(current, employee);

  res.json({
    employee: sanitizeEmployee(employee),
    matchScore: score,
  });
}));

module.exports = router;
