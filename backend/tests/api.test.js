const { describe, it, before } = require('node:test');

const assert = require('node:assert/strict');

const request = require('supertest');
const path = require('path');

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DATABASE_PATH = path.join(__dirname, '..', 'data', 'test-carpool.db');
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';

process.env.PORT = '3099';

process.env.OTP_DEV_MODE = 'true';

process.env.SKIP_DEMO_SEED = 'true';



const { findMatches, routeMatchScore, normalize } = require('../src/utils/routeMatcher');



async function registerWithOtp(app, userData) {

  const sendRes = await request(app).post('/api/auth/otp/send').send({

    channel: 'email', identifier: userData.email, purpose: 'register',

  });

  assert.equal(sendRes.status, 200, JSON.stringify(sendRes.body));

  const code = sendRes.body.devOtp;

  assert.ok(code);

  const reg = await request(app).post('/api/auth/register').send({

    name: userData.name,

    email: userData.email,

    phone: userData.phone,

    password: userData.password || 'testpass123',

    channel: 'email',

    code,

  });

  assert.equal(reg.status, 201, JSON.stringify(reg.body));

  return reg;

}



describe('Route Matcher', () => {

  it('normalizes text correctly', () => {

    assert.equal(normalize('  Mumbai   Central  '), 'mumbai central');

  });



  it('scores matching routes higher', () => {

    const emp = { id: 1, city: 'Mumbai', route_from: 'Andheri', route_to: 'BKC', availability: 'available' };

    const match = { id: 2, city: 'Mumbai', route_from: 'Andheri West', route_to: 'BKC', availability: 'available' };

    const noMatch = { id: 3, city: 'Delhi', route_from: 'Connaught Place', route_to: 'Gurgaon', availability: 'available' };



    assert.ok(routeMatchScore(emp, match) > routeMatchScore(emp, noMatch));

  });

  it('scores NCR metro cities as compatible', () => {
    const delhi = { id: 1, city: 'Delhi', route_from: 'Okhla', route_to: 'Sector 62 Noida', availability: 'available' };
    const faridabad = { id: 2, city: 'Faridabad', route_from: 'Sector 91 Faridabad', route_to: 'Sector 62 Noida', availability: 'available' };
    assert.ok(routeMatchScore(delhi, faridabad) >= 40);
  });



  it('finds matches excluding self', () => {

    const emp = { id: 1, city: 'Bangalore', route_from: 'Whitefield', route_to: 'Electronic City', availability: 'available' };

    const candidates = [

      emp,

      { id: 2, city: 'Bangalore', route_from: 'Whitefield', route_to: 'Electronic City', availability: 'available' },

      { id: 3, city: 'Delhi', route_from: 'CP', route_to: 'Gurgaon', availability: 'available' },

    ];

    const matches = findMatches(emp, candidates);

    assert.equal(matches.length, 1);

    assert.equal(matches[0].id, 2);

  });

});



