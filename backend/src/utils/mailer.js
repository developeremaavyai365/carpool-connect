const nodemailer = require('nodemailer');
const { getAppUrl } = require('./appUrl');
const { normalizeEmail } = require('./emailNormalize');

let transporter = null;

function isEmailConfigured() {
  return Boolean(process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD);
}

function getTransporter() {
  if (transporter) return transporter;
  if (!isEmailConfigured()) return null;

  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

function emailLayout(title, bodyHtml) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc">
      <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
        <h2 style="color:#2563eb;margin:0 0 16px;font-size:22px">CarPool Connect</h2>
        <h3 style="color:#0f172a;margin:0 0 12px;font-size:18px">${title}</h3>
        ${bodyHtml}
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="color:#94a3b8;font-size:12px;margin:0">
          This is an automated message from CarPool Connect. Please do not reply to this email.
        </p>
      </div>
    </div>
  `;
}

/** Sends to the explicit recipient — GMAIL_USER is only the SMTP sender (from address). */
async function sendMail({ to, subject, html }) {
  const recipient = normalizeEmail(to);
  const mail = getTransporter();
  if (!mail) {
    return { sent: false, devMode: true };
  }

  await mail.sendMail({
    from: `"CarPool Connect" <${process.env.GMAIL_USER}>`,
    to: recipient,
    subject,
    html,
  });
  return { sent: true, devMode: false };
}

function buildOtpEmail(purpose, code) {
  const subjects = {
    register: 'CarPool Connect — Verify your Gmail to register',
    reset: 'CarPool Connect — Reset your password',
    login: 'CarPool Connect — Your login verification code',
  };
  const intros = {
    register: 'Use this code to verify your Gmail and complete registration:',
    reset: 'Use this code to reset your CarPool Connect password:',
    login: 'Use this code to sign in to your CarPool Connect account:',
  };
  const headings = {
    register: 'Registration Verification',
    reset: 'Password Reset',
    login: 'Login Verification',
  };

  const subject = subjects[purpose] || subjects.login;
  const intro = intros[purpose] || intros.login;
  const appUrl = getAppUrl();

  const html = emailLayout(
    headings[purpose] || headings.login,
    `
      <p style="color:#475569;line-height:1.6">${intro}</p>
      <p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0f172a;text-align:center;margin:24px 0">${code}</p>
      <p style="color:#64748b;font-size:14px">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
      <p style="color:#64748b;font-size:13px;margin-top:16px">
        Open the app on your phone: <a href="${appUrl}">${appUrl}</a><br/>
        <em>Do not use "localhost" on mobile — it will not work.</em>
      </p>
    `,
  );

  return { subject, html };
}

function buildWelcomeEmail(name) {
  const appUrl = getAppUrl();
  const html = emailLayout(
    'Welcome to CarPool Connect!',
    `
      <p style="color:#475569;line-height:1.6">Hi <strong>${name}</strong>,</p>
      <p style="color:#475569;line-height:1.6">
        Your account has been created successfully. You can now sign in with your email and password,
        find car pool partners, and receive real-time alerts when other riders send you requests.
      </p>
      <p style="text-align:center;margin:28px 0">
        <a href="${appUrl}/login" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Sign In to CarPool Connect
        </a>
      </p>
      <p style="color:#64748b;font-size:14px">
        On your phone, use this link (not localhost):<br/>
        <a href="${appUrl}/login">${appUrl}/login</a>
      </p>
    `,
  );

  return {
    subject: 'Welcome to CarPool Connect — Your account is ready',
    html,
  };
}

function buildPasswordResetSuccessEmail(name) {
  const appUrl = getAppUrl();
  const html = emailLayout(
    'Password Reset Successful',
    `
      <p style="color:#475569;line-height:1.6">Hi <strong>${name}</strong>,</p>
      <p style="color:#475569;line-height:1.6">
        Your CarPool Connect password was changed successfully. You can now sign in with your new password.
      </p>
      <p style="color:#64748b;font-size:14px">
        If you did not request this change, contact your administrator immediately.
      </p>
      <p style="text-align:center;margin:28px 0">
        <a href="${appUrl}/login" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
          Sign In
        </a>
      </p>
      <p style="color:#64748b;font-size:14px">
        Mobile link: <a href="${appUrl}/login">${appUrl}/login</a>
      </p>
    `,
  );

  return {
    subject: 'CarPool Connect — Your password was reset',
    html,
  };
}

async function verifyEmailConnection() {
  if (!isEmailConfigured()) return { ok: false, reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not set' };
  try {
    await getTransporter().verify();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

module.exports = {
  isEmailConfigured,
  sendMail,
  buildOtpEmail,
  buildWelcomeEmail,
  buildPasswordResetSuccessEmail,
  verifyEmailConnection,
  getAppUrl,
  emailLayout,
};
