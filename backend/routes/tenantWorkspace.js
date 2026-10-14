'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const TenantClass = require('../models/TenantClass');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole, canManageOrganization, canAccessBranch } = require('../utils/tenantAuthorization');
const { evaluateMembershipEditPermission, evaluateMembershipRoleTransition } = require('../utils/tenantMembershipPolicy');
const { assertQuotaCapacity, getSubscriptionSummary } = require('../utils/saasQuota');

const router = express.Router();

router.use(tenantContext);

function isValidTimezone(timezone) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function branchPayload(body = {}) {
  const name = clean(body.name, 120);
  const code = clean(body.code, 16).toUpperCase();
  const timezone = clean(body.timezone, 100) || 'Asia/Kolkata';
  const address = body.address && typeof body.address === 'object' && !Array.isArray(body.address)
    ? body.address
    : {};
  const errors = {};

  if (name.length < 2) errors.name = 'Branch name must contain at least 2 characters.';
  if (code.length < 2 || !/^[A-Z0-9]+(?:-[A-Z0-9]+)*$/.test(code)) {
    errors.code = 'Branch code must use 2 to 16 letters, numbers or hyphens.';
  }
  if (!isValidTimezone(timezone)) errors.timezone = 'Choose a valid time zone.';
  const email = clean(body.email, 254).toLowerCase();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid branch email.';

  if (Object.keys(errors).length) return { valid: false, errors };
  return {
    valid: true,
    value: {
      name,
      code,
      timezone,
      phone: clean(body.phone, 30),
      email,
      address: {
        line1: clean(address.line1, 160),
        line2: clean(address.line2, 160),
        city: clean(address.city, 100),
        state: clean(address.state, 100),
        postalCode: clean(address.postalCode, 20),
        country: clean(address.country, 100) || 'India',
      },
    },
  };
}


router.get('/context', (req, res) => {
  const { organization, membership, branch } = req.tenant;
  return res.json({
    organization: {
      id: String(organization._id),
      name: organization.name,
      slug: organization.slug,
      timezone: organization.timezone,
      locale: organization.locale,
      currency: organization.currency,
      status: organization.status,
    },
    membership: {
      role: membership.role,
      status: membership.status,
      accessAllBranches: membership.accessAllBranches,
      branchIds: (membership.branchIds || []).map(String),
    },
    branch: branch ? {
      id: String(branch._id),
      name: branch.name,
      code: branch.code,
      timezone: branch.timezone,
    } : null,
  });
});

router.get('/subscription', async (req, res) => {
  if (!hasTenantRole(req.tenant.membership, ['organization_owner', 'head_office_admin'])) {
    return res.status(403).json({ message: 'Only organization owners and head-office administrators can view plan usage.' });
  }
  try {
    return res.json(await getSubscriptionSummary(req.tenant.organization));
  } catch (error) {
    console.error('Unable to load subscription summary:', error.message);
    return res.status(503).json({ message: 'Subscription and capacity information could not be loaded.' });
  }
});

router.get('/branches', async (req, res) => {
  try {
    const filter = { organizationId: req.tenant.organization._id, status: { $ne: 'closed' } };
    if (!req.tenant.membership.accessAllBranches) {
      filter._id = { $in: req.tenant.membership.branchIds || [] };
    }
    const branches = await Branch.find(filter)
      .select('name code status phone email address timezone openedAt createdAt')
      .sort({ name: 1 })
      .lean();
    return res.json(branches);
  } catch (error) {
    console.error('Unable to list organization branches:', error);
    return res.status(503).json({ message: 'Branches could not be loaded.' });
  }
});

