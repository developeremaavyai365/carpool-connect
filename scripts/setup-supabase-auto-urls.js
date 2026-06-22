/**
 * One-time setup: save Supabase Management API token and enable auto URL updates.
 *
 * Usage:
 *   npm run supabase:setup-auto-urls -- sbp_your_token_here
 *   npm run supabase:setup-auto-urls          (uses existing token in backend/.env)
 *
 * Create token: https://supabase.com/dashboard/account/tokens
 * Required scope: projects + auth write (full access token works).
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const envPath = path.join(root, 'backend', '.env');
const TOKEN_KEY = 'SUPABASE_ACCESS_TOKEN';

function readEnv() {
  if (!fs.existsSync(envPath)) return '';
  return fs.readFileSync(envPath, 'utf8');
}

function upsertEnvToken(token) {
  const trimmed = token.trim();
  if (!trimmed.startsWith('sbp_')) {
    throw new Error('Token must start with sbp_ (from Supabase Dashboard → Account → Access Tokens)');
  }

  let content = readEnv();
  const line = `${TOKEN_KEY}=${trimmed}`;
  const pattern = new RegExp(`^${TOKEN_KEY}=.*$`, 'm');

  if (pattern.test(content)) {
    content = content.replace(pattern, line);
  } else {
    const block = `\n# Supabase Management API — auto-updates Auth Site URL when tunnel restarts\n${line}\n`;
    content = content.endsWith('\n') ? content + block : content + `\n${block}`;
  }

  fs.writeFileSync(envPath, content, 'utf8');
  console.log(`Saved ${TOKEN_KEY} to backend/.env`);
}

function getArgToken() {
  const arg = process.argv[2];
  if (arg && arg.startsWith('sbp_')) return arg;
  return null;
}

function getEnvToken() {
  const match = readEnv().match(new RegExp(`^${TOKEN_KEY}=(.+)$`, 'm'));
  return match?.[1]?.trim() || null;
}

async function verifyToken(token) {
  const res = await fetch('https://api.supabase.com/v1/projects/rejqxwtyisasykblbvyy/config/auth', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Invalid token or insufficient permissions. Create a new token at https://supabase.com/dashboard/account/tokens');
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || `Token check failed (${res.status})`);
  }
}

async function main() {
  console.log('\n=== Supabase auto URL update — setup ===\n');

  let token = getArgToken() || getEnvToken();

  if (!token) {
    console.log('No token found. Do this once:');
    console.log('');
    console.log('1. Open: https://supabase.com/dashboard/account/tokens');
    console.log('2. Generate new token (name: CarPool Auto URLs)');
    console.log('3. Run:');
    console.log('   npm run supabase:setup-auto-urls -- sbp_paste_your_token_here');
    console.log('');
    console.log('After setup, npm run fix:tunnel will auto-update Supabase Auth URLs.');
    process.exit(1);
  }

  if (getArgToken()) {
    upsertEnvToken(token);
  }

  console.log('Verifying token…');
  await verifyToken(token);
  console.log('Token OK.\n');

  execSync('node scripts/update-supabase-auth-urls.js', { cwd: root, stdio: 'inherit' });

  console.log('Setup complete. Auth URLs will auto-update whenever you run npm run fix:tunnel.');
}

main().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
