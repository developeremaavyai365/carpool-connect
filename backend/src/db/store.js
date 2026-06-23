require('dotenv').config();
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const { normalizeEmail } = require('../utils/emailNormalize');
const { cityMatchesFilter } = require('../utils/metroAreas');
const { commuteMatchesRouteFilters } = require('../utils/routeMatch');
const { isCommuteOwnedByUser } = require('../utils/commuteOwnership');
const { initSchema } = require('./schema');
const { migrateFromJson } = require('./migrate');

const dataDir = path.join(__dirname, '..', '..', 'data');
const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'carpool.db');
const legacyJsonPath = path.join(dataDir, 'store.json');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

initSchema(db);

function ensureCommuteSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS published_commutes (
      id INTEGER PRIMARY KEY,
      driver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      route_from TEXT NOT NULL,
      route_to TEXT NOT NULL,
      city TEXT DEFAULT '',
      departure_at TEXT NOT NULL,
      seats_available INTEGER NOT NULL,
      price_per_seat REAL NOT NULL DEFAULT 0,
      notes TEXT DEFAULT '',
      smoking TEXT NOT NULL DEFAULT 'not_allowed',
      music TEXT NOT NULL DEFAULT 'any',
      pets TEXT NOT NULL DEFAULT 'not_allowed',
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_commutes_driver ON published_commutes(driver_id);
    CREATE INDEX IF NOT EXISTS idx_commutes_departure ON published_commutes(departure_at);
    CREATE INDEX IF NOT EXISTS idx_commutes_status ON published_commutes(status);
  `);
  const reqCols = db.prepare('PRAGMA table_info(carpool_requests)').all();
  if (!reqCols.some((c) => c.name === 'commute_id')) {
    db.exec('ALTER TABLE carpool_requests ADD COLUMN commute_id INTEGER REFERENCES published_commutes(id)');
  }
  const commuteCols = db.prepare('PRAGMA table_info(published_commutes)').all();
  const commuteColNames = new Set(commuteCols.map((c) => c.name));
  if (!commuteColNames.has('stopovers')) {
    db.exec("ALTER TABLE published_commutes ADD COLUMN stopovers TEXT DEFAULT '[]'");
  }
  if (!commuteColNames.has('route_label')) {
    db.exec("ALTER TABLE published_commutes ADD COLUMN route_label TEXT DEFAULT ''");
  }
  if (!commuteColNames.has('route_detail')) {
    db.exec("ALTER TABLE published_commutes ADD COLUMN route_detail TEXT DEFAULT ''");
  }
  const routeStorageCols = [
    ['source_lat', 'REAL'],
    ['source_lng', 'REAL'],
    ['dest_lat', 'REAL'],
    ['dest_lng', 'REAL'],
    ['stopover_coords', "TEXT DEFAULT '[]'"],
    ['route_polyline', 'TEXT'],
    ['route_distance_m', 'INTEGER'],
    ['route_duration_s', 'INTEGER'],
    ['route_type', "TEXT DEFAULT ''"],
    ['toll_info', "TEXT DEFAULT '{}'"],
    ['pickup_address', 'TEXT'],
    ['pickup_lat', 'REAL'],
    ['pickup_lng', 'REAL'],
    ['destination_address', 'TEXT'],
    ['destination_lat', 'REAL'],
    ['destination_lng', 'REAL'],
    ['distance_km', 'REAL'],
    ['estimated_duration', 'INTEGER'],
  ];
  for (const [col, type] of routeStorageCols) {
    if (!commuteColNames.has(col)) {
      db.exec(`ALTER TABLE published_commutes ADD COLUMN ${col} ${type}`);
    }
  }
  db.prepare("INSERT OR IGNORE INTO counters (name, value) VALUES ('published_commutes', 0)").run();
}

ensureCommuteSchema();

const migration = migrateFromJson(db, legacyJsonPath);
if (migration.migrated) {
  console.log(`[DB] Migrated ${migration.users} users from store.json → ${dbPath}`);
  console.log(`[DB] Backup saved: ${migration.backup}`);
}

function now() {
  return new Date().toISOString();
}

function nextId(table) {
  const counterName = table === 'employees' ? 'users' : table;
  db.prepare('UPDATE counters SET value = value + 1 WHERE name = ?').run(counterName);
  const row = db.prepare('SELECT value FROM counters WHERE name = ?').get(counterName);
  return row.value;
}

function parseJson(val, fallback = null) {
  if (val == null || val === '') return fallback;
  try {
    return JSON.parse(val);
  } catch {
    return fallback;
  }
}

function rowToEmployee(userRow, detailsRow) {
  if (!userRow) return null;
  const d = detailsRow || {};
  return {
    id: userRow.id,
    role: userRow.role,
    name: userRow.name,
    email: userRow.email,
    phone: userRow.phone,
    password_hash: userRow.password_hash,
    user_type: userRow.user_type,
    source: userRow.source,
    home_address: d.home_address || '',
    office_address: d.office_address || 'Company HQ, Bangalore',
    route_from: d.route_from || '',
    route_to: d.route_to || '',
    city: d.city || 'Bangalore',
    availability: d.availability || 'available',
    email_verified: !!userRow.email_verified,
    email_notifications: userRow.email_notifications !== 0,
    is_demo: !!userRow.is_demo,
    bio: d.bio || '',
    travel_preferences: d.travel_preferences || '',
    vehicle: parseJson(d.vehicle, null),
    recent_searches: parseJson(d.recent_searches, []),
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
  };
}

function getUserWithDetails(id) {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  if (!user) return null;
  let details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(id);
  if (!details) {
    ensureUserDetails(id, rowToEmployee(user, {}));
    details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(id);
  }
  return rowToEmployee(user, details);
}

function getUserWithDetailsByEmail(email) {
  const norm = normalizeEmail(email);
  const user = db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE').get(norm);
  if (!user) return null;
  let details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(user.id);
  if (!details) {
    ensureUserDetails(user.id, rowToEmployee(user, {}));
    details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(user.id);
  }
  return rowToEmployee(user, details);
}

function resetStore() {
  db.exec(`
    DELETE FROM notification_feedback;
    DELETE FROM email_queue;
    DELETE FROM notifications;
    DELETE FROM carpool_requests;
    DELETE FROM published_commutes;
    DELETE FROM user_details;
    DELETE FROM users;
    DELETE FROM otps;
    DELETE FROM verification_tokens;
    UPDATE counters SET value = 0;
  `);
}

// ─── Employees / Users ───

function findEmployeeById(id) {
  return getUserWithDetails(id);
}

function findEmployeeByEmail(email) {
  return getUserWithDetailsByEmail(email);
}

function findEmployeeByPhone(phone) {
  const user = db.prepare('SELECT * FROM users WHERE phone = ?').get(phone);
  if (!user) return null;
  const details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(user.id);
  return rowToEmployee(user, details);
}

function listAllEmployees({ emailNotificationsOnly = false } = {}) {
  let sql = 'SELECT * FROM users';
  if (emailNotificationsOnly) sql += ' WHERE email_notifications = 1 AND email_verified = 1';
  const users = db.prepare(sql).all();
  return users.map((u) => {
    const details = db.prepare('SELECT * FROM user_details WHERE user_id = ?').get(u.id);
    return rowToEmployee(u, details);
  });
}

function normalizePhoneDigits(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function createEmployee(data) {
  const id = nextId('employees');
  const ts = now();
  const email = data.email ? normalizeEmail(data.email) : data.email;
  const phone = normalizePhoneDigits(data.phone);
  const userType = data.user_type || (data.is_demo ? 'existing' : 'new');
  const source = data.source || (data.is_demo ? 'seed' : 'register');

  db.prepare(`
    INSERT INTO users (id, email, phone, name, password_hash, role, user_type, source,
      email_verified, email_notifications, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    email,
    phone,
    data.name,
    data.password_hash,
    data.role || 'employee',
    userType,
    source,
    data.email_verified ? 1 : 0,
    data.email_notifications !== false ? 1 : 0,
    data.is_demo ? 1 : 0,
    ts,
    ts
  );

  db.prepare(`
    INSERT INTO user_details (user_id, home_address, office_address, route_from, route_to, city, availability,
      bio, travel_preferences, vehicle, recent_searches)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.home_address || '',
    data.office_address || 'Company HQ, Bangalore',
    data.route_from || '',
    data.route_to || '',
    data.city || 'Bangalore',
    data.availability || 'available',
    data.bio || '',
    data.travel_preferences || '',
    data.vehicle ? JSON.stringify(data.vehicle) : null,
    data.recent_searches ? JSON.stringify(data.recent_searches) : null
  );

  return findEmployeeById(id);
}

function ensureUserDetails(id, existing) {
  const row = db.prepare('SELECT user_id FROM user_details WHERE user_id = ?').get(id);
  if (row) return;
  db.prepare(`
    INSERT INTO user_details (user_id, home_address, office_address, route_from, route_to, city, availability,
      bio, travel_preferences, vehicle, recent_searches)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    existing.home_address || '',
    existing.office_address || 'Company HQ, Bangalore',
    existing.route_from || '',
    existing.route_to || '',
    existing.city || 'Bangalore',
    existing.availability || 'available',
    existing.bio || '',
    existing.travel_preferences || '',
    existing.vehicle ? JSON.stringify(existing.vehicle) : null,
    existing.recent_searches ? JSON.stringify(existing.recent_searches) : null
  );
}

