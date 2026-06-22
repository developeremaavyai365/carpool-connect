const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { isSupabaseConfigured } = require('../lib/supabase');
const {
  signInWithPassword, createAuthUser, updateAuthPassword,
} = require('../services/supabaseAuth');
const { sanitizeEmployee, INDIAN_CITIES } = require('../utils/routeMatcher');
const { normalizeEmail } = require('../utils/emailNormalize');
const { authenticate } = require('../middleware/auth');
const { sendOtp, verifyOtp } = require('../utils/otpService');
const { buildWelcomeEmail, buildPasswordResetSuccessEmail } = require('../utils/mailer');
const { deliverEmailNow } = require('../services/emailQueue');
const { computeProfileCompletion, verificationStatus } = require('../utils/profileUtils');
const { asyncHandler } = require('../utils/asyncRoute');

const router = require('express').Router();

const emailField = body('email')
  .trim()
  .isEmail()
  .withMessage('Valid email required')
  .customSanitizer(normalizeEmail);

function signToken(employee) {
  return jwt.sign(
    { id: employee.id, email: employee.email, role: employee.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

function buildAuthResponse(employee, supabaseSession = null) {
  const payload = { token: signToken(employee), employee: sanitizeEmployee(employee) };
  if (supabaseSession?.access_token) {
    payload.supabaseToken = supabaseSession.access_token;
  }
  return payload;
}

function verifyPassword(plain, hash) {
  if (!plain || !hash) return false;
  try {
    return bcrypt.compareSync(String(plain), hash);
  } catch {
    return false;
  }
}

async function issueSession(employee) {
  if (isSupabaseConfigured() && employee.auth_id) {
    return null;
  }
  return signToken(employee);
}

router.post('/otp/send', [
  body('channel').isIn(['email', 'phone']).withMessage('Channel must be email or phone'),
  body('identifier').notEmpty().withMessage('Email or phone required'),
  body('purpose').isIn(['login', 'register', 'reset']).withMessage('Invalid purpose'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { channel, identifier, purpose } = req.body;
  const normalizedId = channel === 'email' ? normalizeEmail(identifier) : identifier;

  if (channel === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedId)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (channel === 'phone' && !/^[6-9]\d{9}$/.test(normalizedId.replace(/\D/g, '').slice(-10))) {
    return res.status(400).json({ error: 'Valid 10-digit Indian mobile number required' });
  }

  if (purpose === 'register' && channel === 'email' && (await db.findEmployeeByEmail(normalizedId))) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  if (purpose === 'reset' && channel === 'email' && !(await db.findEmployeeByEmail(normalizedId))) {
    return res.status(404).json({ error: 'No account found with this email' });
  }

  try {
    const result = await sendOtp(channel, normalizedId, purpose);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
}));

router.post('/otp/verify-login', [
  body('channel').isIn(['email', 'phone']),
  body('identifier').notEmpty(),
  body('code').isLength({ min: 6, max: 6 }).withMessage('Enter 6-digit OTP'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { channel, identifier, code } = req.body;
  const normalizedId = channel === 'email' ? normalizeEmail(identifier) : identifier;
  const result = await verifyOtp(channel, normalizedId, code, 'login');

  if (!result.valid) {
    return res.status(401).json({ error: result.error });
  }

  const employee = channel === 'email'
    ? await db.findEmployeeByEmail(result.identifier)
    : await db.findEmployeeByPhone(result.identifier);

  if (!employee) {
    return res.status(404).json({ error: 'Account not found' });
  }

  if (channel === 'email') {
    await db.updateEmployee(employee.id, { email_verified: true });
  }

  const updated = await db.findEmployeeById(employee.id);
  let supabaseSession = null;
  if (isSupabaseConfigured() && updated.auth_id && req.body.password) {
    try {
      supabaseSession = await signInWithPassword(updated.email, req.body.password);
    } catch {
      /* OTP login without password — app JWT only */
    }
  }
  res.json(buildAuthResponse(updated, supabaseSession));
}));

const registerValidation = [
  body('name').trim().isLength({ min: 2, max: 100 }),
  emailField,
  body('phone').matches(/^[6-9]\d{9}$/),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('channel').equals('email').withMessage('Registration requires email verification'),
  body('code').isLength({ min: 6, max: 6 }),
  body('home_address').optional().trim(),
  body('route_from').optional().trim(),
  body('route_to').optional().trim(),
  body('city').optional().trim().isIn(INDIAN_CITIES),
  body('office_address').optional().trim(),
  body('availability').optional().isIn(['available', 'limited', 'unavailable']),
];

router.post('/register', registerValidation, asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const {
    name, email, phone, password,
    home_address, route_from, route_to, city, office_address, availability,
    code,
  } = req.body;

  const otpResult = await verifyOtp('email', email, code, 'register');
  if (!otpResult.valid) {
    return res.status(401).json({ error: otpResult.error });
  }

  if (await db.findEmployeeByEmail(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }
  if (await db.findEmployeeByPhone(phone)) {
    return res.status(409).json({ error: 'Phone number already registered' });
  }

  let authId = null;
  let supabaseSession = null;

  if (isSupabaseConfigured()) {
    authId = otpResult.authUserId;
    if (authId) {
      await updateAuthPassword(authId, password);
      supabaseSession = await signInWithPassword(email, password);
    } else {
      const authUser = await createAuthUser({ email, password, name });
      authId = authUser.id;
      supabaseSession = await signInWithPassword(email, password);
    }
  }

  let employee;
  try {
    const payload = {
      name,
      email,
      phone,
      auth_id: authId,
      home_address: home_address?.trim() || '',
      office_address: office_address?.trim() || '',
      route_from: route_from?.trim() || '',
      route_to: route_to?.trim() || '',
      city: city || 'Bangalore',
      availability: availability || 'available',
      email_verified: true,
      is_demo: false,
      user_type: 'new',
      source: 'register',
    };
    if (!isSupabaseConfigured()) {
      payload.password_hash = bcrypt.hashSync(String(password), 12);
    }
    employee = await db.createEmployee(payload);
  } catch (err) {
    if (err.code === 'PHONE_IN_USE' || err.code === '23505') {
      return res.status(409).json({ error: 'Email or phone already registered' });
    }
    throw err;
  }

  const welcome = buildWelcomeEmail(name);
  deliverEmailNow({
    toEmail: email,
    subject: welcome.subject,
    html: welcome.html,
    emailType: 'welcome',
    userId: employee.id,
    skipEligibility: true,
  }).catch((err) => {
    console.error(`Welcome email failed for ${email}:`, err.message);
  });

  res.status(201).json(buildAuthResponse(employee, supabaseSession));
}));

router.post('/login', [
  emailField,
  body('password').notEmpty().withMessage('Password is required'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  if (isSupabaseConfigured()) {
    try {
      const session = await signInWithPassword(email, password);
      const employee = await db.findEmployeeByEmail(email);
      if (!employee) {
        return res.status(401).json({
          error: 'Invalid email or password',
          hint: 'No account with this email. Register first.',
        });
      }
      await db.updateEmployee(employee.id, { email_verified: true });
      const updated = await db.findEmployeeById(employee.id);
      return res.json(buildAuthResponse(updated, session));
    } catch (err) {
      return res.status(err.status || 401).json({
        error: err.message || 'Invalid email or password',
        hint: 'Wrong password. Use Forgot Password to reset via email code.',
      });
    }
  }

  const employee = await db.findEmployeeByEmail(email);
  if (!employee || !employee.password_hash) {
    return res.status(401).json({
      error: 'Invalid email or password',
      ...(!employee && {
        hint: 'No account with this email. Register first, or use Forgot Password if you already signed up.',
      }),
    });
  }

  if (!verifyPassword(password, employee.password_hash)) {
    return res.status(401).json({
      error: 'Invalid email or password',
      hint: 'Wrong password. Use Forgot Password to reset via Gmail OTP.',
    });
  }

  await db.updateEmployee(employee.id, { email_verified: true });
  const updated = await db.findEmployeeById(employee.id);
  res.json({ token: signToken(updated), employee: sanitizeEmployee(updated) });
}));

router.post('/reset-password', [
  emailField,
  body('code').isLength({ min: 6, max: 6 }),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, code, password } = req.body;
  const otpResult = await verifyOtp('email', email, code, 'reset');
  if (!otpResult.valid) {
    return res.status(401).json({ error: otpResult.error });
  }

  const employee = await db.findEmployeeByEmail(email);
  if (!employee) {
    return res.status(404).json({ error: 'Account not found' });
  }

  if (isSupabaseConfigured()) {
    if (employee.auth_id) {
      await updateAuthPassword(employee.auth_id, password);
    } else {
      const authUser = await createAuthUser({
        email,
        password,
        name: employee.name,
      });
      await db.updateEmployee(employee.id, { auth_id: authUser.id });
    }
    await db.updateEmployee(employee.id, { email_verified: true });
  } else {
    await db.updateEmployee(employee.id, {
      password_hash: bcrypt.hashSync(String(password), 12),
      email_verified: true,
    });
  }

  const updated = await db.findEmployeeById(employee.id);

  const resetMail = buildPasswordResetSuccessEmail(updated.name);
  deliverEmailNow({
    toEmail: email,
    subject: resetMail.subject,
    html: resetMail.html,
    emailType: 'password_reset',
    userId: updated.id,
    skipEligibility: true,
  }).catch((err) => {
    console.error(`Password reset confirmation email failed for ${email}:`, err.message);
  });

  let supabaseSession = null;
  if (isSupabaseConfigured()) {
    supabaseSession = await signInWithPassword(email, password);
  }

  res.json({
    message: 'Password updated successfully. You are now signed in.',
    ...buildAuthResponse(updated, supabaseSession),
  });
}));

router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const employee = await db.findEmployeeById(req.user.id);
  if (!employee) {
    return res.status(404).json({ error: 'Employee not found' });
  }
  res.json({
    employee: sanitizeEmployee(employee),
    profileCompletion: computeProfileCompletion(employee),
    verification: verificationStatus(employee),
  });
}));

module.exports = router;
