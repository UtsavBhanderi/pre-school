'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { createPasswordResetToken, passwordResetExpiry } = require('../utils/passwordResetTokens');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('password reset is one-time and invalidates prior JWT sessions', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';
  delete process.env.SMTP_HOST;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  const { app } = require('../server');
  const User = require('../models/User');
  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });

  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const email = 'password-reset-' + tag + '@example.test';
  let user;

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

  t.after(async () => {
    if (user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  user = await User.create({
    username: 'Password reset integration ' + tag,
    email,
    password: 'old-integration-password-' + tag,
    role: 'admin',
  });

  const oldToken = jwt.sign(
    { user: { id: String(user._id), role: user.role, authVersion: user.authVersion || 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );
  assert.equal((await api('/api/auth/me', { token: oldToken })).status, 200);

  const { token: rawResetToken, tokenHash } = createPasswordResetToken();
  await User.updateOne(
    { _id: user._id },
    { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: passwordResetExpiry() } },
  );

  const nextPassword = 'new-integration-password-' + tag;
  const reset = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { token: rawResetToken, password: nextPassword },
  });
  assert.equal(reset.status, 200);
  assert.match(reset.data.message, /sign in again/i);

  const persisted = await User.findById(user._id).select('+passwordResetTokenHash +passwordResetExpiresAt');
  assert.equal(persisted.passwordResetTokenHash, null);
  assert.equal(persisted.passwordResetExpiresAt, null);
  assert.equal(persisted.authVersion, 1);
  assert.equal(await persisted.matchPassword(nextPassword), true);

  const oldSession = await api('/api/auth/me', { token: oldToken });
  assert.equal(oldSession.status, 401);

  const reused = await api('/api/auth/reset-password', {
    method: 'POST',
    body: { token: rawResetToken, password: 'another-integration-password-' + tag },
  });
  assert.equal(reused.status, 410);

  const oldPasswordLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: 'old-integration-password-' + tag },
  });
  assert.equal(oldPasswordLogin.status, 401);

  const newPasswordLogin = await api('/api/auth/login', {
    method: 'POST',
    body: { email, password: nextPassword },
  });
  assert.equal(newPasswordLogin.status, 200);
  const newSession = await api('/api/auth/me', { token: newPasswordLogin.data.token });
  assert.equal(newSession.status, 200);
});
