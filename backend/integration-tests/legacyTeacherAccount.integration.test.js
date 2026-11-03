'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('school administrators manually create teacher logins that can sign in with email and password immediately', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_teacher_manual_login_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const admin = await User.create({
    username: 'School Admin ' + tag,
    email: 'admin-' + tag + '@example.test',
    password: 'TeacherAdminPassword123',
    role: 'admin',
  });
  const adminToken = jwt.sign(
    { user: { id: String(admin._id), role: 'admin', authVersion: 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  const teacherEmail = 'teacher-' + tag + '@example.test';
  const teacherPassword = 'TeacherInitialPassword123';

  async function api(pathname, { token, method = 'GET', body } = {}) {
    const response = await fetch(new URL(pathname, 'http://127.0.0.1:' + server.address().port), {
      method,
      headers: {
        ...(token ? { 'x-auth-token': token } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  t.after(async () => {
    await Promise.allSettled([
      User.deleteMany({ _id: admin._id }),
      User.deleteMany({ email: teacherEmail }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  await t.test('teacher accounts cannot be self-registered or created without administrator access', async () => {
    const response = await api('/api/auth/register', {
      method: 'POST',
      body: { username: 'Self Registered', email: teacherEmail, password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 401);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 0);
  });

  await t.test('administrator creates an active teacher account directly, without invitation or verification', async () => {
    const response = await api('/api/auth/register', {
      token: adminToken,
      method: 'POST',
      body: { username: 'Teacher ' + tag, email: teacherEmail.toUpperCase(), password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 201);
    assert.equal(response.data.user.role, 'teacher');
    assert.equal(response.data.user.status, 'active');
    assert.equal(response.data.token, undefined);
    assert.match(response.data.message, /immediately/);
    assert.equal(await User.countDocuments({ email: teacherEmail }), 1);
  });

  let teacherToken;
  await t.test('teacher signs in immediately with email ID and password; no email verification token is needed', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: teacherPassword },
    });
    assert.equal(response.status, 200);
    assert.ok(response.data.token);
    teacherToken = response.data.token;

    const me = await api('/api/auth/me', { token: teacherToken });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.email, teacherEmail);
    assert.equal(me.data.user.role, 'teacher');
  });

  await t.test('teacher cannot create another account from the administrator-only endpoint', async () => {
    const response = await api('/api/auth/register', {
      token: teacherToken,
      method: 'POST',
      body: { username: 'Another Teacher', email: 'other-' + tag + '@example.test', password: teacherPassword, role: 'teacher' },
    });
    assert.equal(response.status, 403);
  });

  await t.test('wrong password is still rejected', async () => {
    const response = await api('/api/auth/login', {
      method: 'POST',
      body: { email: teacherEmail, password: 'IncorrectPassword123' },
    });
    assert.equal(response.status, 401);
  });
});