function updateEmployee(id, updates) {
  const existing = findEmployeeById(id);
  if (!existing) return null;

  ensureUserDetails(id, existing);

  const userFields = ['name', 'phone', 'role', 'user_type', 'source', 'email_verified', 'email_notifications', 'is_demo'];
  const detailFields = [
    'home_address', 'office_address', 'route_from', 'route_to', 'city', 'availability',
    'bio', 'travel_preferences', 'vehicle', 'recent_searches',
  ];

  const userUpdates = {};
  const detailUpdates = {};

  for (const [key, val] of Object.entries(updates)) {
    if (key === 'password_hash') userUpdates.password_hash = val;
    else if (key === 'email') userUpdates.email = normalizeEmail(val);
    else if (userFields.includes(key)) {
      if (key === 'email_verified' || key === 'email_notifications' || key === 'is_demo') {
        userUpdates[key] = val ? 1 : 0;
      } else {
        userUpdates[key] = val;
      }
    } else if (detailFields.includes(key)) {
      if (key === 'vehicle' || key === 'recent_searches') {
        detailUpdates[key] = val != null ? JSON.stringify(val) : null;
      } else {
        detailUpdates[key] = val;
      }
    }
  }

  if (userUpdates.phone) {
    const normalizedPhone = String(userUpdates.phone).replace(/\D/g, '').slice(-10);
    userUpdates.phone = normalizedPhone;
    const other = findEmployeeByPhone(normalizedPhone);
    if (other && other.id !== id) {
      const err = new Error('PHONE_IN_USE');
      err.code = 'PHONE_IN_USE';
      throw err;
    }
  }

  const ts = now();
  try {
    if (Object.keys(userUpdates).length) {
      const cols = Object.keys(userUpdates).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE users SET ${cols}, updated_at = ? WHERE id = ?`).run(
        ...Object.values(userUpdates),
        ts,
        id
      );
    } else {
      db.prepare('UPDATE users SET updated_at = ? WHERE id = ?').run(ts, id);
    }

    if (Object.keys(detailUpdates).length) {
      const cols = Object.keys(detailUpdates).map((k) => `${k} = ?`).join(', ');
      db.prepare(`UPDATE user_details SET ${cols} WHERE user_id = ?`).run(
        ...Object.values(detailUpdates),
        id
      );
    }

    return findEmployeeById(id);
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(e.message).includes('UNIQUE')) {
      const err = new Error('PHONE_IN_USE');
      err.code = 'PHONE_IN_USE';
      throw err;
    }
    throw e;
  }
}

function addRecentSearch(employeeId, search) {
  const employee = findEmployeeById(employeeId);
  if (!employee || !search?.route_from?.trim()) return null;

  const entry = {
    route_from: search.route_from.trim(),
    route_to: (search.route_to || '').trim(),
    city: (search.city || employee.city || '').trim(),
    searched_at: now(),
  };

  const list = Array.isArray(employee.recent_searches) ? employee.recent_searches : [];
  const filtered = list.filter(
    (s) => !(
      s.route_from === entry.route_from
      && s.route_to === entry.route_to
      && (s.city || '') === entry.city
    )
  );
  filtered.unshift(entry);

  return updateEmployee(employeeId, { recent_searches: filtered.slice(0, 8) });
}

function getRecentSearches(employeeId) {
  const employee = findEmployeeById(employeeId);
  if (!employee) return [];
  return Array.isArray(employee.recent_searches) ? employee.recent_searches : [];
}

function searchEmployees({ excludeId, city, route_from, route_to, availability }) {
  const all = listAllEmployees();
  return all.filter((e) => {
    if (e.id === excludeId) return false;
    if (city && !cityMatchesFilter(city, e.city)) return false;
    if (route_from && route_from.length >= 2 && !(e.route_from || '').toLowerCase().includes(route_from.toLowerCase())) return false;
    if (route_to && route_to.length >= 2 && !(e.route_to || '').toLowerCase().includes(route_to.toLowerCase())) return false;
    if (availability && availability !== 'all') {
      if (e.availability !== availability) return false;
    } else if (!availability) {
      if (e.availability === 'unavailable') return false;
    }
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));
}

// ─── Carpool requests ───

function enrichRequest(request) {
  const sender = findEmployeeById(request.sender_id);
  const receiver = findEmployeeById(request.receiver_id);
  const commute = request.commute_id ? findCommuteById(request.commute_id) : null;
  return {
    ...request,
    sender_name: sender?.name,
    receiver_name: receiver?.name,
    sender_phone: sender?.phone,
    sender_route_from: sender?.route_from,
    sender_route_to: sender?.route_to,
    commute_route_from: commute?.route_from || null,
    commute_route_to: commute?.route_to || null,
    commute_departure_at: commute?.departure_at || null,
  };
}

function findRequestById(id) {
  const r = db.prepare('SELECT * FROM carpool_requests WHERE id = ?').get(id);
  return r || null;
}

function findPendingRequest(senderId, receiverId) {
  return db.prepare(`
    SELECT * FROM carpool_requests
    WHERE sender_id = ? AND receiver_id = ? AND status = 'pending'
  `).get(senderId, receiverId) || null;
}

function createRequest(data) {
  const id = nextId('carpool_requests');
  const ts = now();
  db.prepare(`
    INSERT INTO carpool_requests (id, sender_id, receiver_id, commute_id, status, message, created_at, updated_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
  `).run(
    id,
    data.sender_id,
    data.receiver_id,
    data.commute_id || null,
    data.message,
    ts,
    ts
  );
  return enrichRequest(findRequestById(id));
}

function updateRequest(id, updates) {
  const existing = findRequestById(id);
  if (!existing) return null;
  const cols = Object.keys(updates).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE carpool_requests SET ${cols}, updated_at = ? WHERE id = ?`).run(
    ...Object.values(updates),
    now(),
    id
  );
  return enrichRequest(findRequestById(id));
}

function deleteRequest(id) {
  const result = db.prepare('DELETE FROM carpool_requests WHERE id = ?').run(id);
  return result.changes > 0;
}

function getRequests({ userId, type }) {
  let rows;
  if (type === 'sent') {
    rows = db.prepare('SELECT * FROM carpool_requests WHERE sender_id = ?').all(userId);
  } else if (type === 'received') {
    rows = db.prepare('SELECT * FROM carpool_requests WHERE receiver_id = ?').all(userId);
  } else if (type === 'pending') {
    rows = db.prepare(`
      SELECT * FROM carpool_requests WHERE receiver_id = ? AND status = 'pending'
    `).all(userId);
  } else {
    rows = db.prepare(`
      SELECT * FROM carpool_requests WHERE sender_id = ? OR receiver_id = ?
    `).all(userId, userId);
  }
  return rows
    .map(enrichRequest)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
}

function countCompletedCommutes(userId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM carpool_requests
    WHERE status = 'accepted' AND (sender_id = ? OR receiver_id = ?)
  `).get(userId, userId);
  return row.c;
}

// ─── Published commutes ───

function rowToCommute(row) {
  if (!row) return null;
  const driver = findEmployeeById(row.driver_id);
  return {
    id: row.id,
    driver_id: row.driver_id,
    driver_name: driver?.name || 'Unknown',
    driver_email: driver?.email || null,
    driver_phone: driver?.phone || null,
    driver_vehicle: driver?.vehicle || null,
    driver_city: driver?.city || row.city || '',
    route_from: row.route_from,
    route_to: row.route_to,
    city: row.city || driver?.city || '',
    departure_at: row.departure_at,
    seats_available: row.seats_available,
    price_per_seat: row.price_per_seat,
    notes: row.notes || '',
    stopovers: (() => {
      try { return JSON.parse(row.stopovers || '[]'); } catch { return []; }
    })(),
    route_label: row.route_label || '',
    route_detail: row.route_detail || '',
    source_lat: row.source_lat ?? row.pickup_lat ?? null,
    source_lng: row.source_lng ?? row.pickup_lng ?? null,
    dest_lat: row.dest_lat ?? row.destination_lat ?? null,
    dest_lng: row.dest_lng ?? row.destination_lng ?? null,
    pickup_address: row.pickup_address || row.route_from || '',
    pickup_lat: row.pickup_lat ?? row.source_lat ?? null,
    pickup_lng: row.pickup_lng ?? row.source_lng ?? null,
    destination_address: row.destination_address || row.route_to || '',
    destination_lat: row.destination_lat ?? row.dest_lat ?? null,
    destination_lng: row.destination_lng ?? row.dest_lng ?? null,
    stopover_coords: parseJson(row.stopover_coords, []),
    route_polyline: row.route_polyline || null,
    route_distance_m: row.route_distance_m ?? null,
    route_duration_s: row.route_duration_s ?? null,
    distance_km: row.distance_km ?? (row.route_distance_m != null ? row.route_distance_m / 1000 : null),
    estimated_duration: row.estimated_duration ?? row.route_duration_s ?? null,
    route_type: row.route_type || '',
    toll_info: parseJson(row.toll_info, {}),
    smoking: row.smoking,
    music: row.music,
    pets: row.pets,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function findCommuteById(id) {
  const row = db.prepare('SELECT * FROM published_commutes WHERE id = ?').get(id);
  return rowToCommute(row);
}

function createCommute(data) {
  const id = nextId('published_commutes');
  const ts = now();
  const sourceLat = data.source_lat ?? data.pickup_lat ?? null;
  const sourceLng = data.source_lng ?? data.pickup_lng ?? null;
  const destLat = data.dest_lat ?? data.destination_lat ?? null;
  const destLng = data.dest_lng ?? data.destination_lng ?? null;
  const distanceKm = data.distance_km ?? (data.route_distance_m != null ? data.route_distance_m / 1000 : null);
  db.prepare(`
    INSERT INTO published_commutes (
      id, driver_id, route_from, route_to, city, departure_at,
      seats_available, price_per_seat, notes, stopovers, route_label, route_detail,
      source_lat, source_lng, dest_lat, dest_lng, stopover_coords,
      route_polyline, route_distance_m, route_duration_s, route_type, toll_info,
      pickup_address, pickup_lat, pickup_lng, destination_address, destination_lat, destination_lng,
      distance_km, estimated_duration,
      smoking, music, pets, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(
    id,
    data.driver_id,
    data.route_from,
    data.route_to,
    data.city || '',
    data.departure_at,
    data.seats_available,
    data.price_per_seat ?? 0,
    data.notes || '',
    JSON.stringify(Array.isArray(data.stopovers) ? data.stopovers : []),
    data.route_label || '',
    data.route_detail || '',
    sourceLat,
    sourceLng,
    destLat,
    destLng,
    JSON.stringify(Array.isArray(data.stopover_coords) ? data.stopover_coords : []),
    data.route_polyline || null,
    data.route_distance_m ?? null,
    data.route_duration_s ?? null,
    data.route_type || '',
    JSON.stringify(data.toll_info && typeof data.toll_info === 'object' ? data.toll_info : {}),
    data.pickup_address || data.route_from || '',
    sourceLat,
    sourceLng,
    data.destination_address || data.route_to || '',
    destLat,
    destLng,
    distanceKm,
    data.estimated_duration ?? data.route_duration_s ?? null,
    data.smoking || 'not_allowed',
    data.music || 'any',
    data.pets || 'not_allowed',
    ts,
    ts
  );
  return findCommuteById(id);
}

function updateCommute(id, updates) {
  const existing = db.prepare('SELECT * FROM published_commutes WHERE id = ?').get(id);
  if (!existing) return null;
  const allowed = [
    'route_from', 'route_to', 'city', 'departure_at', 'seats_available',
    'price_per_seat', 'notes', 'stopovers', 'route_label', 'route_detail',
    'source_lat', 'source_lng', 'dest_lat', 'dest_lng', 'stopover_coords',
    'route_polyline', 'route_distance_m', 'route_duration_s', 'route_type', 'toll_info',
    'pickup_address', 'pickup_lat', 'pickup_lng', 'destination_address', 'destination_lat', 'destination_lng',
    'distance_km', 'estimated_duration',
    'smoking', 'music', 'pets', 'status',
  ];
  const filtered = {};
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'stopovers') {
        filtered[key] = JSON.stringify(Array.isArray(updates[key]) ? updates[key] : []);
      } else if (key === 'stopover_coords') {
        filtered[key] = JSON.stringify(Array.isArray(updates[key]) ? updates[key] : []);
      } else if (key === 'toll_info') {
        filtered[key] = JSON.stringify(updates[key] && typeof updates[key] === 'object' ? updates[key] : {});
      } else {
        filtered[key] = updates[key];
      }
    }
  }
  if (Object.keys(filtered).length === 0) return findCommuteById(id);
  const cols = Object.keys(filtered).map((k) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE published_commutes SET ${cols}, updated_at = ? WHERE id = ?`).run(
    ...Object.values(filtered),
    now(),
    id
  );
  return findCommuteById(id);
}

function deleteCommute(id) {
  db.prepare(`
    UPDATE published_commutes SET status = 'cancelled', updated_at = ? WHERE id = ?
  `).run(now(), id);
  return findCommuteById(id);
}

function listCommutesByDriver(driverId, { includeCancelled = false, includeAll = false } = {}) {
  const rows = db.prepare(`
    SELECT * FROM published_commutes WHERE driver_id = ? ORDER BY created_at DESC
  `).all(driverId);
  const commutes = rows.map(rowToCommute);
  if (includeAll || includeCancelled) return commutes;
  return commutes.filter((c) => {
    const s = (c.status || 'active').toLowerCase();
    return s === 'active' || s === 'upcoming' || s === 'in_progress';
  });
}

function expireStaleDriverCommutes(driverId) {
  const { shouldAutoComplete } = require('../utils/driverCommuteStatus');
  const commutes = listCommutesByDriver(driverId, { includeAll: true });
  let count = 0;
  for (const c of commutes) {
    if (shouldAutoComplete(c)) {
      updateCommute(c.id, { status: 'completed' });
      count += 1;
    }
  }
  return count;
}

function countAcceptedRequestsByCommute(commuteIds = []) {
  if (!commuteIds.length) return {};
  const placeholders = commuteIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT commute_id FROM carpool_requests
    WHERE commute_id IN (${placeholders}) AND status = 'accepted'
  `).all(...commuteIds);
  const counts = {};
  for (const row of rows) {
    if (!row.commute_id) continue;
    counts[row.commute_id] = (counts[row.commute_id] || 0) + 1;
  }
  return counts;
}

