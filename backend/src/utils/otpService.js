const crypto = require('crypto');
const db = require('../database');
const { isSupabaseConfigured } = require('../lib/supabase');
const { sendEmailOtp, verifyEmailOtp, extractAuthErrorMessage } = require('../services/supabaseAuth');
const { sendOtpSms } = require('./sms');
const { buildOtpEmail, isEmailConfigured } = require('./mailer');
const { deliverEmailNow, canDeliverToAddress } = require('../services/emailQueue');

const OTP_EXPIRY_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const SUPABASE_OTP_MARKER = '__supabase__';

function generateCode() {
  return crypto.randomInt(100000, 999999).toString();
}

function normalizeIdentifier(channel, identifier) {
  if (channel === 'email') return identifier.toLowerCase().trim();
  if (channel === 'phone') return identifier.replace(/\D/g, '').slice(-10);
  return identifier.trim();
}

async function enforceOtpRateLimit(normalized) {
  if ((await db.countRecentOtps(normalized)) >= 5) {
    const err = new Error('Too many OTP requests. Please wait 10 minutes.');
    err.status = 429;
    throw err;
  }
}

async function sendOtpViaSupabase(normalized, purpose) {
  await enforceOtpRateLimit(normalized);

  // For 'reset', also allow user creation so accounts not yet in Supabase Auth can still receive OTP.
  const shouldCreateUser = purpose === 'register' || purpose === 'reset';
  await sendEmailOtp(normalized, { shouldCreateUser });

  // saveOtp is non-critical — email already sent. Don't let a DB hiccup block the response.
  try {
    await db.saveOtp({
      identifier: normalized,
      channel: 'email',
      purpose,
      code: SUPABASE_OTP_MARKER,
      expires_at: new Date(Date.now() + OTP_EXPIRY_MS).toISOString(),
    });
  } catch (e) {
    console.warn('[OTP] saveOtp failed (email was still sent):', e.message);
  }

  return {
    message: 'Verification code sent. Check your email inbox (and spam folder).',
    emailSent: true,
    provider: 'supabase',
    expiresIn: 600,
    devMode: false,
  };
}

async function sendOtpViaGmail(normalized, purpose) {
  await enforceOtpRateLimit(normalized);

  if (purpose === 'login') {
    const user = await db.findEmployeeByEmail(normalized);
    if (!user) {
      const err = new Error('No account found with this email');
      err.status = 404;
      throw err;
    }
  }

  if (purpose === 'reset' && !(await db.findEmployeeByEmail(normalized))) {
    const err = new Error('No account found with this email');
    err.status = 404;
    throw err;
  }

  const code = generateCode();
  const expires_at = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();
  await db.saveOtp({ identifier: normalized, channel: 'email', purpose, code, expires_at });

  const employee = await db.findEmployeeByEmail(normalized);
  const eligible = canDeliverToAddress(normalized, { employee, purpose });

  if (!eligible.ok && !eligible.devOnly) {
    const err = new Error(eligible.reason);
    err.status = 400;
    throw err;
  }

  let delivery;
  const { subject, html } = buildOtpEmail(purpose, code);

  if (eligible.ok) {
    try {
      delivery = await deliverEmailNow({
        toEmail: normalized,
        subject,
        html,
        emailType: `otp_${purpose}`,
        skipEligibility: true,
      });
    } catch {
      const sendErr = new Error(`Could not send verification email to ${normalized}. Try again in a moment.`);
      sendErr.status = 502;
      throw sendErr;
    }
  } else {
    delivery = { sent: false, devMode: true };
    console.log(`[OTP Email → ${normalized}] Code: ${code} (dev mode — no SMTP delivery)`);
  }

  if (!delivery.sent && !delivery.skipped && !eligible.devOnly) {
    console.log(`[OTP Email → ${normalized}] Code: ${code} (Gmail not configured)`);
  }

  return {
    message: delivery.sent
      ? `Verification code sent to ${normalized}. Check your email inbox (and spam folder).`
      : 'Email is not configured on the server. Contact your administrator or use the development code below.',
    emailSent: delivery.sent,
    provider: 'gmail',
    expiresIn: 600,
    devMode: delivery.devMode,
    ...(process.env.OTP_DEV_MODE === 'true' && { devOtp: code }),
  };
}

