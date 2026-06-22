/**
 * Keeps production server + Cloudflare tunnel alive.
 * Only writes .public-url after the live URL passes a health check.
 */
const { spawn, execSync } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { resolveCloudflared } = require('./resolve-cloudflared');
const { savePublicUrl, clearPublicUrl, getAccessInfo, readPublicUrlFile } = require('../src/utils/appUrl');

const PORT = Number(process.env.PORT || 3001);
const backendDir = path.join(__dirname, '..');
const logsDir = path.join(backendDir, 'logs');
const logFile = path.join(logsDir, 'public-server.log');
const statusFile = path.join(backendDir, '.tunnel-status.json');
const pidFile = path.join(backendDir, '.public-server.pid');

let serverProc = null;
let tunnelProc = null;
let shuttingDown = false;
let currentPublicUrl = null;
let tunnelStarting = false;
let tunnelRestarts = 0;
let serverRestarts = 0;
let tunnelHealthFailures = 0;
let lastTunnelRestartAt = 0;

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  try {
    fs.mkdirSync(logsDir, { recursive: true });
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    /* ignore */
  }
  console.log(msg);
}

function writeStatus(extra = {}) {
  const access = getAccessInfo();
  const status = {
    running: true,
    publicUrl: currentPublicUrl || access.publicUrl,
    lanUrl: access.lanUrl,
    recommendedUrl: currentPublicUrl || access.recommendedUrl,
    tunnelMode: 'cloudflare',
    serverRestarts,
    tunnelRestarts,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
  try {
    fs.writeFileSync(statusFile, JSON.stringify(status, null, 2));
  } catch {
    /* ignore */
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function checkPublicTunnel(url) {
  return new Promise((resolve) => {
    if (!url || url.includes('loca.lt')) return resolve(false);
    const base = url.replace(/\/$/, '');
    let healthOk = false;
    let appOk = false;
    let pending = 2;

    const done = () => {
      pending -= 1;
      if (pending === 0) resolve(healthOk && appOk);
    };

    try {
      https.get(`${base}/api/health`, { timeout: 15000 }, (res) => {
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
      }).on('error', () => done()).on('timeout', function onTimeout() { this.destroy(); done(); });

      https.get(`${base}/`, { timeout: 15000 }, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          appOk = res.statusCode === 200 && body.includes('<!DOCTYPE html');
          done();
        });
      }).on('error', () => done()).on('timeout', function onTimeout() { this.destroy(); done(); });
    } catch {
      resolve(false);
    }
  });
}

function waitForHealth(maxAttempts = 40) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const check = () => {
      attempts += 1;
      const req = http.get(`http://127.0.0.1:${PORT}/api/health`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const data = JSON.parse(body);
              if (data.mode === 'production') {
                resolve(true);
                return;
              }
              if (attempts === 1 || attempts % 5 === 0) {
                log(`Port ${PORT} answered in ${data.mode} mode — expected production (dev server may be blocking the port)`);
              }
            } catch {
              /* ignore parse errors */
            }
          }
          if (attempts >= maxAttempts) reject(new Error('Production server health check failed'));
          else setTimeout(check, 500);
        });
      });
      req.on('error', () => {
        if (attempts >= maxAttempts) reject(new Error('Server not responding'));
        else setTimeout(check, 500);
      });
    };
    check();
  });
}

function checkLocalApp() {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${PORT}/`, { timeout: 10000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        resolve(res.statusCode === 200 && body.includes('<!DOCTYPE html'));
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function killProc(proc) {
  if (!proc || proc.killed) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${proc.pid}`, { stdio: 'ignore' });
    } else {
      proc.kill('SIGTERM');
    }
  } catch {
    try { proc.kill('SIGKILL'); } catch { /* ignore */ }
  }
}

async function publishPublicUrl(url) {
  const normalized = url.replace(/\/$/, '');
  if (normalized.includes('loca.lt')) return false;

  for (let i = 0; i < 12; i += 1) {
    if (await checkPublicTunnel(normalized)) {
      currentPublicUrl = normalized;
      savePublicUrl(normalized);
      log('');
      log('==================================================');
      log('  LIVE APP URL (verified working):');
      log('  ' + normalized);
      log('==================================================');
      log('');
      writeStatus({ tunnelOk: true, publicUrl: normalized });
      return true;
    }
    await sleep(2500);
  }
  log('Tunnel URL not ready yet: ' + normalized);
  return false;
}

function startServerProcess() {
  killProc(serverProc);
  serverProc = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOST: '0.0.0.0',
      TRUST_PROXY: 'true',
      PUBLIC_URL: currentPublicUrl || process.env.PUBLIC_URL || '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });

  serverProc.stdout.on('data', (d) => log(`[server] ${d.toString().trim()}`));
  serverProc.stderr.on('data', (d) => log(`[server] ${d.toString().trim()}`));

  serverProc.on('exit', (code) => {
    if (shuttingDown) return;
    serverRestarts += 1;
    log(`Server stopped (code ${code}). Restarting in 3s...`);
    writeStatus({ serverOk: false });
    setTimeout(() => ensureServer().catch((e) => log(e.message)), 3000);
  });
}

