/**
 * Report Cloudflare tunnel status and verify the live public URL.
 * Run on a schedule (install-autostart.bat) to catch Error 1033 early.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const statusFile = path.join(root, 'backend', '.tunnel-status.json');
const urlFile = path.join(root, '.public-url');

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function check(url) {
  return new Promise((resolve) => {
    if (!url) return resolve(false);
    const req = https.get(`${url.replace(/\/$/, '')}/api/health`, { timeout: 15000 }, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function cloudflaredRunning() {
  try {
    if (process.platform === 'win32') {
      const out = execSync('tasklist /FI "IMAGENAME eq cloudflared.exe" /NH', { encoding: 'utf8' });
      return /cloudflared\.exe/i.test(out);
    }
    execSync('pgrep cloudflared', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  const status = readJson(statusFile);
  const url = (status?.publicUrl || fs.readFileSync(urlFile, 'utf8').trim()).replace(/\/$/, '');
  const ok = await check(url);
  const cf = cloudflaredRunning();

  console.log('=== Cloudflare Tunnel Status ===');
  console.log('Public URL:     ', url || '(none)');
  console.log('Tunnel healthy: ', ok ? 'YES' : 'NO');
  console.log('cloudflared:    ', cf ? 'running' : 'NOT RUNNING');
  console.log('Supervisor:     ', status?.running ? 'active' : 'unknown');
  console.log('Last check:     ', status?.updatedAt || 'n/a');
  console.log('');
  if (!ok) {
    console.log('');
    console.log('Tunnel DEAD (Error 530 / 1033) — old URL no longer works.');
    console.log('Fix: npm run fix:tunnel');
    console.log('Or:  npm run start:public:bg  then wait 45s and npm run live:url');
    console.log('');
    if (!cf) {
      try {
        execSync('npm run start:public:bg', { cwd: root, stdio: 'inherit' });
      } catch {
        process.exit(2);
      }
    } else {
      try {
        execSync('npm run stop:public', { cwd: root, stdio: 'ignore' });
        execSync('npm run start:public:bg', { cwd: root, stdio: 'inherit' });
      } catch {
        process.exit(2);
      }
    }
    process.exit(1);
  }
  console.log('Tunnel OK — use this URL on phone/PC:');
  console.log(url);
})();
