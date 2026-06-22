const db = require('../database');
const { sendMail, isEmailConfigured } = require('../utils/mailer');
const { normalizeEmail } = require('../utils/emailNormalize');

const BATCH_SIZE = 8;
const POLL_MS = 4000;
const DEMO_EMAIL_PATTERN = /@company\.com$/i;

let intervalId = null;
let processing = false;

/**
 * Whether this address can receive mail (pre-registration OTP uses address only).
 */
function canDeliverToAddress(email, { employee = null, purpose = null } = {}) {
  const to = normalizeEmail(email);
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return { ok: false, reason: 'invalid email format' };
  }
  if (employee) return canDeliverToUser(employee);

  if (DEMO_EMAIL_PATTERN.test(to)) {
    if (purpose === 'register') {
      if (process.env.OTP_DEV_MODE === 'true') {
        return { ok: false, reason: 'demo dev mode', devOnly: true };
      }
      return { ok: false, reason: 'Use your personal Gmail — demo @company.com addresses cannot receive mail' };
    }
    if (process.env.OTP_DEV_MODE === 'true') {
      return { ok: false, reason: 'demo dev mode', devOnly: true };
    }
    return { ok: false, reason: 'Use your personal Gmail — demo @company.com addresses cannot receive mail' };
  }
  return { ok: true };
}

/**
 * Whether a registered user should receive Gmail delivery.
 * Demo/seed accounts are skipped; every real registered user gets mail at their own email.
 */
function canDeliverToUser(employee) {
  if (!employee?.email) return { ok: false, reason: 'no email' };
  if (employee.email_notifications === false) {
    return { ok: false, reason: 'notifications disabled' };
  }
  if (employee.is_demo) {
    if (process.env.OTP_DEV_MODE === 'true') {
      return { ok: false, reason: 'demo dev mode', devOnly: true };
    }
    return { ok: false, reason: 'demo account' };
  }
  if (!employee.email_verified) {
    return { ok: false, reason: 'email not verified' };
  }
  if (DEMO_EMAIL_PATTERN.test(employee.email)) {
    return { ok: false, reason: 'not a deliverable address' };
  }
  if (employee.source === 'seed' && DEMO_EMAIL_PATTERN.test(employee.email)) {
    return { ok: false, reason: 'demo seed account' };
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(employee.email)) {
    return { ok: false, reason: 'invalid email format' };
  }
  return { ok: true };
}

/**
 * Send one email immediately to the explicit recipient address (never the Gmail sender account).
 */
async function deliverEmailNow({
  toEmail,
  subject,
  html,
  emailType = 'transactional',
  userId = null,
  notificationId = null,
  skipEligibility = false,
}) {
  const to = normalizeEmail(toEmail);
  const employee = userId ? await db.findEmployeeById(userId) : await db.findEmployeeByEmail(to);
  const deliver = skipEligibility
    ? canDeliverToAddress(to)
    : (employee ? canDeliverToUser(employee) : canDeliverToAddress(to));

  const item = await db.enqueueEmail({
    userId: employee?.id || userId || null,
    toEmail: to,
    subject,
    html,
    emailType,
    notificationId,
  });

  if (!deliver.ok) {
    await db.markEmailSkipped(item.id, deliver.reason);
    console.log(`[Email] Skipped ${to}: ${deliver.reason}`);
    return { sent: false, skipped: true, reason: deliver.reason, queueId: item.id };
  }

  if (!isEmailConfigured()) {
    await db.markEmailSkipped(item.id, 'Gmail not configured on server');
    console.log(`[Email] Queued (no SMTP) → ${to}: ${subject}`);
    return { sent: false, devMode: true, queueId: item.id };
  }

  try {
    await sendMail({ to, subject, html });
    await db.markEmailSent(item.id);
    console.log(`[Email] Sent → ${to}: ${subject}`);
    return { sent: true, devMode: false, queueId: item.id };
  } catch (err) {
    await db.markEmailFailed(item.id, err.message);
    console.error(`[Email] Failed → ${to}: ${err.message}`);
    throw err;
  }
}

async function queueNotificationEmail(employeeId, notification, htmlBuilder) {
  const employee = await db.findEmployeeById(employeeId);
  if (!employee?.email) return null;

  const deliver = canDeliverToUser(employee);
  const { subject, html } = htmlBuilder(employee);

  const item = await db.enqueueEmail({
    userId: employeeId,
    toEmail: employee.email,
    subject,
    html,
    emailType: notification?.type || 'notification',
    notificationId: notification?.id || null,
  });

  if (!deliver.ok) {
    await db.markEmailSkipped(item.id, deliver.reason);
    console.log(`[Email] Skipped ${employee.email}: ${deliver.reason}`);
    return item;
  }

  if (!isEmailConfigured()) {
    await db.markEmailSkipped(item.id, 'Gmail not configured on server');
    console.log(`[Email] Queued (no SMTP) → ${employee.email}: ${subject}`);
    return item;
  }

  processQueueOnce().catch((err) => console.error('[Email queue]', err.message));
  return item;
}

async function processQueueOnce() {
  if (processing || !isEmailConfigured()) return { processed: 0 };
  processing = true;
  let processed = 0;

  try {
    const pending = await db.getPendingEmails(BATCH_SIZE);
    for (const item of pending) {
      const employee = item.user_id ? await db.findEmployeeById(item.user_id) : null;
      const deliver = employee
        ? canDeliverToUser(employee)
        : canDeliverToAddress(item.to_email);

      if (!deliver.ok) {
        await db.markEmailSkipped(item.id, deliver.reason);
        continue;
      }

      try {
        await sendMail({ to: item.to_email, subject: item.subject, html: item.html });
        await db.markEmailSent(item.id);
        processed += 1;
        console.log(`[Email] Sent → ${item.to_email}: ${item.subject}`);
      } catch (err) {
        await db.markEmailFailed(item.id, err.message);
        console.error(`[Email] Failed → ${item.to_email}: ${err.message}`);
      }
    }
  } finally {
    processing = false;
  }

  return { processed };
}

function startEmailQueueProcessor() {
  if (intervalId) return;
  intervalId = setInterval(() => {
    processQueueOnce().catch((err) => console.error('[Email queue]', err.message));
  }, POLL_MS);
  processQueueOnce().catch(() => {});
  console.log(`[Email] Queue processor started (every ${POLL_MS / 1000}s)`);
}

function stopEmailQueueProcessor() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

async function broadcastToAllUsers({ subject, html, emailType = 'broadcast' }) {
  const users = await db.listAllEmployees();
  const queued = [];

  for (const user of users) {
    const deliver = canDeliverToUser(user);
    const item = await db.enqueueEmail({
      userId: user.id,
      toEmail: user.email,
      subject,
      html,
      emailType,
      notificationId: null,
    });

    if (!deliver.ok || !isEmailConfigured()) {
      await db.markEmailSkipped(item.id, deliver.ok ? 'Gmail not configured' : deliver.reason);
    }
    queued.push({ userId: user.id, email: user.email, queueId: item.id, deliver: deliver.ok });
  }

  processQueueOnce().catch(() => {});
  return { total: users.length, queued: queued.length, details: queued };
}

module.exports = {
  canDeliverToAddress,
  canDeliverToUser,
  deliverEmailNow,
  queueNotificationEmail,
  processQueueOnce,
  startEmailQueueProcessor,
  stopEmailQueueProcessor,
  broadcastToAllUsers,
};