router.post('/branches', async (req, res) => {
  if (!canManageOrganization(req.tenant.membership)) {
    return res.status(403).json({ message: 'Only an organization owner or head-office administrator can create a branch.' });
  }

  const validation = branchPayload(req.body);
  if (!validation.valid) {
    return res.status(400).json({ message: 'Please correct the branch details.', errors: validation.errors });
  }

  let session = null;
  let createdBranch;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      await assertQuotaCapacity({
        organizationId: req.tenant.organization._id,
        resource: 'branches',
        session,
      });
      const [branch] = await Branch.create([{
        ...validation.value,
        organizationId: req.tenant.organization._id,
        createdBy: req.user._id,
      }], { session });

      await AuditEvent.create([{
        organizationId: req.tenant.organization._id,
        branchId: branch._id,
        actorUserId: req.user._id,
        action: 'branch.created',
        resourceType: 'branch',
        resourceId: String(branch._id),
        summary: 'Branch created: ' + branch.name + ' (' + branch.code + ').',
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });
      createdBranch = branch;
    });
    return res.status(201).json({
      message: 'Branch created.',
      branch: createdBranch,
    });
  } catch (error) {
    if (error.code === 'PLAN_LIMIT_REACHED') {
      return res.status(409).json({ code: error.code, message: error.message, limit: error.limit, used: error.used, plan: error.plan });
    }
    if (error.code === 'SUBSCRIPTION_READ_ONLY') {
      return res.status(402).json({ code: error.code, message: error.message });
    }
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This branch code is already used in your organization.' });
    }
    console.error('Unable to create branch:', error.message);
    return res.status(503).json({ message: 'The branch could not be created safely. Please try again.' });
  } finally {
    if (session) await session.endSession();
  }
});

const MUTABLE_STAFF_ROLES = [
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
];

const BRANCH_ADMIN_MANAGED_ROLES = ['teacher', 'admissions', 'transport_staff', 'parent'];

function memberBranchIds(membership) {
  return (membership?.branchIds || []).map((id) => String(id?._id || id));
}

router.get('/members', async (req, res) => {
  const manager = req.tenant.membership;
  const organizationManager = hasTenantRole(manager, ['organization_owner', 'head_office_admin']);
  const branchManager = hasTenantRole(manager, ['branch_admin']);
  if (!organizationManager && !branchManager) {
    return res.status(403).json({ message: 'You are not allowed to view this team list.' });
  }

  const filter = {
    organizationId: req.tenant.organization._id,
    status: { $ne: 'removed' },
  };
  const managerBranches = memberBranchIds(manager);
  if (branchManager) {
    if (!managerBranches.length) return res.json([]);
    filter.accessAllBranches = { $ne: true };
    filter.role = { $in: BRANCH_ADMIN_MANAGED_ROLES };
    filter.branchIds = { $in: managerBranches };
  }

  try {
    const memberships = await OrganizationMembership.find(filter)
      .populate({ path: 'userId', select: 'username email role' })
      .populate({ path: 'branchIds', select: 'name code status' })
      .sort({ createdAt: 1 })
      .limit(500)
      .lean();

    return res.json(memberships.filter((entry) => {
      if (!entry.userId) return false;
      if (!branchManager) return true;
      const assigned = memberBranchIds(entry);
      return assigned.length > 0 && assigned.every((id) => managerBranches.includes(id));
    }).map((entry) => {
      const branches = branchManager
        ? (entry.branchIds || []).filter((branch) => managerBranches.includes(String(branch._id)))
        : (entry.branchIds || []);
      return {
        id: String(entry._id),
        user: {
          id: String(entry.userId._id),
          name: entry.userId.username,
          email: entry.userId.email,
        },
        role: entry.role,
        status: entry.status,
        classNames: entry.classNames || [],
        accessAllBranches: Boolean(entry.accessAllBranches),
        branches,
        createdAt: entry.createdAt,
      };
    }));
  } catch (error) {
    console.error('Unable to list organization members:', error);
    return res.status(503).json({ message: 'Organization members could not be loaded.' });
  }
});

