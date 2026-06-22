/**
 * Free the backend port before starting dev (avoids EADDRINUSE on restart).
 */
const { execSync } = require('child_process');

const port = String(process.env.PORT || 3001);

function sleep(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* wait for port release */ }
}

function freePortWin() {
  let out = '';
  try {
    out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8' });
  } catch {
    return false;
  }

  const pids = new Set();
  for (const line of out.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const pid = trimmed.split(/\s+/).pop();
    if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid);
  }

  let killed = false;
  for (const pid of pids) {
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
      console.log(`Freed port ${port} (stopped PID ${pid})`);
      killed = true;
    } catch {
      console.warn(`Could not stop PID ${pid} — close it manually or run as administrator`);
    }
  }

  if (killed) sleep(500);
  return killed;
}

function freePortUnix() {
  try {
    execSync(`lsof -ti:${port} | xargs -r kill -9`, { stdio: 'ignore' });
    console.log(`Freed port ${port}`);
    sleep(500);
    return true;
  } catch {
    return false;
  }
}

if (process.platform === 'win32') {
  freePortWin();
} else {
  freePortUnix();
}
