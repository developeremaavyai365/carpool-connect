process.env.SKIP_DEMO_SEED = 'true';
process.env.JWT_SECRET = 'test';
require('dotenv').config();

const request = require('supertest');
const { loadRidesRouter } = require('../src/modules/rides');
const express = require('express');

const app = express();
app.use(express.json());
const router = loadRidesRouter();
if (!router) {
  console.error('FAIL: rides router did not load');
  process.exit(1);
}
app.use('/api/rides', router);

(async () => {
  const res = await request(app)
    .get('/api/rides/search')
    .query({
      pickup_lat: 28.4595,
      pickup_lng: 77.0266,
      drop_lat: 27.9878,
      drop_lng: 76.3878,
    });

  console.log('search status:', res.status);
  console.log('search body:', JSON.stringify(res.body));
})().catch((e) => {
  console.error('FAIL:', e.message);
  process.exit(1);
});