function searchCommutes({
  excludeDriverId,
  city,
  route_from,
  route_to,
  date,
  limit = 40,
} = {}) {
  const nowIso = now();
  let rows = db.prepare(`
    SELECT * FROM published_commutes
    WHERE status IN ('active', 'upcoming') AND seats_available > 0 AND departure_at >= ?
    ORDER BY created_at DESC
  `).all(nowIso);

  rows = rows.filter((row) => {
    if (excludeDriverId != null && isCommuteOwnedByUser(row, excludeDriverId)) return false;
    if (city && !cityMatchesFilter(city, row.city)) return false;
    if ((route_from || route_to) && !commuteMatchesRouteFilters(route_from, route_to, row)) return false;
    if (date) {
      const day = row.departure_at.slice(0, 10);
      if (day !== date) return false;
    }
    return true;
  });

  return rows.slice(0, limit).map(rowToCommute);
}

// ─── Notifications ───

function createNotification(data) {
  const id = nextId('notifications');
  const ts = now();
  db.prepare(`
    INSERT INTO notifications (id, employee_id, type, title, message, related_request_id, is_read, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 0, ?)
  `).run(
    id,
    data.employee_id,
    data.type,
    data.title,
    data.message,
    data.related_request_id || null,
    ts
  );
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
}

