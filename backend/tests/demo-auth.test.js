const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DATABASE_PATH = require('path').join(__dirname, '..', 'data', 'test-demo-carpool.db');
process.env.OTP_DEV_MODE = 'true';
process.env.SKIP_DEMO_SEED = 'true';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.SUPABASE_ANON_KEY = '';

describe('Demo account login', () => {
  let app;

  before(async () => {
    const db = require('../src/database');
    await db.resetStore();
    const { ensureDemoUsers } = require('../src/seed');
    await ensureDemoUsers();
    ({ app } = require('../src/server'));
  });

  it('logs in priya.sharma@company.com with demo123', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'priya.sharma@company.com',
      password: 'demo123',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
    assert.equal(res.body.employee.email, 'priya.sharma@company.com');
  });

  it('logs in with normalized email casing', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'Priya.Sharma@Company.com',
      password: 'demo123',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('rejects wrong password for demo account', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'priya.sharma@company.com',
      password: 'wrongpassword',
    });
    assert.equal(res.status, 401);
  });

  it('demo password hash matches demo123 in database', async () => {
    const db = require('../src/database');
    const emp = await db.findEmployeeByEmail('priya.sharma@company.com');
    assert.ok(emp);
    assert.ok(bcrypt.compareSync('demo123', emp.password_hash));
  });

  it('password login works for another demo account', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: 'rajesh.kumar@company.com',
      password: 'demo123',
    });
    assert.equal(res.status, 200);
    assert.ok(res.body.token);
  });

  it('resets password via Gmail OTP and signs in with new password', async () => {
    const email = 'priya.sharma@company.com';
    const newPassword = 'newSecure99';

    const sendRes = await request(app).post('/api/auth/otp/send').send({
      channel: 'email',
      identifier: email,
      purpose: 'reset',
    });
    assert.equal(sendRes.status, 200, JSON.stringify(sendRes.body));

    const db = require('../src/database');
    const otpRecord = await db.findOtp(email, 'email', 'reset');
    assert.ok(otpRecord, 'reset OTP should be stored');

    const resetRes = await request(app).post('/api/auth/reset-password').send({
      email,
      code: otpRecord.code,
      password: newPassword,
    });
    assert.equal(resetRes.status, 200, JSON.stringify(resetRes.body));
    assert.ok(resetRes.body.token);
    assert.equal(resetRes.body.employee.email, email);

    const loginRes = await request(app).post('/api/auth/login').send({
      email,
      password: newPassword,
    });
    assert.equal(loginRes.status, 200);

    const oldLogin = await request(app).post('/api/auth/login').send({
      email,
      password: 'demo123',
    });
    assert.equal(oldLogin.status, 401);

    await db.updateEmployee(resetRes.body.employee.id, {
      password_hash: bcrypt.hashSync('demo123', 12),
    });
  });
});
