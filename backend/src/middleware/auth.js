const jwt = require('jsonwebtoken');
const db = require('../database');
const { isSupabaseConfigured } = require('../lib/supabase');
const { resolveEmployeeFromToken } = require('../services/supabaseAuth');

async function resolveUserFromToken(token) {
  if (!token) return null;

  if (isSupabaseConfigured()) {
    const employee = await resolveEmployeeFromToken(token);
    if (employee) {
      return {
        id: employee.id,
        email: employee.email,
        role: employee.role,
        authId: employee.auth_id,
      };
    }
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const employee = await db.findEmployeeById(payload.id);
    if (!employee) return null;
    return {
      id: employee.id,
      email: employee.email,
      role: employee.role,
      authId: employee.auth_id,
    };
  } catch {
    return null;
  }
}

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = header.slice(7);
  const user = await resolveUserFromToken(token);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  req.user = user;
  return next();
}

function authorize(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied' });
    }
    next();
  };
}

module.exports = { authenticate, authorize, resolveUserFromToken };