function getNotifications(employeeId, { unreadOnly } = {}) {
  let rows;
  if (unreadOnly) {
    rows = db.prepare(`
      SELECT * FROM notifications WHERE employee_id = ? AND is_read = 0 ORDER BY created_at DESC LIMIT 50
    `).all(employeeId);
  } else {
    rows = db.prepare(`
      SELECT * FROM notifications WHERE employee_id = ? ORDER BY created_at DESC LIMIT 50
    `).all(employeeId);
  }
  return rows.map((n) => ({ ...n, is_read: n.is_read ? 1 : 0 }));
}

function countUnreadNotifications(employeeId) {
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM notifications WHERE employee_id = ? AND is_read = 0
  `).get(employeeId);
  return row.c;
}

function findNotificationById(id) {
  return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id) || null;
}

function markNotificationRead(id) {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
  return findNotificationById(id);
}

function markAllNotificationsRead(employeeId) {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE employee_id = ?').run(employeeId);
}

// ─── Email queue ───

function enqueueEmail({ userId, toEmail, subject, html, emailType, notificationId }) {
  const id = nextId('email_queue');
  const ts = now();
  db.prepare(`
    INSERT INTO email_queue (id, user_id, to_email, subject, html, email_type, notification_id, status, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?)
  `).run(id, userId, toEmail, subject, html, emailType || 'notification', notificationId || null, ts);
  return db.prepare('SELECT * FROM email_queue WHERE id = ?').get(id);
}

function getPendingEmails(limit = 10) {
  return db.prepare(`
    SELECT * FROM email_queue WHERE status = 'pending' AND attempts < 5
    ORDER BY created_at ASC LIMIT ?
  `).all(limit);
}

function markEmailSent(id) {
  db.prepare(`
    UPDATE email_queue SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ?
  `).run(now(), id);
}

function markEmailFailed(id, error) {
  db.prepare(`
    UPDATE email_queue SET status = 'pending', attempts = attempts + 1, last_error = ?
    WHERE id = ?
  `).run(error, id);
  const row = db.prepare('SELECT attempts FROM email_queue WHERE id = ?').get(id);
  if (row && row.attempts >= 5) {
    db.prepare(`UPDATE email_queue SET status = 'failed' WHERE id = ?`).run(id);
  }
}

function markEmailSkipped(id, reason) {
  db.prepare(`
    UPDATE email_queue SET status = 'skipped', last_error = ?, sent_at = ? WHERE id = ?
  `).run(reason, now(), id);
}

function getEmailQueueStats() {
  const rows = db.prepare(`
    SELECT status, COUNT(*) AS c FROM email_queue GROUP BY status
  `).all();
  const stats = { pending: 0, sent: 0, failed: 0, skipped: 0 };
  for (const r of rows) stats[r.status] = r.c;
  return stats;
}

function getRecentEmailDeliveries(limit = 20) {
  return db.prepare(`
    SELECT id, user_id, to_email, subject, email_type, status, attempts, last_error, created_at, sent_at
    FROM email_queue ORDER BY id DESC LIMIT ?
  `).all(limit);
}

// ─── Feedback ───

function createNotificationFeedback({ userId, notificationId, emailQueueId, rating, comment }) {
  const id = nextId('notification_feedback');
  const ts = now();
  db.prepare(`
    INSERT INTO notification_feedback (id, user_id, notification_id, email_queue_id, rating, comment, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, notificationId || null, emailQueueId || null, rating || null, comment || '', ts);
  return db.prepare('SELECT * FROM notification_feedback WHERE id = ?').get(id);
}

