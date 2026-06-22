const fs = require('fs');
const path = require('path');

/**
 * One-time import from legacy store.json into SQLite tables.
 */
function migrateFromJson(db, jsonPath) {
  if (!fs.existsSync(jsonPath)) return { migrated: false, reason: 'no json file' };

  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return { migrated: false, reason: 'sqlite already has data' };

  let store;
  try {
    store = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  } catch {
    return { migrated: false, reason: 'invalid json' };
  }

  const counters = store.counters || {};
  db.prepare('UPDATE counters SET value = ? WHERE name = ?').run(counters.employees || 0, 'users');
  db.prepare('UPDATE counters SET value = ? WHERE name = ?').run(counters.carpool_requests || 0, 'carpool_requests');
  db.prepare('UPDATE counters SET value = ? WHERE name = ?').run(counters.notifications || 0, 'notifications');

  const insertUser = db.prepare(`
    INSERT INTO users (id, email, phone, name, password_hash, role, user_type, source,
      email_verified, email_notifications, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDetails = db.prepare(`
    INSERT INTO user_details (user_id, home_address, office_address, route_from, route_to, city,
      availability, bio, travel_preferences, vehicle, recent_searches)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const e of store.employees || []) {
    const userType = e.is_demo ? 'existing' : (e.created_at ? 'new' : 'existing');
    const source = e.is_demo ? 'seed' : (e.is_demo === false ? 'register' : 'seed');
    insertUser.run(
      e.id,
      e.email,
      e.phone,
      e.name,
      e.password_hash,
      e.role || 'employee',
      userType,
      source,
      e.email_verified ? 1 : 0,
      e.email_notifications !== false ? 1 : 0,
      e.is_demo ? 1 : 0,
      e.created_at || new Date().toISOString(),
      e.updated_at || new Date().toISOString()
    );
    insertDetails.run(
      e.id,
      e.home_address || '',
      e.office_address || 'Company HQ, Bangalore',
      e.route_from || '',
      e.route_to || '',
      e.city || 'Bangalore',
      e.availability || 'available',
      e.bio || '',
      e.travel_preferences || '',
      e.vehicle ? JSON.stringify(e.vehicle) : null,
      e.recent_searches ? JSON.stringify(e.recent_searches) : null
    );
  }

  const insertReq = db.prepare(`
    INSERT INTO carpool_requests (id, sender_id, receiver_id, status, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of store.carpool_requests || []) {
    insertReq.run(r.id, r.sender_id, r.receiver_id, r.status, r.message, r.created_at, r.updated_at);
  }

  const insertNotif = db.prepare(`
    INSERT INTO notifications (id, employee_id, type, title, message, related_request_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const n of store.notifications || []) {
    insertNotif.run(
      n.id, n.employee_id, n.type, n.title, n.message,
      n.related_request_id, n.is_read ? 1 : 0, n.created_at
    );
  }

  for (const o of store.otps || []) {
    db.prepare(`
      INSERT OR REPLACE INTO otps (identifier, channel, purpose, code, expires_at, attempts, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(o.identifier, o.channel, o.purpose, o.code, o.expires_at, o.attempts || 0, o.created_at);
  }

  const backupPath = jsonPath.replace('.json', `.backup-${Date.now()}.json`);
  fs.copyFileSync(jsonPath, backupPath);

  return { migrated: true, users: (store.employees || []).length, backup: backupPath };
}

module.exports = { migrateFromJson };
