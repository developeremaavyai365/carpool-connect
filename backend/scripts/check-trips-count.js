require('dotenv').config();
const { getPool } = require('../dist/modules/rides/repositories/pg.client');

(async () => {
  const pool = getPool();
  const trips = await pool.query('SELECT COUNT(*)::int AS c FROM trips');
  const commutes = await pool.query("SELECT COUNT(*)::int AS c FROM published_commutes WHERE status = 'active'");
  console.log(JSON.stringify({ trips: trips.rows[0].c, active_commutes: commutes.rows[0].c }));
  await pool.end();
})().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