router.patch('/members/:id', async (req, res) => {
  const manager = req.tenant.membership;
  const organizationManager = hasTenantRole(manager, ['organization_owner', 'head_office_admin']);
  const branchManager = hasTenantRole(manager, ['branch_admin']);
  if (!organizationManager && !branchManager) {
    return res.status(403).json({ message: 'Only an authorized administrator can change team access.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Choose a valid team member.' });
  }

  const reason = clean(req.body?.reason, 500);
  if (reason.length < 3) return res.status(400).json({ message: 'Enter a reason for changing this person’s access.' });

  let session;
  try {
    session = await mongoose.startSession();
    let response;
    await session.withTransaction(async () => {
      const membership = await OrganizationMembership.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        status: { $ne: 'removed' },
      }).session(session);
      if (!membership) {
        const notFound = new Error('Team member not found in this organization.');
        notFound.code = 'MEMBER_NOT_FOUND';
        throw notFound;
      }
      const editPolicy = evaluateMembershipEditPermission({
        manager,
        target: membership,
        actorUserId: req.user._id,
      });
      if (!editPolicy.allowed) {
        const denied = new Error(editPolicy.message);
        denied.code = editPolicy.code;
        throw denied;
      }
      if (String(membership._id) === String(manager._id)) {
        const selfEdit = new Error('You cannot change or suspend your own access here. Ask another organization administrator to do that.');
        selfEdit.code = 'SELF_ACCESS_CHANGE';
        throw selfEdit;
      }
      if (membership.role === 'organization_owner') {
        const ownerTransfer = new Error('The organization owner cannot be changed or suspended from this screen. Use a separate, audited owner-transfer process.');
        ownerTransfer.code = 'OWNER_TRANSFER_REQUIRED';
        throw ownerTransfer;
      }

      const body = req.body || {};
      const requestedRole = Object.prototype.hasOwnProperty.call(body, 'role')
        ? clean(body.role, 40)
        : membership.role;
      const requestedStatus = Object.prototype.hasOwnProperty.call(body, 'status')
        ? clean(body.status, 20)
        : membership.status;

      const rolePolicy = evaluateMembershipRoleTransition({
        managerRole: manager.role,
        currentRole: membership.role,
        nextRole: requestedRole,
      });
      if (!rolePolicy.allowed) {
        const denied = new Error(rolePolicy.message);
        denied.code = rolePolicy.code;
        throw denied;
      }

      if (!['active', 'suspended'].includes(requestedStatus)) {
        const badStatus = new Error('Choose Active or Suspended.');
        badStatus.code = 'INVALID_STATUS';
        throw badStatus;
      }

      if (membership.role === 'parent' || requestedRole === 'parent') {
        const roleChanged = requestedRole !== membership.role;
        const familyScopeChanged = ['branchIds', 'classNames', 'accessAllBranches'].some((key) =>
          Object.prototype.hasOwnProperty.call(body, key)
        );
        if (roleChanged || familyScopeChanged) {
          const familyChange = new Error('Parent access must stay linked to its verified guardian records. Change only its active/suspended status here; use a verified guardian invitation flow to change family links.');
          familyChange.code = 'PARENT_SCOPE_LOCKED';
          throw familyChange;
        }
      } else if (!MUTABLE_STAFF_ROLES.includes(requestedRole)) {
        const badRole = new Error('Choose a supported staff role.');
        badRole.code = 'INVALID_ROLE';
        throw badRole;
      }

      if (branchManager) {
        if (!BRANCH_ADMIN_MANAGED_ROLES.includes(membership.role) ||
            !BRANCH_ADMIN_MANAGED_ROLES.includes(requestedRole) ||
            membership.accessAllBranches) {
          const notAllowed = new Error('Branch administrators can only manage branch-scoped teachers, admissions staff, transport staff and parent access.');
          notAllowed.code = 'BRANCH_ADMIN_SCOPE';
          throw notAllowed;
        }
        const assignedBefore = memberBranchIds(membership);
        if (!assignedBefore.length || assignedBefore.some((id) => !canAccessBranch(manager, id))) {
          const outsideScope = new Error('This team member has access outside your assigned branches, so only an organization administrator can change it.');
          outsideScope.code = 'BRANCH_ADMIN_SCOPE';
          throw outsideScope;
        }
      }

      if (membership.role === 'head_office_admin' && manager.role !== 'organization_owner') {
        const headOfficeControl = new Error('Only the organization owner can change another head-office administrator.');
        headOfficeControl.code = 'HEAD_OFFICE_CONTROL';
        throw headOfficeControl;
      }
      if (requestedRole === 'head_office_admin' && manager.role !== 'organization_owner') {
        const headOfficeGrant = new Error('Only the organization owner can grant head-office administrator access.');
        headOfficeGrant.code = 'HEAD_OFFICE_CONTROL';
        throw headOfficeGrant;
      }

      let accessAllBranches = membership.accessAllBranches;
      if (Object.prototype.hasOwnProperty.call(body, 'accessAllBranches')) {
        if (typeof body.accessAllBranches !== 'boolean') {
          const invalidScope = new Error('Choose a valid all-branch access setting.');
          invalidScope.code = 'INVALID_BRANCH_SCOPE';
          throw invalidScope;
        }
        accessAllBranches = body.accessAllBranches;
      }
      if (accessAllBranches && requestedRole !== 'head_office_admin') {
        const invalidScope = new Error('Only a head-office administrator may have organization-wide branch access.');
        invalidScope.code = 'INVALID_BRANCH_SCOPE';
        throw invalidScope;
      }
      if (branchManager && accessAllBranches) {
        const invalidScope = new Error('Branch administrators cannot grant all-branch access.');
        invalidScope.code = 'INVALID_BRANCH_SCOPE';
        throw invalidScope;
      }

      let branchIds = memberBranchIds(membership);
      if (Object.prototype.hasOwnProperty.call(body, 'branchIds')) {
        if (!Array.isArray(body.branchIds) || body.branchIds.length > 100) {
          const invalidBranches = new Error('Provide a valid list of up to 100 branch IDs.');
          invalidBranches.code = 'INVALID_BRANCHES';
          throw invalidBranches;
        }
        const values = body.branchIds.map((id) => String(id));
        if (values.some((id) => !mongoose.Types.ObjectId.isValid(id)) || new Set(values).size !== values.length) {
          const invalidBranches = new Error('Branch access contains an invalid or repeated branch.');
          invalidBranches.code = 'INVALID_BRANCHES';
          throw invalidBranches;
        }
        branchIds = values;
      }

      if (accessAllBranches) {
        branchIds = [];
      } else if (membership.role !== 'parent') {
        if (!branchIds.length) {
          const missingBranch = new Error('Assign at least one branch to this staff member.');
          missingBranch.code = 'INVALID_BRANCHES';
          throw missingBranch;
        }
        const activeBranches = await Branch.find({
          _id: { $in: branchIds },
          organizationId: req.tenant.organization._id,
          status: 'active',
        }).select('_id').session(session).lean();
        if (activeBranches.length !== branchIds.length) {
          const invalidBranches = new Error('Every assigned branch must be active and belong to this organization.');
          invalidBranches.code = 'INVALID_BRANCHES';
          throw invalidBranches;
        }
        if (branchIds.some((id) => !canAccessBranch(manager, id))) {
          const outsideScope = new Error('You cannot assign access to a branch outside your own access.');
          outsideScope.code = 'BRANCH_ADMIN_SCOPE';
          throw outsideScope;
        }
      }

      let classNames = Array.isArray(membership.classNames) ? [...membership.classNames] : [];
      if (requestedRole === 'teacher') {
        if (Object.prototype.hasOwnProperty.call(body, 'classNames')) {
          if (!Array.isArray(body.classNames) || body.classNames.length > 100) {
            const badClasses = new Error('Provide a valid list of up to 100 class names.');
            badClasses.code = 'INVALID_CLASSES';
            throw badClasses;
          }
          classNames = [...new Set(body.classNames.map((value) => clean(value, 80)))];
        }
        if (!classNames.length || classNames.some((name) => name.length < 2)) {
          const missingClasses = new Error('Assign at least one configured class to this teacher.');
          missingClasses.code = 'INVALID_CLASSES';
          throw missingClasses;
        }
        for (const branchId of branchIds) {
          const assigned = await TenantClass.distinct('name', {
            organizationId: req.tenant.organization._id,
            branchId,
            name: { $in: classNames },
            status: 'active',
          }).session(session);
          if (assigned.length !== classNames.length) {
            const missingClasses = new Error('Every class assigned to this teacher must be active in every assigned branch.');
            missingClasses.code = 'INVALID_CLASSES';
            throw missingClasses;
          }
        }
      } else {
        if (Object.prototype.hasOwnProperty.call(body, 'classNames') &&
            (!Array.isArray(body.classNames) || body.classNames.length > 0)) {
          const badClasses = new Error('Class assignments are only available for teacher accounts.');
          badClasses.code = 'INVALID_CLASSES';
          throw badClasses;
        }
        classNames = [];
      }

      const changedFields = [];
      if (membership.role !== requestedRole) changedFields.push('role');
      if (membership.status !== requestedStatus) changedFields.push('status');
      if (String(membership.accessAllBranches) !== String(accessAllBranches)) changedFields.push('accessAllBranches');
      if (memberBranchIds(membership).join(',') !== branchIds.join(',')) changedFields.push('branchIds');
      if ((membership.classNames || []).join(',') !== classNames.join(',')) changedFields.push('classNames');

      if (!changedFields.length) {
        const noChanges = new Error('No access settings changed. Edit a role, branch, class or status before saving.');
        noChanges.code = 'NO_CHANGES';
        throw noChanges;
      }

      membership.role = requestedRole;
      membership.status = requestedStatus;
      membership.accessAllBranches = accessAllBranches;
      membership.branchIds = branchIds;
      membership.classNames = classNames;
      await membership.save({ session });

      const auditBranchId = req.tenant.branch?._id ||
        branchIds[0] ||
        membership.branchIds[0] ||
        null;
      await AuditEvent.create([{
        organizationId: req.tenant.organization._id,
        branchId: auditBranchId,
        actorUserId: req.user._id,
        action: 'membership.updated',
        resourceType: 'organization_membership',
        resourceId: String(membership._id),
        outcome: 'success',
        reason,
        summary: 'Organization membership access updated.',
        changedFields,
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      response = {
        message: requestedStatus === 'suspended'
          ? 'Access suspended. The person can no longer use this organization workspace.'
          : 'Team access saved.',
        memberId: String(membership._id),
        role: membership.role,
        status: membership.status,
      };
    });

    return res.json(response);
  } catch (error) {
    const codes = {
      MEMBER_NOT_FOUND: 404,
      SELF_ACCESS_CHANGE: 409,
      OWNER_TRANSFER_REQUIRED: 409,
      INVALID_STATUS: 400,
      NO_CHANGES: 400,
      PARENT_SCOPE_LOCKED: 409,
      INVALID_ROLE: 400,
      BRANCH_ADMIN_SCOPE: 403,
      HEAD_OFFICE_CONTROL: 403,
      INVALID_BRANCH_SCOPE: 400,
      INVALID_BRANCHES: 400,
      INVALID_CLASSES: 400,
    };
    if (codes[error.code]) return res.status(codes[error.code]).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'A conflicting membership change was detected. Refresh the team list and try again.' });
    console.error('Unable to update organization membership:', error.message);
    return res.status(503).json({ message: 'Team access could not be updated safely.' });
  } finally {
    if (session) await session.endSession();
  }
});