async function ensureServer() {
  try {
    execSync('node scripts/free-port.js', { cwd: backendDir, stdio: 'ignore' });
  } catch {
    /* ignore */
  }
  startServerProcess();
  await sleep(1500);
  await waitForHealth();
  const appOk = await checkLocalApp();
  if (!appOk) {
    throw new Error('Production server is up but frontend is not being served at /');
  }
  log('Production server is healthy on port ' + PORT);
  writeStatus({ serverOk: true });
}

async function startCloudflareTunnel() {
  if (tunnelStarting || shuttingDown) return;
  const now = Date.now();
  if (now - lastTunnelRestartAt < 8000) return;
  lastTunnelRestartAt = now;
  tunnelStarting = true;

  killProc(tunnelProc);
  tunnelProc = null;

  let cloudflaredBin;
  try {
    cloudflaredBin = resolveCloudflared();
  } catch (e) {
    log('cloudflared not found: ' + e.message);
    tunnelStarting = false;
    return;
  }

  log('Starting Cloudflare tunnel via ' + cloudflaredBin);

  tunnelProc = spawn(
    cloudflaredBin,
    ['tunnel', '--protocol', 'http2', '--url', `http://127.0.0.1:${PORT}`],
    { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }
  );

  const onData = async (chunk) => {
    const text = chunk.toString();
    const match = text.match(/https:\/\/[\w-]+\.trycloudflare\.com/);
    if (match) await publishPublicUrl(match[0]);
    if (text.trim()) log(`[tunnel] ${text.trim()}`);
  };

  tunnelProc.stdout.on('data', onData);
  tunnelProc.stderr.on('data', onData);

  tunnelProc.on('error', (err) => {
    log('Cloudflare tunnel error: ' + err.message);
    writeStatus({ tunnelOk: false });
  });

  tunnelProc.on('exit', (code) => {
    tunnelStarting = false;
    if (shuttingDown) return;
    tunnelRestarts += 1;
    log(`Cloudflare tunnel stopped (code ${code}). Old URL is dead — restarting in 10s...`);
    currentPublicUrl = null;
    clearPublicUrl();
    writeStatus({ tunnelOk: false, publicUrl: null });
    setTimeout(startCloudflareTunnel, 10000);
  });

  tunnelStarting = false;
}

async function startTunnelProcess() {
  if (shuttingDown) return;

  const saved = readPublicUrlFile();
  const cfRunning = tunnelProc && !tunnelProc.killed;

  if (saved && !saved.includes('loca.lt') && cfRunning && await checkPublicTunnel(saved)) {
    currentPublicUrl = saved;
    log('Reusing verified public URL: ' + saved);
    writeStatus({ tunnelOk: true, publicUrl: saved });
    return;
  }

  if (saved && !(await checkPublicTunnel(saved))) {
    log('Stale tunnel URL removed (530/unregistered): ' + saved);
    clearPublicUrl();
    currentPublicUrl = null;
  }

  if (saved && saved.includes('loca.lt')) {
    log('Removing stale loca.lt URL from .public-url (use Cloudflare instead)');
    clearPublicUrl();
  }

  await startCloudflareTunnel();
}

function restartTunnel(reason) {
  if (shuttingDown) return;
  log(`Restarting tunnel: ${reason}`);
  tunnelHealthFailures = 0;
  currentPublicUrl = null;
  clearPublicUrl();
  killProc(tunnelProc);
  tunnelProc = null;
  setTimeout(startCloudflareTunnel, 5000);
}

async function healthMonitor() {
  if (shuttingDown) return;

  try {
    await waitForHealth(3);
    writeStatus({ serverOk: true });
  } catch {
    log('Health monitor: server down — restarting');
    await ensureServer().catch((e) => log(e.message));
    return;
  }

  if (!tunnelProc || tunnelProc.killed) {
    log('No cloudflared process — starting tunnel');
    await startCloudflareTunnel();
    return;
  }

  if (!currentPublicUrl) return;

  const tunnelOk = await checkPublicTunnel(currentPublicUrl);
  if (tunnelOk) {
    tunnelHealthFailures = 0;
    writeStatus({ tunnelOk: true, publicUrl: currentPublicUrl });
  } else {
    tunnelHealthFailures += 1;
    log(`Tunnel check failed (${tunnelHealthFailures}/1): ${currentPublicUrl} — likely Error 530`);
    writeStatus({ tunnelOk: false, publicUrl: currentPublicUrl });
    restartTunnel('public URL unreachable (530/unregistered)');
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  log('Shutting down supervisor...');
  killProc(tunnelProc);
  killProc(serverProc);
  try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
  try { fs.unlinkSync(statusFile); } catch { /* ignore */ }
  process.exit(0);
}

async function main() {
  fs.mkdirSync(logsDir, { recursive: true });
  fs.writeFileSync(pidFile, String(process.pid));
  log('Supervisor started (PID ' + process.pid + ')');

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    execSync('node scripts/free-port.js', { cwd: backendDir, stdio: 'ignore' });
  } catch {
    /* ignore */
  }

  await ensureServer();
  await startTunnelProcess();

  setInterval(healthMonitor, 15000);
  setTimeout(healthMonitor, 10000);

  const access = getAccessInfo();
  if (access.lanUrl) log('Same-WiFi backup: ' + access.lanUrl);
  log('Supervisor running — run show-mobile-url.bat for the verified live link.');
}

main().catch((err) => {
  log('Supervisor failed: ' + err.message);
  process.exit(1);
});
