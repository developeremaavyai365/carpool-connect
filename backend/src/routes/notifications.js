const { body, validationResult } = require('express-validator');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { broadcastToAllUsers, processQueueOnce } = require('../services/emailQueue');
const { buildNotificationHtml } = require('../utils/notificationEmail');

const { asyncHandler } = require('../utils/asyncRoute');

const router = require('express').Router();

function isAppOwner(user) {
  const ownerEmail = (process.env.APP_OWNER_EMAIL || '').toLowerCase().trim();
  if (!ownerEmail) return false;
  return user?.email?.toLowerCase() === ownerEmail;
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { unread } = req.query;
  const notifications = await db.getNotifications(req.user.id, { unreadOnly: unread === 'true' });
  res.json({ notifications });
}));

router.get('/unread-count', asyncHandler(async (req, res) => {
  const count = await db.countUnreadNotifications(req.user.id);
  res.json({ count });
}));

router.get('/email-status', asyncHandler(async (req, res) => {
  if (!isAppOwner(req.user)) {
    return res.status(403).json({ error: 'Owner access required' });
  }

  const stats = await db.getEmailQueueStats();
  const recent = await db.getRecentEmailDeliveries(30);
  const feedback = await db.getFeedbackSummary();
  const users = await db.listAllEmployees();
  const eligible = users.filter((u) => {
    const { canDeliverToUser } = require('../services/emailQueue');
    return canDeliverToUser(u).ok;
  });

  res.json({
    queue: stats,
    recentDeliveries: recent,
    feedback,
    users: {
      total: users.length,
      eligibleForGmail: eligible.length,
      byType: {
        existing: users.filter((u) => u.user_type === 'existing').length,
        new: users.filter((u) => u.user_type === 'new').length,
      },
    },
    database: { path: await db.getDbPath(), engine: 'sqlite' },
  });
}));

router.post('/broadcast', [
  body('title').trim().isLength({ min: 3, max: 120 }),
  body('message').trim().isLength({ min: 5, max: 1000 }),
], asyncHandler(async (req, res) => {
  if (!isAppOwner(req.user)) {
    return res.status(403).json({ error: 'Owner access required' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, message } = req.body;
  const html = buildNotificationHtml({ title, message, type: 'broadcast' });
  const result = broadcastToAllUsers({
    subject: `CarPool Connect — ${title}`,
    html,
    emailType: 'broadcast',
  });

  processQueueOnce().catch(() => {});

  res.json({
    message: 'Broadcast queued for all eligible users',
    ...result,
  });
}));

router.post('/feedback', [
  body('notification_id').optional().isInt({ min: 1 }),
  body('rating').optional().isInt({ min: 1, max: 5 }),
  body('comment').optional().trim().isLength({ max: 500 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { notification_id, rating, comment } = req.body;
  if (!rating && !comment?.trim()) {
    return res.status(400).json({ error: 'Provide a rating or comment' });
  }

  if (notification_id) {
    const notif = await db.findNotificationById(notification_id);
    if (!notif || notif.employee_id !== req.user.id) {
      return res.status(404).json({ error: 'Notification not found' });
    }
  }

  const feedback = await db.createNotificationFeedback({
    userId: req.user.id,
    notificationId: notification_id || null,
    rating: rating || null,
    comment: comment || '',
  });

  res.status(201).json({ feedback, message: 'Thank you for your feedback' });
}));

router.get('/feedback/summary', asyncHandler(async (req, res) => {
  if (!isAppOwner(req.user)) {
    return res.status(403).json({ error: 'Owner access required' });
  }
  res.json(await db.getFeedbackSummary());
}));

router.patch('/read-all', asyncHandler(async (req, res) => {
  await db.markAllNotificationsRead(req.user.id);
  res.json({ message: 'All notifications marked as read' });
}));

router.patch('/:id/read', asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: 'Invalid notification ID' });
  }

  const notification = await db.findNotificationById(id);

  if (!notification) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  if (notification.employee_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  const updated = await db.markNotificationRead(id);
  res.json({ notification: updated });
}));

module.exports = router;
