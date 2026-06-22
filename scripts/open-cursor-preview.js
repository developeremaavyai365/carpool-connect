/**
 * Print the correct Cursor preview URL and verify the server is up.
 */
const http = require('http');

const URLS = [
  { label: 'Dev preview (recommended in Cursor)', url: 'http://127.0.0.1:5173' },
  { label: 'Production build', url: 'http://127.0.0.1:3001' },
];

function check(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode < 500);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

(async () => {
  console.log('\nCarPool Connect — Cursor preview\n');
  for (const { label, url } of URLS) {
    const ok = await check(url);
    console.log(`${ok ? '✓' : '✗'} ${label}`);
    console.log(`  ${url}${ok ? '  (ready)' : '  (not running)'}\n`);
  }
  const devUp = await check('http://127.0.0.1:5173');
  const prodUp = await check('http://127.0.0.1:3001');
  const use = devUp ? 'http://127.0.0.1:5173' : prodUp ? 'http://127.0.0.1:3001' : null;
  if (use) {
    console.log('Open in Cursor: Ctrl+Shift+P → "Simple Browser: Show" → paste:');
    console.log(use);
    console.log('\nOr run: npm run dev:cursor  (starts both servers)\n');
  } else {
    console.log('Nothing is running. Start with:  npm run dev:cursor\n');
    process.exit(1);
  }
})();
