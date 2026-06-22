const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const backendDir = path.join(__dirname, '..');
const pidFile = path.join(backendDir, '.public-server.pid');

function stopPid(pid) {
  if (!pid) return;
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /F /T /PID ${pid}`, { stdio: 'ignore' });
    } else {
      process.kill(-pid, 'SIGTERM');
    }
    console.log(`Stopped supervisor (PID ${pid})`);
  } catch {
    console.log('Supervisor was not running.');
  }
}

if (fs.existsSync(pidFile)) {
  const pid = parseInt(fs.readFileSync(pidFile, 'utf8').trim(), 10);
  stopPid(pid);
  try { fs.unlinkSync(pidFile); } catch { /* ignore */ }
} else {
  console.log('No supervisor PID file found.');
}

try {
  execSync('node scripts/free-port.js', { cwd: backendDir, stdio: 'inherit' });
} catch {
  /* ignore */
}

// Stop orphaned cloudflared processes tied to our port
if (process.platform === 'win32') {
  try {
    execSync('taskkill /F /IM cloudflared.exe', { stdio: 'ignore' });
  } catch {
    /* none running */
  }
}

console.log('Public access stopped.');
