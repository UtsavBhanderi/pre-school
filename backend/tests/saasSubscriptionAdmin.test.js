'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSubscriptionChange,
  subscriptionSnapshot,
  snapshotsMatch,
} = require('../utils/saasSubscriptionAdmin');

const validInput = {
  plan: 'growth',
  status: 'active',
  reason: 'Activate the paid plan after billing confirmation.',
  ticket: 'BILLING-2026-104',
  approvedBy: 'billing-operator@example.com',
};

test('approved paid activation normalizes input and retains an auditable reason', () => {
  const result = normalizeSubscriptionChange(validInput, {
    usage: { branches: 3, students: 550, staff: 12 },
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.plan, 'growth');
  assert.equal(result.value.status, 'active');
  assert.equal(result.value.canWrite, true);
  assert.equal(result.value.trialEndsAt, null);
  assert.deepEqual(result.value.changedFields, [
    'subscription.plan',
    'subscription.status',
    'subscription.trialEndsAt',
  ]);
  assert.equal(result.value.approvedBy, 'billing-operator@example.com');
});

test('trial extensions are capped and calculated from the supplied clock', () => {
  const result = normalizeSubscriptionChange({
    ...validInput,
    plan: 'trial',
    status: 'trial',
    trialDays: 21,
  }, {
    usage: { branches: 1, students: 20, staff: 2 },
    now: new Date('2026-10-14T00:00:00.000Z'),
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.trialEndsAt.toISOString(), '2026-11-04T00:00:00.000Z');
});

test('trial changes require a trial plan and a valid 1-to-90-day period', () => {
  const mismatch = normalizeSubscriptionChange({
    ...validInput,
    status: 'trial',
    plan: 'growth',
  });
  assert.equal(mismatch.valid, false);
  assert.ok(mismatch.errors.plan);

  const days = normalizeSubscriptionChange({
    ...validInput,
    status: 'trial',
    plan: 'trial',
    trialDays: 0,
  });
  assert.equal(days.valid, false);
  assert.ok(days.errors.trialDays);
});

test('writable plan activation is blocked if existing usage exceeds the requested plan', () => {
  const result = normalizeSubscriptionChange({
    ...validInput,
    plan: 'starter',
    status: 'active',
  }, {
    usage: { branches: 2, students: 300, staff: 9 },
  });
  assert.equal(result.valid, false);
  assert.match(result.errors.capacity, /branches/);
  assert.match(result.errors.capacity, /children/);
});

test('read-only billing states may be applied while usage is above the new plan capacity', () => {
  const result = normalizeSubscriptionChange({
    ...validInput,
    plan: 'starter',
    status: 'suspended',
  }, {
    usage: { branches: 2, students: 300, staff: 40 },
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.canWrite, false);
});

test('unknown plan, status, missing reason, invalid ticket and invalid approver are rejected', () => {
  const result = normalizeSubscriptionChange({
    plan: 'enterprise-unlimited',
    status: 'enabled',
    reason: 'ok',
    ticket: 'bad ticket',
    approvedBy: 'not-an-email',
  });
  assert.equal(result.valid, false);
  for (const field of ['plan', 'status', 'reason', 'ticket', 'approvedBy']) assert.ok(result.errors[field]);
});

test('subscription snapshots let the operator detect stale approval previews', () => {
  const original = subscriptionSnapshot({
    subscription: { plan: 'trial', status: 'trial', trialEndsAt: new Date('2026-10-28T00:00:00.000Z') },
  });
  const unchanged = subscriptionSnapshot({
    subscription: { plan: 'trial', status: 'trial', trialEndsAt: new Date('2026-10-28T00:00:00.000Z') },
  });
  const changed = subscriptionSnapshot({
    subscription: { plan: 'growth', status: 'active', trialEndsAt: null },
  });
  assert.equal(snapshotsMatch(original, unchanged), true);
  assert.equal(snapshotsMatch(original, changed), false);
});
