require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });
const { spawnSync } = require('child_process');
const path = require('path');

const ref = (process.env.SUPABASE_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
const password = process.env.SUPABASE_DB_PASSWORD;
const host = process.env.SUPABASE_DB_HOST || (ref ? `aws-1-ap-southeast-1.pooler.supabase.com` : '');
const port = process.env.SUPABASE_DB_PORT || '5432';
const user = process.env.SUPABASE_DB_USER || (ref ? `postgres.${ref}` : 'postgres');

if (!password || !ref) {
  console.error('Set SUPABASE_URL and SUPABASE_DB_PASSWORD in backend/.env');
  process.exit(1);
}

const dbUrl = `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/postgres`;
const root = path.join(__dirname, '..');
const args = ['supabase', 'db', 'push', '--db-url', dbUrl, '--yes', '--include-all'];

console.log(`Pushing migrations to ${ref} via ${host}:${port}...\n`);
const result = spawnSync('npx', args, { cwd: root, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
