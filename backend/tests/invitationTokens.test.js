'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createInvitationToken, hashInvitationToken, invitationExpiry, isInvitationLive } = require('../utils/invitationTokens');

test('invitation token is random and only its hash should be stored', () => {
  const first = createInvitationToken();
  const second = createInvitationToken();
  assert.ok(first.token.length >= 40);
  assert.notEqual(first.token, second.token);
  assert.equal(first.tokenHash, hashInvitationToken(first.token));
  assert.notEqual(first.token, first.tokenHash);
});

test('invalid invitation tokens do not produce a usable hash', () => {
  assert.equal(hashInvitationToken(''), '');
  assert.equal(hashInvitationToken('too-short'), '');
  assert.equal(hashInvitationToken('x'.repeat(201)), '');
});

test('invitation expiry is exactly 72 hours after creation', () => {
  const start = new Date('2026-10-12T12:00:00.000Z');
  assert.equal(invitationExpiry(start).toISOString(), '2026-10-15T12:00:00.000Z');
});

test('an invitation is live only when pending and not expired', () => {
  const expiresAt = new Date('2026-10-15T12:00:00.000Z');
  assert.equal(isInvitationLive({ status: 'pending', expiresAt }, new Date('2026-10-13T12:00:00Z')), true);
  assert.equal(isInvitationLive({ status: 'accepted', expiresAt }, new Date('2026-10-13T12:00:00Z')), false);
  assert.equal(isInvitationLive({ status: 'pending', expiresAt }, new Date('2026-10-16T12:00:00Z')), false);
});
