const { getSupabaseAdmin, getSupabaseAnon } = require('../lib/supabase');

function formatAuthError(error) {
  const msg = extractAuthErrorMessage(error);
  const err = new Error(msg);
  if (/rate limit|too many/i.test(msg)) err.status = 429;
  else if (/invalid|expired|otp/i.test(msg)) err.status = 401;
  else if (/already been registered|already exists/i.test(msg)) err.status = 409;
  else if (error?.status === 504) err.status = 504;
  else err.status = 400;
  return err;
}

function extractAuthErrorMessage(error) {
  if (!error) return 'Authentication request failed';

  const raw = typeof error.message === 'string' ? error.message.trim() : '';

  // Map Supabase's terse errors to human-friendly messages
  if (/token.*expired|invalid.*token|otp.*expired|expired.*otp/i.test(raw)) {
    return 'Verification code has expired or is invalid. Please request a new one.';
  }
  if (/invalid.*credentials|invalid.*password|wrong.*password/i.test(raw)) {
    return 'Incorrect email or password.';
  }
  if (/email.*rate.*limit|rate.*limit.*email|too many.*request/i.test(raw)) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  if (/already.*registered|user.*already.*exists/i.test(raw)) {
    return 'An account with this email already exists.';
  }
  if (/email.*not.*confirmed|not.*confirmed/i.test(raw)) {
    return 'Email not confirmed. Please check your inbox for a verification code.';
  }
  if (error.status === 504 || error.name === 'AuthRetryableFetchError') {
    return 'Request timed out. Please try again in a moment.';
  }

  if (raw && raw !== '{}') return raw;
  if (error.code) return String(error.code).replace(/_/g, ' ');

  return 'Authentication failed. Please try again.';
}

async function signInWithPassword(email, password) {
  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) {
    const err = new Error(error.message === 'Invalid login credentials'
      ? 'Invalid email or password'
      : error.message);
    err.status = 401;
    throw err;
  }
  return data.session;
}

async function createAuthUser({ email, password, name }) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: email.trim().toLowerCase(),
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (error) {
    if (error.message?.includes('already been registered')) {
      const err = new Error('Email already registered');
      err.status = 409;
      throw err;
    }
    throw error;
  }
  return data.user;
}

async function updateAuthPassword(authId, password) {
  const admin = getSupabaseAdmin();
  const { error } = await admin.auth.admin.updateUserById(authId, { password });
  if (error) throw formatAuthError(error);
}

async function findAuthUserByEmail(email) {
  const admin = getSupabaseAdmin();
  const normalized = email.toLowerCase().trim();
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error || !data?.users) return null;
  return data.users.find((u) => u.email?.toLowerCase() === normalized) || null;
}

async function verifyAccessToken(token) {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

async function resolveEmployeeFromToken(token) {
  const db = require('../database');
  const authUser = await verifyAccessToken(token);
  if (!authUser) return null;
  let employee = await db.findEmployeeByAuthId(authUser.id);
  if (!employee) {
    employee = await db.findEmployeeByEmail(authUser.email);
    if (employee && !employee.auth_id) {
      employee = await db.updateEmployee(employee.id, { auth_id: authUser.id });
    }
  }
  return employee;
}

/** Sends a 6-digit OTP via Supabase Auth (configure Email templates in Supabase dashboard). */
async function sendEmailOtp(email, { shouldCreateUser = false } = {}) {
  const supabase = getSupabaseAnon();
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { shouldCreateUser },
  });
  if (error) throw formatAuthError(error);
  return { sent: true };
}

/** Verifies Supabase email OTP and returns the auth session. */
async function verifyEmailOtp(email, token) {
  const supabase = getSupabaseAnon();
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: String(token).trim(),
    type: 'email',
  });
  if (error) throw formatAuthError(error);
  if (!data?.session) {
    const err = new Error('Verification succeeded but no session was returned');
    err.status = 500;
    throw err;
  }
  return data.session;
}

module.exports = {
  signInWithPassword,
  createAuthUser,
  updateAuthPassword,
  findAuthUserByEmail,
  verifyAccessToken,
  resolveEmployeeFromToken,
  sendEmailOtp,
  verifyEmailOtp,
  extractAuthErrorMessage,
};