function getFeedbackSummary() {
  const avg = db.prepare(`
    SELECT AVG(rating) AS avg_rating, COUNT(*) AS total FROM notification_feedback WHERE rating IS NOT NULL
  `).get();
  const recent = db.prepare(`
    SELECT f.*, u.name, u.email FROM notification_feedback f
    JOIN users u ON u.id = f.user_id
    ORDER BY f.created_at DESC LIMIT 20
  `).all();
  return { avgRating: avg.avg_rating ? Math.round(avg.avg_rating * 10) / 10 : null, total: avg.total, recent };
}

// ─── OTP ───

function saveOtp(data) {
  db.prepare(`
    DELETE FROM otps WHERE identifier = ? AND channel = ? AND purpose = ?
  `).run(data.identifier, data.channel, data.purpose);
  db.prepare(`
    INSERT INTO otps (identifier, channel, purpose, code, expires_at, attempts, created_at)
    VALUES (?, ?, ?, ?, ?, 0, ?)
  `).run(data.identifier, data.channel, data.purpose, data.code, data.expires_at, now());
  return data;
}

function findOtp(identifier, channel, purpose) {
  return db.prepare(`
    SELECT * FROM otps WHERE identifier = ? AND channel = ? AND purpose = ?
  `).get(identifier, channel, purpose) || null;
}