async function verifyOtpViaSupabase(normalized, code, purpose) {
  const record = await db.findOtp(normalized, 'email', purpose).catch(() => null);

  // Enforce rate limit and expiry only when we have a DB record (saveOtp may have failed).
  if (record && record.code === SUPABASE_OTP_MARKER) {
    if (new Date(record.expires_at) < new Date()) {
      await db.deleteOtp(normalized, 'email', purpose).catch(() => {});
      return { valid: false, error: 'OTP has expired. Request a new code.' };
    }
    if (record.attempts >= MAX_ATTEMPTS) {
      await db.deleteOtp(normalized, 'email', purpose).catch(() => {});
      return { valid: false, error: 'Too many failed attempts. Request a new code.' };
    }
  }

  try {
    const session = await verifyEmailOtp(normalized, code);
    await db.deleteOtp(normalized, 'email', purpose).catch(() => {});
    return {
      valid: true,
      identifier: normalized,
      channel: 'email',
      authUserId: session.user?.id,
      accessToken: session.access_token,
      provider: 'supabase',
    };
  } catch (err) {
    if (record) await db.incrementOtpAttempts(normalized, 'email', purpose).catch(() => {});
    return {
      valid: false,
      error: extractAuthErrorMessage(err),
    };
  }
}

async function verifyOtpLocally(normalized, code, channel, purpose) {
  const record = await db.findOtp(normalized, channel, purpose);

  if (!record) {
    return { valid: false, error: 'OTP expired or not found. Request a new code.' };
  }

  if (new Date(record.expires_at) < new Date()) {
    await db.deleteOtp(normalized, channel, purpose);
    return { valid: false, error: 'OTP has expired. Request a new code.' };
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await db.deleteOtp(normalized, channel, purpose);
    return { valid: false, error: 'Too many failed attempts. Request a new code.' };
  }

  if (record.code !== code.trim()) {
    await db.incrementOtpAttempts(normalized, channel, purpose);
    return { valid: false, error: 'Invalid OTP. Please try again.' };
  }

  await db.deleteOtp(normalized, channel, purpose);
  return { valid: true, identifier: normalized, channel, provider: 'gmail' };
}

async function sendOtp(channel, identifier, purpose) {
  const normalized = normalizeIdentifier(channel, identifier);

  if (channel === 'email' && isSupabaseConfigured()) {
    try {
      return await sendOtpViaSupabase(normalized, purpose);
    } catch (err) {
      console.warn('[OTP] Supabase send failed:', extractAuthErrorMessage(err));
      if (isEmailConfigured()) {
        console.warn('[OTP] Falling back to Gmail for', normalized);
        return sendOtpViaGmail(normalized, purpose);
      }
      const sendErr = new Error(extractAuthErrorMessage(err));
      sendErr.status = err.status || 502;
      throw sendErr;
    }
  }

  if (channel === 'email') {
    return sendOtpViaGmail(normalized, purpose);
  }

  await enforceOtpRateLimit(normalized);

  if (purpose === 'login') {
    const user = await db.findEmployeeByPhone(normalized);
    if (!user) {
      const err = new Error('No account found with this phone number');
      err.status = 404;
      throw err;
    }
  }

  const code = generateCode();
  const expires_at = new Date(Date.now() + OTP_EXPIRY_MS).toISOString();
  await db.saveOtp({ identifier: normalized, channel, purpose, code, expires_at });
  const delivery = await sendOtpSms(normalized, code);

  return {
    message: delivery.sent
      ? `Verification code sent to ${normalized}.`
      : 'SMS is not configured on the server.',
    emailSent: delivery.sent,
    provider: 'sms',
    expiresIn: 600,
    devMode: delivery.devMode,
    ...(process.env.OTP_DEV_MODE === 'true' && { devOtp: code }),
  };
}

async function verifyOtp(channel, identifier, code, purpose) {
  const normalized = normalizeIdentifier(channel, identifier);

  if (channel === 'email' && isSupabaseConfigured()) {
    const record = await db.findOtp(normalized, 'email', purpose).catch(() => null);
    // If the DB has the Supabase marker OR saveOtp failed (no record at all),
    // delegate entirely to Supabase — never fall through to local, because the
    // stored code is '__supabase__' (not the real OTP) so local check always fails.
    if (!record || record.code === SUPABASE_OTP_MARKER) {
      return verifyOtpViaSupabase(normalized, code, purpose);
    }
    return verifyOtpLocally(normalized, code, channel, purpose);
  }

  return verifyOtpLocally(normalized, code, channel, purpose);
}

module.exports = { sendOtp, verifyOtp, normalizeIdentifier };
