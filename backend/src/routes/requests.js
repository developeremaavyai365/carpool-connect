const { body, validationResult } = require('express-validator');
const db = require('../database');
const { authenticate } = require('../middleware/auth');
const { emailNotificationAsync } = require('../utils/notificationEmail');
const { isCommuteOwnedByUser, isSameUserId } = require('../utils/commuteOwnership');

const { asyncHandler } = require('../utils/asyncRoute');

const router = require('express').Router();

async function createNotification(employeeId, type, title, message, relatedRequestId, io) {
  const notification = await db.createNotification({
    employee_id: employeeId,
    type,
    title,
    message,
    related_request_id: relatedRequestId || null,
  });

  if (io) {
    io.to(`user:${employeeId}`).emit('notification', notification);
  }

  emailNotificationAsync(employeeId, notification);

  return notification;
}

router.use(authenticate);

router.get('/', asyncHandler(async (req, res) => {
  const { type } = req.query;
  const requests = await db.getRequests({ userId: req.user.id, type });
  res.json({ requests });
}));

router.get('/pending', asyncHandler(async (req, res) => {
  const requests = await db.getRequests({ userId: req.user.id, type: 'pending' });
  res.json({ requests });
}));

router.get('/completed-count', asyncHandler(async (req, res) => {
  const count = await db.countCompletedCommutes(req.user.id);
  res.json({ count });
}));

router.post('/', [
  body('receiver_id').isInt({ min: 1 }).withMessage('Valid receiver required'),
  body('commute_id').optional().isInt({ min: 1 }),
  body('message').optional().trim().isLength({ max: 500 }),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const receiverId = Number(req.body.receiver_id);
  const commuteId = req.body.commute_id != null ? Number(req.body.commute_id) : null;
  const { message } = req.body;
  const senderId = req.user.id;

  if (!Number.isInteger(receiverId) || receiverId < 1) {
    return res.status(400).json({ error: 'Valid receiver required' });
  }

  if (commuteId != null) {
    if (!Number.isInteger(commuteId) || commuteId < 1) {
      return res.status(400).json({ error: 'Valid commute required' });
    }
    const commute = await db.findCommuteById(commuteId);
    if (!commute || commute.status !== 'active') {
      return res.status(404).json({ error: 'Commute not found or no longer available' });
    }
    if (isCommuteOwnedByUser(commute, senderId)) {
      return res.status(403).json({ error: 'You cannot book your own commute.' });
    }
    if (!isSameUserId(commute.driver_id, receiverId)) {
      return res.status(400).json({ error: 'Commute does not belong to this driver' });
    }
  }

  if (isSameUserId(receiverId, senderId)) {
    return res.status(400).json({ error: 'Cannot send request to yourself' });
  }

  const receiver = await db.findEmployeeById(receiverId);
  if (!receiver) {
    return res.status(404).json({ error: 'Receiver not found' });
  }

  if (receiver.availability === 'unavailable') {
    return res.status(400).json({ error: 'Employee is not available for car pooling' });
  }

  if (await db.findPendingRequest(senderId, receiverId)) {
    return res.status(409).json({ error: 'A pending request already exists' });
  }

  const sender = await db.findEmployeeById(senderId);
  if (!sender) {
    return res.status(401).json({ error: 'Account no longer exists' });
  }

  const request = await db.createRequest({
    sender_id: senderId,
    receiver_id: receiverId,
    commute_id: commuteId,
    message: message || null,
  });

  const io = req.app.get('io');
  await createNotification(
    receiverId,
    'carpool_request',
    'New Car Pool Request',
    `${sender.name} has sent you a car pooling request.`,
    request.id,
    io
  );

  res.status(201).json({ request });
}));

router.patch('/:id/respond', [
  body('response').isIn(['accepted', 'declined']).withMessage('Response must be accepted or declined'),
], asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const requestId = parseInt(req.params.id, 10);
  const { response } = req.body;

  const request = await db.findRequestById(requestId);
  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.receiver_id !== req.user.id) {
    return res.status(403).json({ error: 'Only the receiver can respond' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Request already responded to' });
  }

  if (response === 'accepted' && request.commute_id) {
    const commute = await db.findCommuteById(request.commute_id);
    if (!commute || commute.status !== 'active') {
      return res.status(409).json({ error: 'This commute is no longer available.' });
    }
    if (Number(commute.seats_available) <= 0) {
      return res.status(409).json({ error: 'No seats available on this commute.' });
    }
  }

  const updated = await db.updateRequest(requestId, { status: response });

  if (response === 'accepted' && request.commute_id) {
    const commute = await db.findCommuteById(request.commute_id);
    if (commute && Number(commute.seats_available) > 0) {
      await db.updateCommute(request.commute_id, {
        seats_available: Number(commute.seats_available) - 1,
      });
    }
  }

  const receiver = await db.findEmployeeById(req.user.id);
  const io = req.app.get('io');

  const title = response === 'accepted' ? 'Request Accepted' : 'Request Declined';

  let msg;
  if (response === 'accepted') {
    const v = receiver.vehicle;
    const vehicleStr = v
      ? [v.make, v.model, v.color, v.plate].filter(Boolean).join(' · ')
      : null;
    const lines = [
      `${receiver.name} accepted your carpool request!`,
      `Contact your driver:`,
      `📞 ${receiver.phone}`,
      `📧 ${receiver.email}`,
    ];
    if (vehicleStr) lines.push(`🚗 ${vehicleStr}`);
    msg = lines.join('\n');
  } else {
    msg = `${receiver.name} declined your car pooling request.`;
  }

  await createNotification(request.sender_id, 'carpool_response', title, msg, requestId, io);

  res.json({ request: updated });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const requestId = parseInt(req.params.id, 10);
  const request = await db.findRequestById(requestId);

  if (!request) {
    return res.status(404).json({ error: 'Request not found' });
  }

  if (request.sender_id !== req.user.id && request.receiver_id !== req.user.id) {
    return res.status(403).json({ error: 'Access denied' });
  }

  if (request.status !== 'pending') {
    return res.status(400).json({ error: 'Can only cancel pending requests' });
  }

  await db.deleteRequest(requestId);
  res.json({ message: 'Request cancelled' });
}));

module.exports = { router, createNotification };
