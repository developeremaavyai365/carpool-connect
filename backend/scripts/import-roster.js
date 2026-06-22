require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const bcrypt = require('bcryptjs');
const db = require('../src/database');
const { normalizeEmail } = require('../src/utils/emailNormalize');
const { parseCommuteFields } = require('../src/utils/rosterParse');
const roster = require('../data/logica-roster');

const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || 'Logica@123';
const PHONE_RE = /^[6-9]\d{9}$/;

function normalizePhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function upsertEmployee(row, passwordHash) {
  const email = normalizeEmail(row.email);
  const phone = normalizePhone(row.phone);
  const commute = parseCommuteFields(row.home_address);

  if (!email || !email.includes('@')) {
    return { status: 'error', name: row.name, reason: 'Invalid email' };
  }
  if (!PHONE_RE.test(phone)) {
    return { status: 'error', name: row.name, reason: `Invalid phone: ${row.phone}` };
  }

  const payload = {
    name: row.name.trim(),
    email,
    phone,
    ...commute,
    password_hash: passwordHash,
    email_verified: true,
    is_demo: false,
    user_type: 'existing',
    source: 'import',
    bio: '',
    travel_preferences: '',
  };

  const byEmail = db.findEmployeeByEmail(email);
  const byPhone = db.findEmployeeByPhone(phone);

  if (byEmail && byPhone && byEmail.id !== byPhone.id) {
    return {
      status: 'error',
      name: row.name,
      reason: `Email and phone belong to different accounts (${email} / ${phone})`,
    };
  }

  const existing = byEmail || byPhone;
  if (existing) {
    db.updateEmployee(existing.id, payload);
    return { status: 'updated', name: row.name, email, city: commute.city, route_from: commute.route_from };
  }

  db.createEmployee(payload);
  return { status: 'created', name: row.name, email, city: commute.city, route_from: commute.route_from };
}

function importRoster() {
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 12);
  const summary = { created: 0, updated: 0, errors: [] };

  for (const row of roster) {
    const result = upsertEmployee(row, passwordHash);
    if (result.status === 'created') summary.created += 1;
    else if (result.status === 'updated') summary.updated += 1;
    else summary.errors.push(result);
  }

  return summary;
}

if (require.main === module) {
  const summary = importRoster();
  console.log(`\nRoster import complete (${roster.length} rows)`);
  console.log(`  Created: ${summary.created}`);
  console.log(`  Updated: ${summary.updated}`);
  console.log(`  Errors:  ${summary.errors.length}`);
  if (summary.errors.length) {
    console.log('\nErrors:');
    for (const e of summary.errors) {
      console.log(`  - ${e.name}: ${e.reason}`);
    }
  }
  console.log(`\nDefault login password: ${DEFAULT_PASSWORD}`);
  console.log('Employees can sign in with their work email and this password.\n');
}

module.exports = { importRoster, upsertEmployee, DEFAULT_PASSWORD };
