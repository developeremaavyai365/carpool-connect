/** SQLite schema — users, details, requests, notifications, email queue, feedback */

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee',
  user_type TEXT NOT NULL DEFAULT 'new',
  source TEXT NOT NULL DEFAULT 'register',
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_notifications INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_details (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  home_address TEXT DEFAULT '',
  office_address TEXT DEFAULT 'Company HQ, Bangalore',
  route_from TEXT DEFAULT '',
  route_to TEXT DEFAULT '',
  city TEXT DEFAULT 'Bangalore',
  availability TEXT DEFAULT 'available',
  bio TEXT DEFAULT '',
  travel_preferences TEXT DEFAULT '',
  vehicle TEXT,
  recent_searches TEXT
);

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

CREATE TABLE IF NOT EXISTS carpool_requests (
  id INTEGER PRIMARY KEY,
  sender_id INTEGER NOT NULL REFERENCES users(id),
  receiver_id INTEGER NOT NULL REFERENCES users(id),
  commute_id INTEGER REFERENCES published_commutes(id),
  status TEXT NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  employee_id INTEGER NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  related_request_id INTEGER,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS email_queue (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  to_email TEXT NOT NULL,
  subject TEXT NOT NULL,
  html TEXT NOT NULL,
  email_type TEXT NOT NULL DEFAULT 'notification',
  notification_id INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL,
  sent_at TEXT
);

CREATE TABLE IF NOT EXISTS notification_feedback (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  notification_id INTEGER,
  email_queue_id INTEGER,
  rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  comment TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS otps (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE(identifier, channel, purpose)
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL UNIQUE,
  identifier TEXT NOT NULL,
  channel TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY,
  value INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_type ON users(user_type);
CREATE INDEX IF NOT EXISTS idx_email_queue_status ON email_queue(status);
CREATE INDEX IF NOT EXISTS idx_notifications_employee ON notifications(employee_id);
CREATE INDEX IF NOT EXISTS idx_commutes_driver ON published_commutes(driver_id);
CREATE INDEX IF NOT EXISTS idx_commutes_departure ON published_commutes(departure_at);
CREATE INDEX IF NOT EXISTS idx_commutes_status ON published_commutes(status);
`;

const DEFAULT_COUNTERS = [
  'users', 'carpool_requests', 'notifications', 'email_queue',
  'notification_feedback', 'published_commutes',
];

function initSchema(db) {
  db.exec(SCHEMA_SQL);
  const insertCounter = db.prepare(
    'INSERT OR IGNORE INTO counters (name, value) VALUES (?, 0)'
  );
  for (const name of DEFAULT_COUNTERS) {
    insertCounter.run(name);
  }
}

module.exports = { SCHEMA_SQL, initSchema, DEFAULT_COUNTERS };
