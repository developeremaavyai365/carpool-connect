const db = require('../database');
const { asyncHandler } = require('../utils/asyncRoute');

const router = require('express').Router();

router.get('/stats', asyncHandler(async (_req, res) => {
  const stats = await db.getPlatformStats();
  res.json({ stats });
}));

module.exports = router;
