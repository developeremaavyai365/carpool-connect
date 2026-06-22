/**
 * Print the verified live URL (probes health endpoint before showing).
 * If dead, run: npm run fix:tunnel
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const root = path.join(__dirname, '..');
const statusFile = path.join(root, 'backend', '.tunnel-status.json');
const urlFile = path.join(root, '.public-url');

function check(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(`${url.replace(/\/$/, '')}/api/health`, { timeout: 15000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function readUrl() {
  if (fs.existsSync(statusFile)) {
    try {
      const s = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
      if (s.publicUrl && !s.publicUrl.includes('loca.lt')) return s.publicUrl.replace(/\/$/, '');
    } catch { /* ignore */ }
  }
  if (fs.existsSync(urlFile)) {
    const url = fs.readFileSync(urlFile, 'utf8').trim();
    if (url.includes('loca.lt')) return null;
    return url.replace(/\/$/, '');
  }
  return null;
}

(async () => {
  const url = readUrl();
  if (!url) {
    console.log('No live URL yet. Run: npm run fix:tunnel');
    process.exit(1);
  }
  const ok = await check(url);
  if (ok) {
    console.log(url);
    process.exit(0);
  }
  console.error('Tunnel is DEAD (Cloudflare Error 530 — old URL unregistered).');
  console.error('Last URL (do NOT use): ' + url);
  console.error('');
  console.error('Run this to get a fresh working URL:');
  console.error('  npm run fix:tunnel');
  process.exit(2);
})();