function deleteOtp(identifier, channel, purpose) {
  db.prepare(`
    DELETE FROM otps WHERE identifier = ? AND channel = ? AND purpose = ?
  `).run(identifier, channel, purpose);
}

function incrementOtpAttempts(identifier, channel, purpose) {
  db.prepare(`
    UPDATE otps SET attempts = attempts + 1 WHERE identifier = ? AND channel = ? AND purpose = ?
  `).run(identifier, channel, purpose);
}

function countRecentOtps(identifier, sinceMinutes = 10) {
  const cutoff = new Date(Date.now() - sinceMinutes * 60 * 1000).toISOString();
  const row = db.prepare(`
    SELECT COUNT(*) AS c FROM otps WHERE identifier = ? AND created_at > ?
  `).get(identifier, cutoff);
  return row.c;
}

function createVerificationToken(identifier, channel, purpose) {
  const crypto = require('crypto');
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('DELETE FROM verification_tokens WHERE identifier = ?').run(identifier);
  db.prepare(`
    INSERT INTO verification_tokens (token, identifier, channel, purpose, expires_at, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(
    token,
    identifier,
    channel,
    purpose,
    new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    now()
  );
  return token;
}

function consumeVerificationToken(token, purpose) {
  const row = db.prepare(`
    SELECT * FROM verification_tokens WHERE token = ? AND purpose = ? AND expires_at > ?
  `).get(token, purpose, now());
  if (!row) return null;
  db.prepare('DELETE FROM verification_tokens WHERE token = ?').run(token);
  return row;
}

function getDbPath() {
  return dbPath;
}

function getPlatformStats() {
  const members = db.prepare('SELECT COUNT(*) AS c FROM employees').get()?.c ?? 0;
  const activeRides = db.prepare(`
    SELECT COUNT(*) AS c FROM published_commutes
    WHERE status IN ('active', 'upcoming')
  `).get()?.c ?? 0;
  const completedRides = db.prepare(`
    SELECT COUNT(*) AS c FROM published_commutes WHERE status = 'completed'
  `).get()?.c ?? 0;
  const totalPublished = db.prepare('SELECT COUNT(*) AS c FROM published_commutes').get()?.c ?? 0;
  const carpoolsMatched = db.prepare(`
    SELECT COUNT(*) AS c FROM carpool_requests WHERE status = 'accepted'
  `).get()?.c ?? 0;
  const pendingRequests = db.prepare(`
    SELECT COUNT(*) AS c FROM carpool_requests WHERE status = 'pending'
  `).get()?.c ?? 0;
  const seatsAvailable = db.prepare(`
    SELECT COALESCE(SUM(seats_available), 0) AS s FROM published_commutes
    WHERE status IN ('active', 'upcoming')
  `).get()?.s ?? 0;
  const citiesRow = db.prepare(`
    SELECT COUNT(DISTINCT city) AS c FROM employees
    WHERE city IS NOT NULL AND TRIM(city) != ''
  `).get();
  return {
    members,
    active_rides: activeRides,
    completed_rides: completedRides,
    total_published: totalPublished,
    carpools_matched: carpoolsMatched,
    pending_requests: pendingRequests,
    seats_available: seatsAvailable,
    cities: citiesRow?.c ?? 0,
    updated_at: now(),
  };
}

module.exports = {
  resetStore,
  normalizeEmail,
  findEmployeeById,
  findEmployeeByEmail,
  findEmployeeByPhone,
  listAllEmployees,
  createEmployee,
  updateEmployee,
  addRecentSearch,
  getRecentSearches,
  searchEmployees,
  findRequestById,
  findPendingRequest,
  createRequest,
  updateRequest,
  deleteRequest,
  getRequests,
  countCompletedCommutes,
  findCommuteById,
  createCommute,
  updateCommute,
  deleteCommute,
  listCommutesByDriver,
  expireStaleDriverCommutes,
  countAcceptedRequestsByCommute,
  searchCommutes,
  createNotification,
  getNotifications,
  countUnreadNotifications,
  findNotificationById,
  markNotificationRead,
  markAllNotificationsRead,
  enqueueEmail,
  getPendingEmails,
  markEmailSent,
  markEmailFailed,
  markEmailSkipped,
  getEmailQueueStats,
  getRecentEmailDeliveries,
  createNotificationFeedback,
  getFeedbackSummary,
  saveOtp,
  findOtp,
  deleteOtp,
  incrementOtpAttempts,
  countRecentOtps,
  createVerificationToken,
  consumeVerificationToken,
  getDbPath,
  getPlatformStats,
};
