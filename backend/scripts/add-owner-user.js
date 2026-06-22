require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const db = require('../src/database');
const { normalizeEmail } = require('../src/utils/emailNormalize');
const { isSupabaseConfigured } = require('../src/lib/supabase');
const { createAuthUser, updateAuthPassword } = require('../src/services/supabaseAuth');

const EMAIL = normalizeEmail(process.env.OWNER_EMAIL || 'armaankinfinite8@gmail.com');
const PASSWORD = process.env.OWNER_PASSWORD || 'Logica@123';
const PROFILE = {
  name: process.env.OWNER_NAME || 'Armaan Kinfinite',
  phone: process.env.OWNER_PHONE || '9811111111',
  home_address: '',
  office_address: 'Logica Infoway, New Delhi',
  route_from: 'New Delhi',
  route_to: 'Office',
  city: 'Delhi',
  availability: 'available',
  role: 'employee',
  source: 'admin',
  email_verified: true,
  is_demo: false,
  user_type: 'existing',
};

async function main() {
  if (!isSupabaseConfigured()) {
    console.error('Supabase is not configured in backend/.env');
    process.exit(1);
  }

  const existing = await db.findEmployeeByEmail(EMAIL);
  if (existing) {
    if (!existing.auth_id) {
      try {
        const authUser = await createAuthUser({
          email: EMAIL,
          password: PASSWORD,
          name: PROFILE.name,
        });
        if (authUser?.id) {
          await db.updateEmployee(existing.id, { auth_id: authUser.id, email_verified: true });
          console.log('Linked existing user to Supabase Auth');
        }
      } catch (err) {
        if (err.status === 409) {
          console.log('Auth user already exists — linking skipped (use reset password if needed)');
        } else {
          throw err;
        }
      }
    } else {
      await updateAuthPassword(existing.auth_id, PASSWORD).catch(() => {});
      console.log('User already exists — password synced to default');
    }
    const updated = await db.findEmployeeByEmail(EMAIL);
    console.log('\nAccount ready:', updated.email, '(id:', updated.id + ')');
    process.exit(0);
  }

  let authId = null;
  try {
    const authUser = await createAuthUser({
      email: EMAIL,
      password: PASSWORD,
      name: PROFILE.name,
    });
    authId = authUser?.id || null;
  } catch (err) {
    if (err.status !== 409) throw err;
    console.log('Auth user already exists in Supabase Auth — creating app profile only');
  }

  const employee = await db.createEmployee({
    ...PROFILE,
    email: EMAIL,
    auth_id: authId,
  });

  console.log('\nCreated Supabase account:');
  console.log('  Email:   ', employee.email);
  console.log('  Name:    ', employee.name);
  console.log('  User id: ', employee.id);
  console.log('  Auth id: ', employee.auth_id || '(link manually if missing)');
  console.log('\nSign in with:');
  console.log('  Email:   ', EMAIL);
  console.log('  Password:', PASSWORD);
  console.log('\nChange password after first login (Forgot password → Gmail OTP).\n');
}

main().catch((err) => {
  console.error('Failed:', err.message);
  process.exit(1);
});
