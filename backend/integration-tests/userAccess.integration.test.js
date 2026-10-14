'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('legacy user access API manages roles, suspension, session revocation and audit history', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_user_access_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const UserAccessAuditEvent = require('../models/UserAccessAuditEvent');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const createdUserIds = [];

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, { token, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
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

  async function makeUser(label, role, password = 'integration-user-password-123') {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password,
      role,
    });
    createdUserIds.push(user._id);
    return user;
  }

  t.after(async () => {
    await Promise.allSettled([
      UserAccessAuditEvent.deleteMany({}),
      User.deleteMany({ _id: { $in: createdUserIds } }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  const admin = await makeUser('access-admin', 'admin');
  const secondAdmin = await makeUser('access-admin-two', 'admin');
  const adminToken = tokenFor(admin);

  await t.test('account creation requires an administrator and does not disclose the new account JWT', async () => {
    const unauthorized = await api('/api/auth/register', {
      method: 'POST',
      body: {
        username: 'No Auth ' + tag,
        email: 'no-auth-' + tag + '@example.test',
        password: 'long-test-password-123',
        role: 'teacher',
      },
    });
    assert.equal(unauthorized.status, 401);

    const invalidRole = await api('/api/auth/register', {
      token: adminToken,
      method: 'POST',
      body: {
        username: 'Invalid Role ' + tag,
        email: 'invalid-role-' + tag + '@example.test',
        password: 'long-test-password-123',
        role: 'student',
      },
    });
    assert.equal(invalidRole.status, 400);

    const created = await api('/api/auth/register', {
      token: adminToken,
      method: 'POST',
      body: {
        username: 'Access Teacher ' + tag,
        email: 'access-teacher-' + tag + '@example.test',
        password: 'long-test-password-123',
        role: 'teacher',
      },
    });
    assert.equal(created.status, 201);
    assert.equal(created.data.user.status, 'active');
    assert.equal(Object.prototype.hasOwnProperty.call(created.data, 'token'), false);

    const stored = await User.findById(created.data.user.id).select('+passwordResetTokenHash');
    assert.ok(stored);
    createdUserIds.push(stored._id);
    assert.equal(stored.role, 'teacher');
    assert.equal(stored.status, 'active');
  });

  await t.test('account list is admin-only and never returns password hashes', async () => {
    const missingAuth = await api('/api/userDetailsself');
    assert.equal(missingAuth.status, 401);

    const response = await api('/api/userDetailsself', { token: adminToken });
    assert.equal(response.status, 200);
    assert.ok(response.data.length >= 2);
    assert.ok(response.data.every((item) => !Object.prototype.hasOwnProperty.call(item, 'password')));
    assert.ok(response.data.every((item) => ['active', 'suspended'].includes(item.status)));
  });

  await t.test('self-edits are blocked and role changes revoke existing sessions and are audited', async () => {
    const selfChange = await api('/api/userDetailsself/' + admin._id, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'suspended', reason: 'Try to suspend self' },
    });
    assert.equal(selfChange.status, 409);

    const target = await User.findOne({ email: 'access-teacher-' + tag + '@example.test' });
    assert.ok(target);
    const staleToken = tokenFor(target);
    const promote = await api('/api/userDetailsself/' + target._id, {
      token: adminToken,
      method: 'PATCH',
      body: { role: 'admin', reason: 'Promotion to authorized administrator' },
    });
    assert.equal(promote.status, 200);
    assert.equal(promote.data.user.role, 'admin');
    assert.equal(promote.data.sessionsRevoked, true);

    const staleSession = await api('/api/auth/me', { token: staleToken });
    assert.equal(staleSession.status, 401);

    const audit = await UserAccessAuditEvent.findOne({ targetUserId: target._id, action: 'user.access_updated' }).lean();
    assert.ok(audit);
    assert.equal(audit.previousRole, 'teacher');
    assert.equal(audit.role, 'admin');
    assert.equal(audit.reason, 'Promotion to authorized administrator');
  });

  await t.test('suspending an account blocks login and all authenticated requests', async () => {
    const target = await User.findOne({ email: 'access-teacher-' + tag + '@example.test' });
    assert.ok(target);
    const tokenBeforeSuspension = tokenFor(target);

    const suspend = await api('/api/userDetailsself/' + target._id, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'suspended', reason: 'Access no longer required' },
    });
    assert.equal(suspend.status, 200);
    assert.equal(suspend.data.user.status, 'suspended');

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: target.email, password: 'long-test-password-123' },
    });
    assert.equal(login.status, 403);
    assert.equal(login.data.code, 'ACCOUNT_SUSPENDED');

    const oldSession = await api('/api/auth/me', { token: tokenBeforeSuspension });
    assert.equal(oldSession.status, 401);

    const restore = await api('/api/userDetailsself/' + target._id, {
      token: adminToken,
      method: 'PATCH',
      body: { status: 'active', reason: 'Approved return to work' },
    });
    assert.equal(restore.status, 200);
    assert.equal(restore.data.user.status, 'active');
    assert.equal((await api('/api/auth/me', { token: tokenBeforeSuspension })).status, 401);
  });

  await t.test('access history is protected and captures account changes', async () => {
    const missingAuth = await api('/api/userDetailsself/audit');
    assert.equal(missingAuth.status, 401);

    const response = await api('/api/userDetailsself/audit', { token: adminToken });
    assert.equal(response.status, 200);
    assert.ok(response.data.some((event) => event.action === 'user.created'));
    assert.ok(response.data.some((event) => event.action === 'user.access_updated' && event.reason === 'Access no longer required'));
  });

  assert.ok(secondAdmin._id);
});
