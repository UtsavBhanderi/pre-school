'use strict';

const { PLAN_LIMITS } = require('./saasEntitlements');

const ALLOWED_STATUSES = ['trial', 'active', 'past_due', 'suspended', 'cancelled'];
const TICKET_PATTERN = /^[A-Z][A-Z0-9-]{2,39}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function normalizeSubscriptionChange(input = {}, { usage = {}, now = new Date() } = {}) {
  const plan = clean(input.plan, 30).toLowerCase();
  const status = clean(input.status, 30).toLowerCase();
  const reason = clean(input.reason, 320);
  const ticket = clean(input.ticket, 40).toUpperCase();
  const approvedBy = clean(input.approvedBy, 254).toLowerCase();
  const trialDaysRaw = input.trialDays === undefined || input.trialDays === '' ? 14 : Number(input.trialDays);
  const errors = {};

  if (!Object.prototype.hasOwnProperty.call(PLAN_LIMITS, plan)) {
    errors.plan = 'Choose a supported plan: ' + Object.keys(PLAN_LIMITS).join(', ') + '.';
  }
  if (!ALLOWED_STATUSES.includes(status)) {
    errors.status = 'Choose one of these subscription states: ' + ALLOWED_STATUSES.join(', ') + '.';
  }
  if (status === 'trial' && plan !== 'trial') {
    errors.plan = 'A trial must use the Trial plan. Choose a paid plan before activating it.';
  } else if (status !== 'trial' && plan === 'trial') {
    errors.plan = 'The Trial plan can only have Trial status. Choose a paid plan for activation or billing states.';
  }
  if (status === 'trial' && (!Number.isInteger(trialDaysRaw) || trialDaysRaw < 1 || trialDaysRaw > 90)) {
    errors.trialDays = 'Trial length must be a whole number from 1 to 90 days.';
  }
  if (reason.length < 10) errors.reason = 'Give a reason of at least 10 characters.';
  if (!TICKET_PATTERN.test(ticket)) errors.ticket = 'Enter a change-ticket identifier such as BILLING-2026-104.';
  if (!EMAIL_PATTERN.test(approvedBy) || approvedBy.length > 254) errors.approvedBy = 'Enter the approving operator email address.';
  if (errors.reason || errors.ticket || errors.approvedBy) {
    return { valid: false, errors };
  }

  const limits = PLAN_LIMITS[plan];
  const currentUsage = {
    branches: Number(usage.branches || 0),
    students: Number(usage.students || 0),
    staff: Number(usage.staff || 0),
  };
  for (const key of Object.keys(currentUsage)) {
    if (!Number.isSafeInteger(currentUsage[key]) || currentUsage[key] < 0) {
      errors.usage = 'Current organization usage could not be verified.';
    }
  }

  const canWrite = status === 'active' || status === 'trial';
  const overLimits = Object.keys(limits).filter((key) => currentUsage[key] > limits[key]);
  const resourceLabels = { branches: 'branches', students: 'children', staff: 'staff seats' };
  if (canWrite && overLimits.length) {
    errors.capacity = 'The requested writable plan is below current usage for: ' +
      overLimits.map((key) => (resourceLabels[key] || key) + ' (' + currentUsage[key] + '/' + limits[key] + ')').join(', ') +
      '. Reduce usage or select a larger plan before activating writable access.';
  }

  if (Object.keys(errors).length) return { valid: false, errors };

  const trialEndsAt = status === 'trial'
    ? new Date(now.getTime() + trialDaysRaw * DAY_MS)
    : null;

  return {
    valid: true,
    value: {
      plan,
      status,
      trialDays: status === 'trial' ? trialDaysRaw : null,
      trialEndsAt,
      reason,
      ticket,
      approvedBy,
      changedFields: [
        'subscription.plan',
        'subscription.status',
        'subscription.trialEndsAt',
      ],
      canWrite,
      limits,
      usage: currentUsage,
    },
  };
}

function subscriptionSnapshot(organization) {
  const subscription = organization?.subscription || {};
  const end = subscription.trialEndsAt ? new Date(subscription.trialEndsAt) : null;
  return {
    plan: subscription.plan || 'trial',
    status: subscription.status || 'trial',
    trialEndsAt: end && !Number.isNaN(end.getTime()) ? end.toISOString() : null,
  };
}

function snapshotsMatch(left, right) {
  return Boolean(left && right) &&
    left.plan === right.plan &&
    left.status === right.status &&
    (left.trialEndsAt || null) === (right.trialEndsAt || null);
}

module.exports = {
  ALLOWED_STATUSES,
  normalizeSubscriptionChange,
  subscriptionSnapshot,
  snapshotsMatch,
};
