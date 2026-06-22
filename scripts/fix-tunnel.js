/**
 * Fix Cloudflare Error 530: restart server + tunnel, wait for new verified URL.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const statusFile = path.join(root, 'backend', '.tunnel-status.json');
const urlFile = path.join(root, '.public-url');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function check(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const base = url.replace(/\/$/, '');
    let healthOk = false;
    let appOk = false;
    let pending = 2;

    const done = () => {
      pending -= 1;
      if (pending === 0) resolve(healthOk && appOk);
    };

    const healthReq = https.get(`${base}/api/health`, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          healthOk = res.statusCode === 200 && data.mode === 'production';
        } catch {
          healthOk = false;
        }
        done();
      });
    });
    healthReq.on('error', () => done());
    healthReq.on('timeout', () => { healthReq.destroy(); done(); });

    const appReq = https.get(`${base}/`, { timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        appOk = res.statusCode === 200 && body.includes('<!DOCTYPE html');
        done();
      });
    });
    appReq.on('error', () => done());
    appReq.on('timeout', () => { appReq.destroy(); done(); });
  });
}

function readUrl() {
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

(async () => {
  const before = readUrl();
  if (before) {
    console.log('Stopping dead tunnel...');
    console.log('Old URL (530 — do not use): ' + before);
  }

  try {
    execSync('npm run stop:public', { cwd: root, stdio: 'inherit' });
  } catch { /* ignore */ }

  console.log('Starting fresh server + Cloudflare tunnel...');
  execSync('npm run start:public:bg', { cwd: root, stdio: 'inherit' });

  console.log('Waiting for new verified URL (up to 2 minutes)...');
  for (let i = 0; i < 24; i += 1) {
    await sleep(5000);
    const url = readUrl();
    if (url && url !== before && await check(url)) {
      console.log('');
      console.log('==================================================');
      console.log('  NEW LIVE URL (verified working):');
      console.log('  ' + url);
      console.log('==================================================');
      console.log('');
      console.log('Bookmark this link. Old trycloudflare.com URLs die when the PC restarts.');
      try {
        execSync(`node scripts/update-supabase-auth-urls.js "${url}"`, { cwd: root, stdio: 'inherit' });
      } catch { /* manual fallback printed by script */ }
      process.exit(0);
    }
    if (url && await check(url)) {
      console.log('');
      console.log('Live URL (verified): ' + url);
      try {
        execSync(`node scripts/update-supabase-auth-urls.js "${url}"`, { cwd: root, stdio: 'inherit' });
      } catch { /* ignore */ }
      process.exit(0);
    }
    process.stdout.write('.');
  }

  console.error('\nStill starting. Wait 30s and run: npm run live:url');
  process.exit(2);
})();
