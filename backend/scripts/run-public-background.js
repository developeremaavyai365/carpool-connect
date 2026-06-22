/**
 * Start public access in the background (survives closing the terminal).
 * Uses supervisor with auto-restart for server + Cloudflare tunnel.
 */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..', '..');
const backendDir = path.join(__dirname, '..');
const logsDir = path.join(backendDir, 'logs');
const pidFile = path.join(backendDir, '.public-server.pid');
const logFile = path.join(logsDir, 'public-server.log');

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  fs.mkdirSync(logsDir, { recursive: true });
  fs.appendFileSync(logFile, line);
  console.log(msg);
}

function isRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function stopExisting() {
  if (!fs.existsSync(pidFile)) return;
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  if (pid && isRunning(pid)) {
    log(`Stopping existing supervisor (PID ${pid})...`);
    try {
      if (process.platform === 'win32') {
        execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
      } else {
        process.kill(-pid, 'SIGTERM');
      }
    } catch {
      /* already stopped */
    }
  }
  try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
  try {
    execSync('node scripts/free-port.js', { cwd: backendDir, stdio: 'ignore' });
  } catch {
    /* ignore */
  }
}

function startBackground() {
  stopExisting();

  log('Building frontend...');
  execSync('npm run build', { cwd: rootDir, stdio: 'inherit' });

  const out = fs.openSync(logFile, 'a');
  const err = fs.openSync(logFile, 'a');

  const child = spawn(process.execPath, ['scripts/supervisor-public.js'], {
    cwd: backendDir,
    detached: true,
    stdio: ['ignore', out, err],
    env: { ...process.env },
    windowsHide: true,
  });

  child.unref();

  log(`Supervisor started (PID ${child.pid})`);
  log(`Logs: ${logFile}`);
  log('Wait 30 seconds, then run show-mobile-url.bat for your phone link.');
  log('Stop with: stop-public.bat or npm run stop:public');
}

startBackground();
