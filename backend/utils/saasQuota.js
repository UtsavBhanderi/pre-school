'use strict';

const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Student = require('../models/Student');
const OrganizationMembership = require('../models/OrganizationMembership');
const OrganizationInvitation = require('../models/OrganizationInvitation');
const { evaluatePlanCapacity, getSubscriptionState } = require('./saasEntitlements');

class SubscriptionPolicyError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'SubscriptionPolicyError';
    this.code = code;
    Object.assign(this, details);
  }
}

function withSession(query, session) {
  return session ? query.session(session) : query;
}

async function countOrganizationUsage(organizationId, { session, excludeInvitationId } = {}) {
  const now = new Date();
  const staffInvitationFilter = {
    organizationId,
    status: 'pending',
    role: { $ne: 'parent' },
    expiresAt: { $gt: now },
  };
  if (excludeInvitationId) staffInvitationFilter._id = { $ne: excludeInvitationId };

  const branchesQuery = Branch.countDocuments({ organizationId, status: { $ne: 'closed' } });
  const studentsQuery = Student.countDocuments({ organizationId });
  const membershipsQuery = OrganizationMembership.countDocuments({
    organizationId,
    status: 'active',
    role: { $ne: 'parent' },
  });
  const invitationsQuery = OrganizationInvitation.countDocuments(staffInvitationFilter);

  const [branches, students, staffMemberships, pendingStaffInvitations] = await Promise.all([
    withSession(branchesQuery, session),
    withSession(studentsQuery, session),
    withSession(membershipsQuery, session),
    withSession(invitationsQuery, session),
  ]);

  return {
    branches,
    students,
    staff: staffMemberships + pendingStaffInvitations,
    activeStaffMemberships: staffMemberships,
    pendingStaffInvitations,
  };
}

async function lockOrganizationForQuotaCheck(organizationId, session) {
  // Every operation that reserves tenant capacity updates this same organization
  // document inside its transaction. MongoDB write-conflict retries therefore
  // serialize the usage check with other quota-consuming writes for this school.
  let query = Organization.findOneAndUpdate(
    { _id: organizationId, status: 'active' },
    { $inc: { 'subscription.quotaVersion': 1 } },
    { new: true, runValidators: true },
  );
  if (session) query = query.session(session);
  const organization = await query;
  if (!organization) {
    throw new SubscriptionPolicyError('ORGANIZATION_UNAVAILABLE', 'This organization is not available.');
  }

  const subscription = getSubscriptionState(organization);
  if (!subscription.canWrite) {
    throw new SubscriptionPolicyError(
      'SUBSCRIPTION_READ_ONLY',
      subscription.readOnlyReason || 'This subscription is currently read-only.',
      { subscription },
    );
  }

  return organization;
}

async function assertQuotaCapacity({
  organizationId,
  resource,
  session,
  amount = 1,
  excludeInvitationId = null,
}) {
  if (!['branches', 'students', 'staff'].includes(resource)) {
    throw new TypeError('Unknown tenant quota resource: ' + resource);
  }
  if (!session) {
    throw new TypeError('Tenant capacity must be checked inside the write transaction.');
  }

  const organization = await lockOrganizationForQuotaCheck(organizationId, session);
  const subscription = getSubscriptionState(organization);
  const usage = await countOrganizationUsage(organizationId, { session, excludeInvitationId });
  const capacity = evaluatePlanCapacity({
    plan: subscription.plan,
    resource,
    used: usage[resource],
    requested: amount,
  });

  if (!capacity.allowed) {
    throw new SubscriptionPolicyError(
      'PLAN_LIMIT_REACHED',
      capacity.message,
      { resource, used: capacity.used, limit: capacity.limit, remaining: capacity.remaining, plan: subscription.plan },
    );
  }

  return { organization, subscription, usage, capacity };
}

async function getSubscriptionSummary(organization) {
  const organizationId = organization?._id;
  if (!organizationId) throw new TypeError('Organization is required to summarize subscription usage.');
  const subscription = getSubscriptionState(organization);
  const usage = await countOrganizationUsage(organizationId);
  return {
    plan: subscription.plan,
    status: subscription.status,
    sourceStatus: subscription.sourceStatus,
    canWrite: subscription.canWrite,
    readOnlyReason: subscription.readOnlyReason,
    trialEndsAt: subscription.trialEndsAt,
    trialDaysRemaining: subscription.trialDaysRemaining,
    limits: subscription.limits,
    usage: {
      ...usage,
      remaining: {
        branches: Math.max(0, subscription.limits.branches - usage.branches),
        students: Math.max(0, subscription.limits.students - usage.students),
        staff: Math.max(0, subscription.limits.staff - usage.staff),
      },
      percentages: {
        branches: Math.min(100, Math.round((usage.branches / subscription.limits.branches) * 100)),
        students: Math.min(100, Math.round((usage.students / subscription.limits.students) * 100)),
        staff: Math.min(100, Math.round((usage.staff / subscription.limits.staff) * 100)),
      },
    },
  };
}

module.exports = {
  SubscriptionPolicyError,
  countOrganizationUsage,
  assertQuotaCapacity,
  getSubscriptionSummary,
};
