'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAccessStatus,
  evaluateUserAccessChange,
} = require('../utils/userAccessPolicy');

function evaluate(overrides = {}) {
  return evaluateUserAccessChange({
    actorUserId: 'admin-1',
    targetUserId: 'teacher-1',
    currentRole: 'teacher',
    currentStatus: 'active',
    requestedRole: 'teacher',
    requestedStatus: 'active',
    reason: 'Role responsibilities changed',
    ...overrides,
  });
}

test('missing status on a legacy account is interpreted as active', () => {
  assert.equal(normalizeAccessStatus(undefined), 'active');
  assert.equal(normalizeAccessStatus(null), 'active');
  assert.equal(normalizeAccessStatus('suspended'), 'suspended');
});

test('allows a justified role change and identifies the changed fields', () => {
  const result = evaluate({ requestedRole: 'admin' });
  assert.equal(result.allowed, true);
  assert.deepEqual(result.changedFields, ['role']);
  assert.equal(result.removesActiveAdministrator, false);
});

test('blocks self-access changes', () => {
  const result = evaluate({ actorUserId: 'teacher-1', targetUserId: 'teacher-1', requestedStatus: 'suspended' });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'SELF_ACCESS_CHANGE');
});

test('blocks unsupported roles and invalid status values', () => {
  assert.equal(evaluate({ requestedRole: 'student' }).code, 'INVALID_ROLE');
  assert.equal(evaluate({ requestedStatus: 'removed' }).code, 'INVALID_STATUS');
});

test('requires a reason and rejects no-op changes', () => {
  assert.equal(evaluate({ reason: '  ' }).code, 'REASON_REQUIRED');
  assert.equal(evaluate({}).code, 'NO_ACCESS_CHANGE');
});

test('detects any change that would remove an active administrator', () => {
  assert.equal(evaluate({ currentRole: 'admin', requestedRole: 'teacher' }).removesActiveAdministrator, true);
  assert.equal(evaluate({ currentRole: 'admin', requestedStatus: 'suspended' }).removesActiveAdministrator, true);
  assert.equal(evaluate({ currentRole: 'admin', currentStatus: 'suspended', requestedStatus: 'active' }).removesActiveAdministrator, false);
});

test('blocks accounts whose role is not supported by the legacy access screen', () => {
  const result = evaluate({ currentRole: 'student', requestedRole: 'teacher' });
  assert.equal(result.allowed, false);
  assert.equal(result.code, 'UNSUPPORTED_ACCOUNT_ROLE');
});