router.get('/audit', async (req, res) => {
  const manager = req.tenant.membership;
  const organizationManager = hasTenantRole(manager, ['organization_owner', 'head_office_admin']);
  const branchManager = hasTenantRole(manager, ['branch_admin']);
  if (!organizationManager && !branchManager) {
    return res.status(403).json({ message: 'You are not allowed to view audit events for this organization.' });
  }

  const limitValue = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 100)) : 50;
  const filter = { organizationId: req.tenant.organization._id };
  const managerBranches = memberBranchIds(manager);
  if (branchManager) {
    if (!managerBranches.length) return res.json([]);
    filter.branchId = { $in: managerBranches };
  }
  if (req.query.branchId) {
    if (!mongoose.Types.ObjectId.isValid(String(req.query.branchId))) {
      return res.status(400).json({ message: 'Choose a valid branch filter.' });
    }
    if (!canAccessBranch(manager, req.query.branchId)) {
      return res.status(403).json({ message: 'You do not have access to this branch.' });
    }
    filter.branchId = req.query.branchId;
  }

  try {
    const events = await AuditEvent.find(filter)
      .select('branchId actorUserId action resourceType resourceId outcome reason summary changedFields ipAddress userAgent createdAt')
      .populate({ path: 'branchId', select: 'name code' })
      .populate({ path: 'actorUserId', select: 'username email' })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean();
    return res.json(events);
  } catch (error) {
    console.error('Unable to list audit events:', error);
    return res.status(503).json({ message: 'Audit history could not be loaded.' });
  }
});
module.exports = router;