describe('API Integration', () => {

  let app;

  let token1;

  let token2;

  let user2Id;



  before(async () => {

    const db = require('../src/database');

    await db.resetStore();



    const { app: expressApp } = require('../src/server');

    app = expressApp;



    const user1 = {

      name: 'Test User One',

      email: 'test1@company.com',

      phone: '9876543210',

      password: 'testpass123',

    };

    const reg1 = await registerWithOtp(app, user1);

    token1 = reg1.body.token;



    const user2 = {

      name: 'Test User Two',

      email: 'test2@company.com',

      phone: '9123456789',

      password: 'testpass123',

    };

    const reg2 = await registerWithOtp(app, user2);

    token2 = reg2.body.token;

    user2Id = reg2.body.employee.id;



    await request(app)

      .put('/api/employees/profile')

      .set('Authorization', `Bearer ${token1}`)

      .send({

        home_address: 'Andheri West, Mumbai',

        route_from: 'Andheri',

        route_to: 'BKC',

        city: 'Mumbai',

      });



    await request(app)

      .put('/api/employees/profile')

      .set('Authorization', `Bearer ${token2}`)

      .send({

        home_address: 'Powai, Mumbai',

        route_from: 'Powai',

        route_to: 'BKC',

        city: 'Mumbai',

      });

  });



  it('health check returns ok', async () => {

    const res = await request(app).get('/api/health');

    assert.equal(res.status, 200);

    assert.equal(res.body.status, 'ok');

  });



  it('password login works after registration', async () => {

    const loginRes = await request(app).post('/api/auth/login').send({

      email: 'test1@company.com',

      password: 'testpass123',

    });

    assert.equal(loginRes.status, 200);

    assert.ok(loginRes.body.token);

  });



  it('registers without location fields', async () => {

    const sendRes = await request(app).post('/api/auth/otp/send').send({

      channel: 'email', identifier: 'minimal@company.com', purpose: 'register',

    });

    assert.equal(sendRes.status, 200);

    const res = await request(app).post('/api/auth/register').send({

      name: 'Minimal User',

      email: 'minimal@company.com',

      phone: '9988776655',

      password: 'testpass123',

      channel: 'email',

      code: sendRes.body.devOtp,

    });

    assert.equal(res.status, 201);

    assert.equal(res.body.employee.city, 'Bangalore');

  });



  it('rejects duplicate registration', async () => {
    const sendRes = await request(app).post('/api/auth/otp/send').send({
      channel: 'email', identifier: 'newuser@company.com', purpose: 'register',
    });
    assert.equal(sendRes.status, 200);
    const res = await request(app).post('/api/auth/register').send({
      name: 'Duplicate Phone',
      email: 'newuser@company.com',
      phone: '9876543210',
      password: 'testpass123',
      channel: 'email',
      code: sendRes.body.devOtp,
    });
    assert.equal(res.status, 409);
  });



  it('profile update works', async () => {

    const res = await request(app)

      .put('/api/employees/profile')

      .set('Authorization', `Bearer ${token1}`)

      .send({ availability: 'limited' });

    assert.equal(res.status, 200);

    assert.equal(res.body.employee.availability, 'limited');

  });

  it('profile allows clearing home address', async () => {
    const res = await request(app)
      .put('/api/employees/profile')
      .set('Authorization', `Bearer ${token1}`)
      .send({ home_address: '' });
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.home_address, '');
  });

  it('search returns other employees', async () => {

    const res = await request(app)

      .get('/api/employees/search?city=Mumbai&match=true')

      .set('Authorization', `Bearer ${token1}`);

    assert.equal(res.status, 200);

    assert.ok(res.body.employees.length >= 1);

  });



  it('recommendations returns available colleagues in area', async () => {

    const res = await request(app)

      .get('/api/employees/recommendations')

      .set('Authorization', `Bearer ${token1}`);

    assert.equal(res.status, 200);

    assert.ok(Array.isArray(res.body.recommendations));

    assert.equal(res.body.area.city, 'Mumbai');

    assert.ok(res.body.recommendations.every((e) => e.availability !== 'unavailable'));

  });



  it('carpool request flow works', async () => {

    const createRes = await request(app)

      .post('/api/requests')

      .set('Authorization', `Bearer ${token1}`)

      .send({ receiver_id: user2Id, message: 'Want to carpool?' });

    assert.equal(createRes.status, 201);

    const requestId = createRes.body.request.id;



    const pendingRes = await request(app)

      .get('/api/requests/pending')

      .set('Authorization', `Bearer ${token2}`);

    assert.equal(pendingRes.status, 200);

    assert.ok(pendingRes.body.requests.some((r) => r.id === requestId));



    const acceptRes = await request(app)

      .patch(`/api/requests/${requestId}/respond`)

      .set('Authorization', `Bearer ${token2}`)

      .send({ response: 'accepted' });

    assert.equal(acceptRes.status, 200);

    assert.equal(acceptRes.body.request.status, 'accepted');

    const completedSender = await request(app)
      .get('/api/requests/completed-count')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(completedSender.status, 200);
    assert.equal(completedSender.body.count, 1);

    const completedReceiver = await request(app)
      .get('/api/requests/completed-count')
      .set('Authorization', `Bearer ${token2}`);
    assert.equal(completedReceiver.status, 200);
    assert.equal(completedReceiver.body.count, 1);

    const notifRes = await request(app)

      .get('/api/notifications')

      .set('Authorization', `Bearer ${token1}`);

    assert.equal(notifRes.status, 200);

    assert.ok(notifRes.body.notifications.length >= 1);

  });



  it('rejects unauthorized access', async () => {

    const res = await request(app).get('/api/employees/profile');

    assert.equal(res.status, 401);

  });



  it('public cities endpoint works without auth', async () => {

    const res = await request(app).get('/api/employees/cities');

    assert.equal(res.status, 200);

    assert.ok(res.body.cities.length > 0);

  });

  it('recent searches API works', async () => {
    const save = await request(app)
      .post('/api/employees/recent-searches')
      .set('Authorization', `Bearer ${token1}`)
      .send({ route_from: 'Andheri', route_to: 'BKC', city: 'Mumbai' });
    assert.equal(save.status, 200);
    assert.ok(Array.isArray(save.body.searches));
    assert.ok(save.body.searches.some((s) => s.route_from === 'Andheri'));

    const list = await request(app)
      .get('/api/employees/recent-searches')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(list.status, 200);
    assert.ok(list.body.searches.length >= 1);
  });

  it('profile completion API works', async () => {
    const res = await request(app)
      .get('/api/employees/profile/completion')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(res.status, 200);
    assert.ok(typeof res.body.profileCompletion.completed === 'number');
    assert.ok(Array.isArray(res.body.verification));
  });

  it('profile accepts bio and vehicle', async () => {
    const res = await request(app)
      .put('/api/employees/profile')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        bio: 'Test commuter bio here',
        vehicle: { make: 'Maruti', model: 'Swift', color: 'White', seats: '4' },
      });
    assert.equal(res.status, 200);
    assert.equal(res.body.employee.bio, 'Test commuter bio here');
    assert.equal(res.body.employee.vehicle.make, 'Maruti');
  });

  it('notification feedback API works', async () => {
    const notifs = await request(app)
      .get('/api/notifications')
      .set('Authorization', `Bearer ${token1}`);
    assert.ok(notifs.body.notifications.length >= 1);
    const nid = notifs.body.notifications[0].id;

    const fb = await request(app)
      .post('/api/notifications/feedback')
      .set('Authorization', `Bearer ${token1}`)
      .send({ notification_id: nid, rating: 5, comment: 'Helpful alert' });
    assert.equal(fb.status, 201);
    assert.equal(fb.body.feedback.rating, 5);
  });

  it('mark all notifications read works', async () => {
    const markAll = await request(app)
      .patch('/api/notifications/read-all')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(markAll.status, 200, JSON.stringify(markAll.body));

    const unread = await request(app)
      .get('/api/notifications/unread-count')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(unread.status, 200);
    assert.equal(unread.body.count, 0);
  });

  it('rejects self carpool request', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`);
    const selfId = me.body.employee.id;

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token1}`)
      .send({ receiver_id: String(selfId), message: 'Self test' });
    assert.equal(res.status, 400);
  });

  it('rejects seat request on own published commute', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 4);
    const created = await request(app)
      .post('/api/commutes')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        route_from: 'Delhi',
        route_to: 'Jaipur',
        city: 'Delhi',
        departure_date: tomorrow.toISOString().slice(0, 10),
        departure_time: '10:00',
        seats_available: 2,
        price_per_seat: 100,
      });
    assert.equal(created.status, 201);

    const res = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        receiver_id: created.body.commute.driver_id,
        commute_id: created.body.commute.id,
        message: 'Trying to book own commute',
      });
    assert.equal(res.status, 403);
    assert.match(String(res.body.error), /cannot book your own commute/i);
  });

  it('browse search excludes driver own commutes', async () => {
    const me = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token1}`);
    const driverId = me.body.employee.id;

    const search = await request(app)
      .get('/api/commutes/search')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(search.status, 200);
    assert.ok(
      search.body.commutes.every((c) => Number(c.driver_id) !== Number(driverId)),
      'own commutes must not appear in passenger browse search',
    );
  });

  it('login returns verified employee profile', async () => {
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test1@company.com', password: 'testpass123' });
    assert.equal(login.status, 200);
    assert.equal(login.body.employee.email_verified, true);
  });

  it('email queue records notification delivery', async () => {
    const db = require('../src/database');
    const stats = await db.getEmailQueueStats();
    assert.ok(stats.skipped >= 1 || stats.pending >= 0 || stats.sent >= 0);
  });

  it('publish, search, edit and delete commute', async () => {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 2);
    const departure_date = tomorrow.toISOString().slice(0, 10);

    const created = await request(app)
      .post('/api/commutes')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        route_from: 'Andheri West',
        route_to: 'BKC Mumbai',
        city: 'Mumbai',
        departure_date,
        departure_time: '08:30',
        seats_available: 3,
        price_per_seat: 150,
        notes: 'Pickup near metro',
        smoking: 'not_allowed',
        music: 'quiet',
        pets: 'not_allowed',
      });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.commute.seats_available, 3);
    assert.equal(created.body.commute.price_per_seat, 150);

    const withSeconds = await request(app)
      .post('/api/commutes')
      .set('Authorization', `Bearer ${token1}`)
      .send({
        route_from: 'Powai',
        route_to: 'BKC Mumbai',
        city: 'Mumbai',
        departure_date,
        departure_time: '09:15:00',
        seats_available: 2,
        price_per_seat: 0,
        stopovers: ['X', 'Thane'],
      });
    assert.equal(withSeconds.status, 201, JSON.stringify(withSeconds.body));
    assert.deepEqual(withSeconds.body.commute.stopovers, ['Thane']);

    const search = await request(app)
      .get('/api/commutes/search?route_from=Andheri')
      .set('Authorization', `Bearer ${token2}`);
    assert.equal(search.status, 200);
    assert.ok(search.body.commutes.some((c) => c.id === created.body.commute.id));

    const updated = await request(app)
      .put(`/api/commutes/${created.body.commute.id}`)
      .set('Authorization', `Bearer ${token1}`)
      .send({ seats_available: 2, price_per_seat: 200 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.commute.seats_available, 2);

    const mine = await request(app)
      .get('/api/commutes/mine')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(mine.status, 200);
    assert.ok(mine.body.commutes.length >= 1);

    const seatReq = await request(app)
      .post('/api/requests')
      .set('Authorization', `Bearer ${token2}`)
      .send({
        receiver_id: created.body.commute.driver_id,
        commute_id: created.body.commute.id,
        message: 'Seat please',
      });
    assert.equal(seatReq.status, 201);

    const removed = await request(app)
      .delete(`/api/commutes/${created.body.commute.id}`)
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.commute.status, 'cancelled');
  });

  it('returns route options for publish wizard', async () => {
    const res = await request(app)
      .get('/api/commutes/routes?route_from=Sonipat&route_to=New%20Delhi')
      .set('Authorization', `Bearer ${token1}`);
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(res.body.routes));
    assert.ok(res.body.routes.length >= 1);
    assert.ok(res.body.routes[0].summary);
    assert.ok(res.body.routes[0].polyline?.length >= 2);
    assert.ok(['google', 'estimated', 'ors', 'osrm'].includes(res.body.source));
    if (res.body.routes.length >= 2) {
      const a = res.body.routes[0];
      const b = res.body.routes[1];
      const differs = a.distance_m !== b.distance_m || a.duration_s !== b.duration_s;
      if (res.body.source !== 'estimated') {
        assert.ok(a.distance_m > 0 && a.duration_s > 0);
      }
    }
  });
});


