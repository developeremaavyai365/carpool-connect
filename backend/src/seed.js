require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('./database');
const { normalizeEmail } = require('./utils/emailNormalize');
const { isSupabaseConfigured } = require('./lib/supabase');
const { createAuthUser, updateAuthPassword } = require('./services/supabaseAuth');

const DEMO_PASSWORD = 'demo123';

const DEMO_EMPLOYEES = [
  {
    name: 'Priya Sharma',
    email: 'priya.sharma@company.com',
    phone: '9812345670',
    home_address: 'Andheri West, Mumbai',
    office_address: 'BKC Office, Mumbai',
    route_from: 'Andheri West',
    route_to: 'BKC',
    city: 'Mumbai',
    availability: 'available',
  },
  {
    name: 'Rajesh Kumar',
    email: 'rajesh.kumar@company.com',
    phone: '9123456789',
    home_address: 'Powai, Mumbai',
    office_address: 'BKC Office, Mumbai',
    route_from: 'Powai',
    route_to: 'BKC',
    city: 'Mumbai',
    availability: 'available',
  },
  {
    name: 'Ananya Reddy',
    email: 'ananya.reddy@company.com',
    phone: '9988776655',
    home_address: 'Hitech City, Hyderabad',
    office_address: 'Gachibowli Office',
    route_from: 'Hitech City',
    route_to: 'Gachibowli',
    city: 'Hyderabad',
    availability: 'limited',
  },
  {
    name: 'Vikram Singh',
    email: 'vikram.singh@company.com',
    phone: '9876512345',
    home_address: 'Whitefield, Bangalore',
    office_address: 'Electronic City Office',
    route_from: 'Whitefield',
    route_to: 'Electronic City',
    city: 'Bangalore',
    availability: 'available',
  },
  {
    name: 'Meera Patel',
    email: 'meera.patel@company.com',
    phone: '9765432109',
    home_address: 'Satellite, Ahmedabad',
    office_address: 'SG Highway Office',
    route_from: 'Satellite',
    route_to: 'SG Highway',
    city: 'Ahmedabad',
    availability: 'available',
  },
];

async function ensureAuthUser(email, password, name) {
  if (!isSupabaseConfigured()) return null;
  try {
    const user = await createAuthUser({ email, password, name });
    return user?.id || null;
  } catch (err) {
    if (err.status === 409) return null;
    throw err;
  }
}

async function ensureDemoUsers() {
  const password_hash = bcrypt.hashSync(DEMO_PASSWORD, 12);
  let updated = 0;

  for (const emp of DEMO_EMPLOYEES) {
    const existing = await db.findEmployeeByEmail(emp.email);
    if (!existing) {
      let authId = null;
      if (isSupabaseConfigured()) {
        authId = await ensureAuthUser(emp.email, DEMO_PASSWORD, emp.name);
      }
      await db.createEmployee({
        ...emp,
        auth_id: authId,
        password_hash: isSupabaseConfigured() ? undefined : password_hash,
        email_verified: true,
        is_demo: true,
        user_type: 'existing',
        source: 'seed',
      });
      updated += 1;
    } else if (existing.is_demo !== false) {
      if (isSupabaseConfigured() && !existing.auth_id) {
        const authId = await ensureAuthUser(emp.email, DEMO_PASSWORD, emp.name);
        if (authId) {
          await db.updateEmployee(existing.id, { auth_id: authId });
        }
      } else if (isSupabaseConfigured() && existing.auth_id) {
        await updateAuthPassword(existing.auth_id, DEMO_PASSWORD).catch(() => {});
      }
      await db.updateEmployee(existing.id, {
        ...emp,
        ...(isSupabaseConfigured() ? {} : { password_hash }),
        email_verified: true,
        is_demo: true,
      });
      updated += 1;
    }
  }
  return updated;
}

async function ensureOwnerUser() {
  const email = process.env.APP_OWNER_EMAIL;
  const password = process.env.APP_OWNER_PASSWORD;
  if (!email || !password) return null;

  const normalized = normalizeEmail(email);
  const password_hash = bcrypt.hashSync(String(password), 12);
  const profile = {
    name: process.env.APP_OWNER_NAME || 'Administrator',
    phone: process.env.APP_OWNER_PHONE || '9898989898',
    home_address: process.env.APP_OWNER_HOME || '',
    route_from: process.env.APP_OWNER_ROUTE_FROM || '',
    route_to: process.env.APP_OWNER_ROUTE_TO || '',
    city: process.env.APP_OWNER_CITY || 'Bangalore',
    office_address: process.env.APP_OWNER_OFFICE || 'Company HQ, Bangalore',
    availability: 'available',
    email_verified: true,
    is_demo: false,
    password_hash,
  };

  const existing = await db.findEmployeeByEmail(normalized);
  if (!existing) {
    let authId = null;
    if (isSupabaseConfigured()) {
      authId = await ensureAuthUser(normalized, password, profile.name);
    }
    return db.createEmployee({
      ...profile,
      email: normalized,
      auth_id: authId,
      user_type: 'existing',
      source: 'admin',
      ...(isSupabaseConfigured() ? { password_hash: undefined } : {}),
    });
  }

  if (existing.source === 'admin' || existing.source === 'owner') {
    const updates = {
      name: profile.name,
      source: 'admin',
      is_demo: false,
      email_verified: true,
    };
    if (process.env.APP_OWNER_SYNC_PASSWORD === 'true') {
      updates.password_hash = password_hash;
      if (isSupabaseConfigured() && existing.auth_id) {
        await updateAuthPassword(existing.auth_id, password);
      }
    }
    await db.updateEmployee(existing.id, updates);
    return db.findEmployeeById(existing.id);
  }

  return existing;
}

async function demoteGmailSenderFromOwnerRole() {
  const gmailSender = normalizeEmail(process.env.GMAIL_USER);
  if (!gmailSender) return null;

  const user = await db.findEmployeeByEmail(gmailSender);
  if (!user) return null;

  if (user.source === 'owner') {
    await db.updateEmployee(user.id, {
      source: 'register',
      user_type: user.user_type === 'existing' ? 'new' : user.user_type,
      is_demo: false,
    });
    console.log(`[Seed] Converted legacy owner account ${gmailSender} to a regular user`);
    return db.findEmployeeById(user.id);
  }

  return user;
}

if (require.main === module) {
  ensureDemoUsers().then((count) => {
    console.log(`Synced ${count} demo employees`);
  }).catch((err) => {
    console.error('Seed failed:', err.message);
    process.exit(1);
  });
}

module.exports = {
  ensureDemoUsers,
  ensureOwnerUser,
  demoteGmailSenderFromOwnerRole,
  DEMO_EMPLOYEES,
  DEMO_PASSWORD,
};
