/**
 * Update Supabase Auth Site URL + Redirect URLs for the current Cloudflare tunnel.
 *
 * Requires in backend/.env:
 *   SUPABASE_ACCESS_TOKEN=sbp_...   (from https://supabase.com/dashboard/account/tokens)
 *
 * Usage:
 *   node scripts/update-supabase-auth-urls.js
 *   node scripts/update-supabase-auth-urls.js https://your-app.trycloudflare.com
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', 'backend', '.env') });

const fs = require('fs');
const path = require('path');

const PROJECT_REF = 'rejqxwtyisasykblbvyy';
const LOCAL_REDIRECTS = [
  'http://localhost:5173/**',
  'http://localhost:3001/**',
  'http://127.0.0.1:3001/**',
];

function readPublicUrl() {
  const arg = process.argv[2];
  if (arg?.startsWith('http')) return arg.replace(/\/$/, '');

  const root = path.join(__dirname, '..');
  const statusFile = path.join(root, 'backend', '.tunnel-status.json');
  const urlFile = path.join(root, '.public-url');

  if (fs.existsSync(statusFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (s.publicUrl) return s.publicUrl.replace(/\/$/, '');
    } catch { /* ignore */ }
  }
  if (fs.existsSync(urlFile)) {
    return fs.readFileSync(urlFile, 'utf8').trim().replace(/\/$/, '');
  }
  return null;
}

function parseAllowList(raw) {
  if (!raw || typeof raw !== 'string') return [];
  return raw.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
}

function buildAllowList(existingRaw, siteUrl) {
  const wildcard = `${siteUrl}/**`;
  const kept = parseAllowList(existingRaw).filter((url) => {
    if (!url.includes('trycloudflare.com')) return true;
    return url === wildcard;
  });

  const merged = [...new Set([...kept, wildcard, ...LOCAL_REDIRECTS])];
  return merged.join('\n');
}

async function resolveAccessToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN?.startsWith('sbp_')) {
    return process.env.SUPABASE_ACCESS_TOKEN.trim();
  }

  const home = process.env.USERPROFILE || process.env.HOME || '';
  const candidates = [
    path.join(home, '.supabase', 'access-token'),
    path.join(home, '.config', 'supabase', 'access-token'),
  ];

  for (const file of candidates) {
    try {
      if (!fs.existsSync(file)) continue;
      const token = fs.readFileSync(file, 'utf8').trim();
      if (token.startsWith('sbp_')) return token;
    } catch { /* ignore */ }
  }

  return null;
}

async function managementFetch(method, body) {
  const token = await resolveAccessToken();
  if (!token) {
    throw new Error('MISSING_TOKEN');
  }

  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || data.error || `Management API ${res.status}`);
  }
  return data;
}

function printManual(siteUrl) {
  const wildcard = `${siteUrl}/**`;
  console.log('');
  console.log('=== Update Supabase manually ===');
  console.log('Open: https://supabase.com/dashboard/project/rejqxwtyisasykblbvyy/auth/url-configuration');
  console.log('');
  console.log('Site URL:');
  console.log(`  ${siteUrl}`);
  console.log('');
  console.log('Redirect URLs (add this line):');
  console.log(`  ${wildcard}`);
  console.log('');
  console.log('Optional local dev redirects:');
  LOCAL_REDIRECTS.forEach((u) => console.log(`  ${u}`));
  console.log('');
  console.log('Click Save.');
  console.log('');
  console.log('Tip: run npm run supabase:setup-auto-urls -- sbp_your_token to enable auto-update.');
  console.log('Create token: https://supabase.com/dashboard/account/tokens');
}

async function main() {
  const siteUrl = readPublicUrl();
  if (!siteUrl) {
    console.error('No public URL found. Run npm run fix:tunnel first or pass URL as argument.');
    process.exit(1);
  }

  console.log('Updating Supabase Auth URLs for:', siteUrl);

  const token = await resolveAccessToken();
  if (!token) {
    printManual(siteUrl);
    process.exit(0);
  }

  try {
    const current = await managementFetch('GET');
    const uri_allow_list = buildAllowList(current.uri_allow_list, siteUrl);

    const updated = await managementFetch('PATCH', {
      site_url: siteUrl,
      uri_allow_list,
    });

    console.log('');
    console.log('Supabase Auth updated successfully.');
    console.log('  Site URL:', updated.site_url || siteUrl);
    console.log('  Redirect URLs:');
    parseAllowList(updated.uri_allow_list || uri_allow_list).forEach((u) => console.log('   -', u));
    console.log('');
  } catch (err) {
    if (err.message === 'MISSING_TOKEN') {
      printManual(siteUrl);
      process.exit(0);
    }
    console.error('Auto-update failed:', err.message);
    printManual(siteUrl);
    process.exit(1);
  }
}

main();
