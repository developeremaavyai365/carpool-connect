const { queueNotificationEmail } = require('../services/emailQueue');
const { getAppUrl } = require('./appUrl');

/**
 * Queue a Gmail copy of in-app notifications for the target user (any user with a real email).
 */
function emailNotificationAsync(employeeId, notification) {
  queueNotificationEmail(employeeId, notification, (employee) => {
    const payload = {
      title: notification.title,
      message: notification.message,
      type: notification.type,
    };
    return {
      subject: `CarPool Connect — ${notification.title}`,
      html: buildNotificationHtml(payload),
    };
  });
}

function buildNotificationHtml({ title, message, type }) {
  const appUrl = getAppUrl();
  const requestTypes = new Set(['carpool_request', 'carpool_response']);
  const linkPath = requestTypes.has(type) ? '/requests' : '/notifications';
  const actionLabel = requestTypes.has(type) ? 'View Request' : 'View Notifications';

  return `
    <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f8fafc">
      <div style="background:#fff;border-radius:12px;padding:28px;border:1px solid #e2e8f0">
        <h2 style="color:#2563eb;margin:0 0 16px">CarPool Connect</h2>
        <h3 style="color:#0f172a;margin:0 0 12px">${title}</h3>
        <p style="color:#475569;line-height:1.6">${message}</p>
        <p style="text-align:center;margin:28px 0">
          <a href="${appUrl}${linkPath}" style="background:#2563eb;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:bold">
            ${actionLabel}
          </a>
        </p>
        <p style="color:#64748b;font-size:12px">Rate this alert in the app under Inbox → feedback.</p>
      </div>
    </div>
  `;
}

module.exports = { emailNotificationAsync, buildNotificationHtml };
