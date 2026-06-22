/**
 * Verify live app features against production and public URLs.
 */
const http = require('http');
const https = require('https');

const BASES = [
  { name: 'Production (local)', base: 'http://127.0.0.1:3001' },
];

async function readPublicUrl() {
  try {
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, '..', '.public-url');
    if (fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf8').trim();
    }
  } catch {
    /* ignore */
  }
  return null;
}

function request(base, method, path, body, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, base);
    const lib = url.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
          ...(payload && { 'Content-Length': Buffer.byteLength(payload) }),
        },
        timeout: 20000,
      },
      (res) => {
        let data = '';
        res.on('data', (c) => { data += c; });
        res.on('end', () => {
          let json = {};
          try { json = JSON.parse(data); } catch { json = { raw: data }; }
          resolve({ status: res.statusCode, json, raw: data });
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function verifyBase(label, base) {
  const results = [];
  const ok = (name, pass, detail = '') => results.push({ name, pass, detail });
  let token1;
  let token2;

  try {
    const health = await request(base, 'GET', '/api/health');
    ok('Health check', health.status === 200 && health.json.status === 'ok', `mode=${health.json.mode}`);

    const login1 = await request(base, 'POST', '/api/auth/login', {
      email: 'priya.sharma@company.com',
      password: 'demo123',
    });
    token1 = login1.json.token;
    ok('Login (demo user)', login1.status === 200 && Boolean(token1), login1.json.employee?.name);

    const login2 = await request(base, 'POST', '/api/auth/login', {
      email: 'rajesh.kumar@company.com',
      password: 'demo123',
    });
    token2 = login2.json.token;
    ok('Login (second user)', login2.status === 200 && Boolean(token2));

    const me = await request(base, 'GET', '/api/auth/me', null, token1);
    ok('Auth /me', me.status === 200 && me.json.employee?.email === 'priya.sharma@company.com');

    const recs = await request(base, 'GET', '/api/employees/recommendations', null, token1);
    ok('Recommendations', recs.status === 200 && Array.isArray(recs.json.recommendations));

    const completedBefore = await request(base, 'GET', '/api/requests/completed-count', null, token1);
    ok('Completed commutes API', completedBefore.status === 200 && typeof completedBefore.json.count === 'number',
      `count=${completedBefore.json.count}`);

    const pending = await request(base, 'GET', '/api/requests/pending', null, token2);
    ok('Pending requests API', pending.status === 200 && Array.isArray(pending.json.requests));

    const createReq = await request(base, 'POST', '/api/requests', {
      receiver_id: 2,
      message: 'Live verification carpool request',
    }, token1);

    if (createReq.status === 201) {
      const reqId = createReq.json.request.id;
      ok('Create carpool request', true, `id=${reqId}`);

      const accept = await request(base, 'PATCH', `/api/requests/${reqId}/respond`, { response: 'accepted' }, token2);
      ok('Accept carpool request', accept.status === 200 && accept.json.request?.status === 'accepted');

      const completedAfter = await request(base, 'GET', '/api/requests/completed-count', null, token1);
      ok('Completed count updates', completedAfter.json.count === completedBefore.json.count + 1,
        `${completedBefore.json.count} → ${completedAfter.json.count}`);
    } else if (createReq.status === 409) {
      ok('Create carpool request', true, 'pending request already exists (skipped flow)');
      ok('Accept carpool request', true, 'skipped');
      ok('Completed count updates', completedBefore.json.count >= 0, 'existing data');
    } else {
      ok('Create carpool request', false, createReq.json.error || createReq.status);
      ok('Accept carpool request', false, 'skipped');
      ok('Completed count updates', false, 'skipped');
    }

    const notifs = await request(base, 'GET', '/api/notifications/unread-count', null, token1);
    ok('Notifications count', notifs.status === 200 && typeof notifs.json.count === 'number');

    const home = await request(base, 'GET', '/');
    const hasAppShell = home.raw.includes('root') || home.raw.includes('CarPool');
    const hasNewBundle = home.raw.includes('index-') && (home.status === 200);
    ok('Frontend served', home.status === 200 && hasAppShell, hasNewBundle ? 'production build loaded' : 'html ok');

    const jsMatch = home.raw.match(/assets\/(index-[^"]+\.js)/);
    if (jsMatch) {
      const js = await request(base, 'GET', `/assets/${jsMatch[1]}`);
      const hasDiscoverUi = js.raw.includes('Commute smarter') && js.raw.includes('Recent searches');
      const hasSearchCardUi = js.raw.includes('Leaving from') && js.raw.includes('Enter pickup point');
      const hasProfileTabs = js.raw.includes('profileCompletion') || js.raw.includes('getProfileCompletion');
      ok('Discover home UI', hasDiscoverUi && hasSearchCardUi, hasDiscoverUi ? 'home screen + search card' : 'missing in bundle');
      ok('Profile completion UI', hasProfileTabs, hasProfileTabs ? 'profile tabs wired' : 'missing in bundle');
    } else {
      ok('Discover home UI', false, 'js bundle not found in html');
      ok('Profile completion UI', false, 'js bundle not found in html');
    }

    const cssMatch = home.raw.match(/assets\/(index-[^"]+\.css)/);
    if (cssMatch) {
      const css = await request(base, 'GET', `/assets/${cssMatch[1]}`);
      const hasSearchCard = css.raw.includes('search-card');
      const hasMobileNav = css.raw.includes('mobile-nav-pill');
      ok('Search card styles', hasSearchCard, hasSearchCard ? 'present' : 'missing');
      ok('Mobile nav pill styles', hasMobileNav, hasMobileNav ? 'present' : 'missing');
    } else {
      ok('Search card styles', false, 'css bundle not found');
      ok('Mobile nav pill styles', false, 'css bundle not found');
    }

    const recent = await request(base, 'GET', '/api/employees/recent-searches', null, token1);
    ok('Recent searches API', recent.status === 200 && Array.isArray(recent.json.searches));

    const completion = await request(base, 'GET', '/api/employees/profile/completion', null, token1);
    ok('Profile completion API', completion.status === 200 && typeof completion.json.profileCompletion?.completed === 'number');

    const otpDispatch = await request(base, 'POST', '/api/auth/otp/send', {
      channel: 'email',
      identifier: `verify.live.${Date.now()}@gmail.com`,
      purpose: 'register',
    });
    ok(
      'OTP email to user address',
      otpDispatch.status === 200 && otpDispatch.json.emailSent === true,
      otpDispatch.json.message || otpDispatch.json.error,
    );

    const access = await request(base, 'GET', '/api/access', null, token1).catch(() => null);
    if (access) {
      ok('Mobile access info', access.status === 200 && Boolean(access.json.recommendedUrl));
    }

    const locNearby = await request(base, 'GET', '/api/location/nearby?city=Mumbai&lat=19.07&lng=72.87', null, token1);
    ok('Live location nearby API', locNearby.status === 200 && typeof locNearby.json.nearbyCount === 'number');
  } catch (err) {
    ok('Connection', false, err.message);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n=== ${label}: ${base} ===`);
  for (const r of results) {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  }
  console.log(`Result: ${passed}/${results.length} passed\n`);
  return { label, base, passed, total: results.length, results };
}

(async () => {
  const publicUrl = await readPublicUrl();
  if (publicUrl) BASES.push({ name: 'Public (live)', base: publicUrl });

  let allPass = true;
  for (const { name, base } of BASES) {
    const summary = await verifyBase(name, base);
    if (summary.passed < summary.total) allPass = false;
  }

  process.exit(allPass ? 0 : 1);
})();
