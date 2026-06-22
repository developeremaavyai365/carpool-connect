/**
 * Start servers for Cursor preview.
 * Reuses production API on :3001 if already running; always starts Vite on :5173.
 */
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const root = path.join(__dirname, '..');
const children = [];

function waitFor(url, attempts = 60) {
  return new Promise((resolve, reject) => {
    let n = 0;
    const tick = () => {
      n += 1;
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else if (n >= attempts) reject(new Error(`Timeout waiting for ${url}`));
        else setTimeout(tick, 500);
      });
      req.on('error', () => {
        if (n >= attempts) reject(new Error(`Timeout waiting for ${url}`));
        else setTimeout(tick, 500);
      });
    };
    tick();
  });
}

function isUp(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(2000, () => { req.destroy(); resolve(false); });
  });
}

function run(name, cmd, args, cwd) {
  const child = spawn(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  children.push(child);
  child.on('exit', (code) => {
    if (code !== 0 && code !== null) console.error(`${name} exited with code ${code}`);
  });
  return child;
}

async function main() {
  console.log('Starting CarPool for Cursor preview...\n');

  const apiUp = await isUp('http://127.0.0.1:3001/api/health');
  if (apiUp) {
    console.log('API already running on http://127.0.0.1:3001 (reusing)\n');
  } else {
    console.log('Starting backend API on http://127.0.0.1:3001...\n');
    run('backend', 'npm', ['run', 'dev'], path.join(root, 'backend'));
    await waitFor('http://127.0.0.1:3001/api/health');
  }

  const viteUp = await isUp('http://127.0.0.1:5173');
  if (!viteUp) {
    console.log('Starting frontend dev server on http://127.0.0.1:5173...\n');
    run('frontend', 'npm', ['run', 'dev'], path.join(root, 'frontend'));
    await waitFor('http://127.0.0.1:5173');
  } else {
    console.log('Frontend already running on http://127.0.0.1:5173\n');
  }

  console.log('==================================================');
  console.log('  CURSOR PREVIEW URL:  http://127.0.0.1:5173');
  console.log('  Ctrl+Shift+P → Simple Browser: Show → paste URL');
  console.log('==================================================\n');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});

process.on('SIGINT', () => {
  for (const c of children) try { c.kill(); } catch { /* ignore */ }
  process.exit(0);
});
