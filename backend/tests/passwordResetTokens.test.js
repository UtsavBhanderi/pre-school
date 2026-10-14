'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PASSWORD_RESET_TTL_MINUTES,
  createPasswordResetToken,
  hashPasswordResetToken,
  passwordResetExpiry,
  isPasswordResetLive,
  isValidNewPassword,
} = require('../utils/passwordResetTokens');

test('reset tokens are cryptographically random and only their SHA-256 hashes are stored', () => {
  const first = createPasswordResetToken();
  const second = createPasswordResetToken();
  assert.ok(first.token.length >= 40);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashPasswordResetToken(first.token));
  assert.equal(first.tokenHash.length, 64);
  assert.notEqual(first.token, first.tokenHash);
});

test('malformed tokens never become usable hashes', () => {
  for (const token of ['', 'short', 'x'.repeat(201), null, 42]) {
    assert.equal(hashPasswordResetToken(token), '');
  }
});

test('reset links expire after thirty minutes', () => {
  const start = new Date('2026-10-14T10:00:00.000Z');
  assert.equal(PASSWORD_RESET_TTL_MINUTES, 30);
  assert.equal(passwordResetExpiry(start).toISOString(), '2026-10-14T10:30:00.000Z');
});

test('a reset record is live only when it has a hash and a future expiry', () => {
  const now = new Date('2026-10-14T10:00:00.000Z');
  const live = {
    passwordResetTokenHash: 'a'.repeat(64),
    passwordResetExpiresAt: new Date('2026-10-14T10:15:00.000Z'),
  };
  assert.equal(isPasswordResetLive(live, now), true);
  assert.equal(isPasswordResetLive({ ...live, passwordResetExpiresAt: now }, now), false);
  assert.equal(isPasswordResetLive({ ...live, passwordResetTokenHash: '' }, now), false);
  assert.equal(isPasswordResetLive(null, now), false);
});

test('new passwords must have a useful length and cannot be blank', () => {
  assert.equal(isValidNewPassword('correct-horse-battery'), true);
  assert.equal(isValidNewPassword('short'), false);
  assert.equal(isValidNewPassword('            '), false);
  assert.equal(isValidNewPassword('x'.repeat(129)), false);
  assert.equal(isValidNewPassword('x'.repeat(128)), true);
});
