'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TRIAL_DAYS,
  PLAN_LIMITS,
  effectiveTrialEnd,
  getSubscriptionState,
  evaluatePlanCapacity,
} = require('../utils/saasEntitlements');

test('plan capacity catalog is explicit and includes every supported plan', () => {
  assert.deepEqual(Object.keys(PLAN_LIMITS), ['trial', 'starter', 'growth', 'group']);
  assert.equal(PLAN_LIMITS.trial.branches, 1);
  assert.equal(PLAN_LIMITS.growth.students, 1500);
  assert.equal(PLAN_LIMITS.group.staff, 500);
});

test('trial state stays writable until its exact deadline and becomes read-only after it', () => {
  const createdAt = new Date('2026-10-01T00:00:00.000Z');
  const organization = {
    createdAt,
    subscription: { plan: 'trial', status: 'trial', trialEndsAt: new Date('2026-10-15T00:00:00.000Z') },
  };
  const before = getSubscriptionState(organization, new Date('2026-10-14T23:59:59.999Z'));
  const after = getSubscriptionState(organization, new Date('2026-10-15T00:00:00.000Z'));
  assert.equal(before.canWrite, true);
  assert.equal(before.status, 'trial');
  assert.equal(before.trialDaysRemaining, 1);
  assert.equal(after.canWrite, false);
  assert.equal(after.status, 'trial_expired');
  assert.match(after.readOnlyReason, /trial has ended/i);
});

test('legacy trial records without a deadline receive a bounded deadline from creation', () => {
  const createdAt = new Date('2026-01-01T00:00:00.000Z');
  assert.equal(effectiveTrialEnd({ createdAt }).toISOString(), '2026-01-15T00:00:00.000Z');
  assert.equal(TRIAL_DAYS, 14);
});

test('active subscriptions remain writable and non-active billing states become read-only', () => {
  const organization = { createdAt: new Date(), subscription: { plan: 'growth', status: 'active' } };
  assert.equal(getSubscriptionState(organization).canWrite, true);
  for (const status of ['past_due', 'suspended', 'cancelled']) {
    const state = getSubscriptionState({ ...organization, subscription: { plan: 'growth', status } });
    assert.equal(state.canWrite, false, status);
    assert.ok(state.readOnlyReason);
  }
});

test('plan capacity allows usage up to limit but rejects additions beyond it', () => {
  assert.equal(evaluatePlanCapacity({ plan: 'trial', resource: 'students', used: 99, requested: 1 }).allowed, true);
  const rejected = evaluatePlanCapacity({ plan: 'trial', resource: 'students', used: 100, requested: 1 });
  assert.equal(rejected.allowed, false);
  assert.equal(rejected.limit, 100);
  assert.equal(rejected.remaining, 0);
  assert.match(rejected.message, /contact your account administrator/i);
});

test('unknown plan uses the conservative trial capacity and invalid usage throws', () => {
  assert.equal(evaluatePlanCapacity({ plan: 'unknown', resource: 'branches', used: 1 }).allowed, false);
  assert.throws(() => evaluatePlanCapacity({ plan: 'trial', resource: 'students', used: -1 }), TypeError);
  assert.throws(() => evaluatePlanCapacity({ plan: 'trial', resource: 'students', used: 1.2 }), TypeError);
});
