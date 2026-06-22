/**
 * Driver dashboard verification — shows exact query results and DB rows.
 * Run: node scripts/verify-driver-dashboard.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const BASE = process.env.API_BASE || 'http://localhost:3001/api';

async function login(email, password) {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Login failed');
  return data;
}

async function main() {
  const driver = await login('rajesh.kumar@company.com', 'demo123');
  console.log('\n=== AUTH ===');
  console.log('Logged in:', driver.employee.email, 'user id:', driver.employee.id);

  console.log('\n=== EXACT QUERY: GET /api/commutes/mine ===');
  console.log('Supabase equivalent:');
  console.log(`  SELECT * FROM published_commutes`);
  console.log(`  WHERE driver_id = ${driver.employee.id}`);
  console.log(`  ORDER BY created_at DESC`);

  const res = await fetch(`${BASE}/commutes/mine`, {
    headers: { Authorization: `Bearer ${driver.token}` },
  });
  const data = await res.json();

  console.log('\n=== API RESPONSE ===');
  console.log('HTTP', res.status);
  console.log('stats:', JSON.stringify(data.stats, null, 2));
  console.log('total commutes:', data.total);

  console.log('\n=== DATABASE ROWS (via API) ===');
  for (const c of (data.commutes || []).slice(0, 8)) {
    console.log(JSON.stringify({
      id: c.id,
      driver_id: c.driver_id,
      route_from: c.route_from,
      route_to: c.route_to,
      status: c.status,
      departure_at: c.departure_at,
      seats_available: c.seats_available,
      seats_booked: c.seats_booked,
    }));
  }

  console.log('\n=== BUCKETS ===');
  for (const key of ['upcoming', 'active', 'completed', 'cancelled']) {
    const list = data.buckets?.[key] || [];
    console.log(`${key}: ${list.length} → ids [${list.map((c) => c.id).join(', ')}]`);
  }

  // Lifecycle test: complete one upcoming if exists
  const sample = data.buckets?.upcoming?.[0];
  if (sample) {
    console.log(`\n=== TEST: Mark complete commute id=${sample.id} ===`);
    const completeRes = await fetch(`${BASE}/commutes/${sample.id}/complete`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${driver.token}` },
    });
    const completeBody = await completeRes.json();
    console.log('PATCH complete →', completeRes.status, completeBody.commute?.status);

    const after = await fetch(`${BASE}/commutes/mine`, {
      headers: { Authorization: `Bearer ${driver.token}` },
    }).then((r) => r.json());
    const inCompleted = after.buckets?.completed?.some((c) => c.id === sample.id);
    console.log('Now in completed bucket:', inCompleted ? 'YES' : 'NO');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
