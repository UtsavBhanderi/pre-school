'use strict';

const TRIAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

// Initial operational capacities only; these are not prices or a billing promise.
// Review them against the commercial plan design before public self-service signup.
const PLAN_LIMITS = Object.freeze({
  trial: Object.freeze({ branches: 1, students: 100, staff: 10 }),
  starter: Object.freeze({ branches: 1, students: 250, staff: 20 }),
  growth: Object.freeze({ branches: 5, students: 1500, staff: 100 }),
  group: Object.freeze({ branches: 25, students: 15000, staff: 500 }),
});

const RESOURCE_LABELS = Object.freeze({
  branches: 'branches',
  students: 'children',
  staff: 'staff accounts',
});

function plusDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function effectiveTrialEnd(organization) {
  const supplied = organization?.subscription?.trialEndsAt;
  if (supplied) {
    const parsed = new Date(supplied);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const createdAt = organization?.createdAt ? new Date(organization.createdAt) : null;
  // Legacy trial records without an explicit deadline receive no unlimited
  // extension: derive the deadline from creation time.
  if (createdAt && !Number.isNaN(createdAt.getTime())) return plusDays(createdAt, TRIAL_DAYS);
  return new Date(0);
}

function getSubscriptionState(organization, now = new Date()) {
  const subscription = organization?.subscription || {};
  const plan = Object.prototype.hasOwnProperty.call(PLAN_LIMITS, subscription.plan)
    ? subscription.plan
    : 'trial';
  const status = ['trial', 'active', 'past_due', 'suspended', 'cancelled'].includes(subscription.status)
    ? subscription.status
    : 'trial';
  const trialEndsAt = status === 'trial' ? effectiveTrialEnd(organization) : null;
  const trialExpired = status === 'trial' && trialEndsAt.getTime() <= now.getTime();
  const effectiveStatus = trialExpired ? 'trial_expired' : status;
  const canWrite = status === 'active' || (status === 'trial' && !trialExpired);
  let readOnlyReason = '';

  if (trialExpired) {
    readOnlyReason = 'Your free trial has ended. Your school records remain available, but changes are paused until the subscription is activated.';
  } else if (status === 'past_due') {
    readOnlyReason = 'The subscription needs billing attention. The school workspace is read-only until it is resolved.';
  } else if (status === 'suspended') {
    readOnlyReason = 'The subscription is suspended. Changes are paused; contact the account administrator.';
  } else if (status === 'cancelled') {
    readOnlyReason = 'The subscription is cancelled. Records remain available for review, but changes are paused.';
  }

  return {
    plan,
    status: effectiveStatus,
    sourceStatus: status,
    trialEndsAt: trialEndsAt ? trialEndsAt.toISOString() : null,
    trialDaysRemaining: trialEndsAt && !trialExpired
      ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / DAY_MS))
      : 0,
    canWrite,
    readOnlyReason,
    limits: PLAN_LIMITS[plan],
  };
}

function evaluatePlanCapacity({ plan = 'trial', resource, used = 0, requested = 1 }) {
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.trial;
  const limit = limits[resource];
  if (!Number.isInteger(used) || used < 0 || !Number.isInteger(requested) || requested < 1) {
    throw new TypeError('Plan usage must be a non-negative integer and requested capacity must be a positive integer.');
  }
  if (!Number.isInteger(limit) || limit < 1) {
    return { allowed: true, resource, used, requested, limit: null, remaining: null };
  }
  return {
    allowed: used + requested <= limit,
    resource,
    label: RESOURCE_LABELS[resource] || resource,
    used,
    requested,
    limit,
    remaining: Math.max(0, limit - used),
    message: used + requested <= limit
      ? ''
      : 'Your ' + plan + ' plan allows up to ' + limit + ' ' + (RESOURCE_LABELS[resource] || resource) +
        '. There are ' + used + ' in use. Contact your account administrator to upgrade or free capacity.',
  };
}

module.exports = {
  TRIAL_DAYS,
  PLAN_LIMITS,
  effectiveTrialEnd,
  getSubscriptionState,
  evaluatePlanCapacity,
};
