require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { getSupabaseAdmin } = require('../src/lib/supabase');

const ROOT = path.join(__dirname, '..', '..');
const MIGRATION = path.join(ROOT, 'supabase', 'migrations', '001_initial_schema.sql');

function getProjectRef() {
  const url = process.env.SUPABASE_URL || '';
  const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  return match?.[1] || '';
}

function buildDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = process.env.SUPABASE_DB_PASSWORD;
  const ref = getProjectRef();
  if (!password || !ref) return null;

  if (process.env.SUPABASE_DB_HOST) {
    const host = process.env.SUPABASE_DB_HOST;
    const port = process.env.SUPABASE_DB_PORT || '6543';
    const user = process.env.SUPABASE_DB_USER || `postgres.${ref}`;
    const db = process.env.SUPABASE_DB_NAME || 'postgres';
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
  }

  const host = `db.${ref}.supabase.co`;
  const port = process.env.SUPABASE_DB_PORT || '5432';
  const user = process.env.SUPABASE_DB_USER || 'postgres';
  const db = process.env.SUPABASE_DB_NAME || 'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${db}`;
}

async function tableExists(client, table) {
  const { rows } = await client.query(
    `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return rows.length > 0;
}

async function runMigration(client) {
  const sql = fs.readFileSync(MIGRATION, 'utf8');
  try {
    await client.query(sql);
    return;
  } catch (err) {
    if (!err.message?.includes('already exists') && !err.message?.includes('already member of publication')) {
      // Fall back to statement-by-statement for partial/idempotent reruns
    }
  }

  const statements = sql
    .split(/;\s*(?=\n|$)/)
    .map((s) => s.trim())
    .filter((s) => s && !/^--/.test(s));

  for (const statement of statements) {
    try {
      await client.query(`${statement};`);
    } catch (err) {
      const ignorable = [
        'already exists',
        'duplicate key',
        'is already member of publication',
      ];
      if (ignorable.some((msg) => err.message?.includes(msg))) {
        console.log(`  skip: ${err.message.split('\n')[0]}`);
        continue;
      }
      throw new Error(`${err.message}\n\nStatement:\n${statement.slice(0, 200)}...`);
    }
  }
}

async function verifySupabaseApi() {
  const admin = getSupabaseAdmin();
  const { error } = await admin.from('users').select('id').limit(1);
  if (!error) return { ok: true, migrated: true };
  if (error.code === 'PGRST205' || error.message?.includes('Could not find the table')) {
    return { ok: true, migrated: false };
  }
  throw new Error(`Supabase API check failed: ${error.message}`);
}

async function seedData() {
  const { ensureDemoUsers } = require('../src/seed');
  const count = await ensureDemoUsers();
  console.log(`Demo users synced: ${count}`);

  try {
    const { importRoster } = require('./import-roster');
    const summary = await importRosterAsync();
    console.log(`Roster: created ${summary.created}, updated ${summary.updated}, errors ${summary.errors.length}`);
  } catch (err) {
    console.warn('Roster import skipped or partial:', err.message);
  }
}

async function importRosterAsync() {
  const bcrypt = require('bcryptjs');
  const db = require('../src/database');
  const { normalizeEmail } = require('../src/utils/emailNormalize');
  const { parseCommuteFields } = require('../src/utils/rosterParse');
  const { createAuthUser } = require('../src/services/supabaseAuth');
  const { isSupabaseConfigured } = require('../src/lib/supabase');
  const roster = require('../data/logica-roster');

  const DEFAULT_PASSWORD = process.env.IMPORT_DEFAULT_PASSWORD || 'Logica@123';
  const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, 12);
  const summary = { created: 0, updated: 0, errors: [] };
  const PHONE_RE = /^[6-9]\d{9}$/;

  function normalizePhone(raw) {
    const digits = String(raw || '').replace(/\D/g, '');
    if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
  }

  for (const row of roster) {
    const email = normalizeEmail(row.email);
    const phone = normalizePhone(row.phone);
    const commute = parseCommuteFields(row.home_address);

    if (!email?.includes('@')) {
      summary.errors.push({ name: row.name, reason: 'Invalid email' });
      continue;
    }
    if (!PHONE_RE.test(phone)) {
      summary.errors.push({ name: row.name, reason: `Invalid phone: ${row.phone}` });
      continue;
    }

    const payload = {
      name: row.name.trim(),
      email,
      phone,
      ...commute,
      email_verified: true,
      is_demo: false,
      user_type: 'existing',
      source: 'import',
      bio: '',
      travel_preferences: '',
    };

    const byEmail = await db.findEmployeeByEmail(email);
    const byPhone = await db.findEmployeeByPhone(phone);
    const existing = byEmail || byPhone;

    if (existing) {
      if (isSupabaseConfigured() && !existing.auth_id) {
        try {
          const authUser = await createAuthUser({ email, password: DEFAULT_PASSWORD, name: row.name });
          if (authUser?.id) payload.auth_id = authUser.id;
        } catch (e) {
          if (e.status !== 409) summary.errors.push({ name: row.name, reason: e.message });
        }
      }
      if (!isSupabaseConfigured()) payload.password_hash = passwordHash;
      await db.updateEmployee(existing.id, payload);
      summary.updated += 1;
    } else {
      if (isSupabaseConfigured()) {
        try {
          const authUser = await createAuthUser({ email, password: DEFAULT_PASSWORD, name: row.name });
          if (authUser?.id) payload.auth_id = authUser.id;
        } catch (e) {
          if (e.status !== 409) {
            summary.errors.push({ name: row.name, reason: e.message });
            continue;
          }
        }
      } else {
        payload.password_hash = passwordHash;
      }
      await db.createEmployee(payload);
      summary.created += 1;
    }
  }
  return summary;
}

async function main() {
  console.log('\n=== CarPool Connect — Supabase activation ===\n');

  const required = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error('Missing env:', missing.join(', '));
    process.exit(1);
  }

  console.log('Project:', process.env.SUPABASE_URL);

  let apiCheck;
  try {
    apiCheck = await verifySupabaseApi();
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }

  if (apiCheck.migrated) {
    console.log('Schema: tables already exist');
  } else {
    const dbUrl = buildDatabaseUrl();
    if (!dbUrl) {
      console.error(`
Schema not found. To run the migration automatically, add your database password to backend/.env:

  SUPABASE_DB_PASSWORD=your-database-password

(Find it in Supabase → Project Settings → Database → Database password)

Then run:  npm run activate:supabase --prefix backend

Or paste supabase/migrations/001_initial_schema.sql into Supabase SQL Editor manually.
`);
      process.exit(1);
    }

    console.log('Running migration...');
    const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    try {
      await runMigration(client);
      const ok = await tableExists(client, 'users');
      if (!ok) throw new Error('Migration finished but users table missing');
      console.log('Schema: migration applied');
    } finally {
      await client.end();
    }
  }

  console.log('Seeding demo users + roster...');
  await seedData();

  console.log('\nDone. Restart backend and frontend, then check:');
  console.log('  curl http://localhost:3001/api/health');
  console.log('  (expect "engine": "supabase", "realtime": "supabase")\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Activation failed:', err.message);
  process.exit(1);
});
