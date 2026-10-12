'use strict';

const express = require('express');
const mongoose = require('mongoose');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole, canManageOrganization, canAccessBranch } = require('../utils/tenantAuthorization');

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
    if (error.code === 11000) {
      return res.status(409).json({ message: 'This branch code is already used in your organization.' });
    }
    console.error('Unable to create branch:', error.message);
    return res.status(503).json({ message: 'The branch could not be created safely. Please try again.' });
  } finally {
    if (session) await session.endSession();
  }
});

router.get('/members', async (req, res) => {
  if (!hasTenantRole(req.tenant.membership, ['organization_owner', 'head_office_admin'])) {
    return res.status(403).json({ message: 'Only authorized head-office administrators can view organization memberships.' });
  }

  try {
    const memberships = await OrganizationMembership.find({
      organizationId: req.tenant.organization._id,
      status: { $ne: 'removed' },
    })
      .populate({ path: 'userId', select: 'username email role' })
      .populate({ path: 'branchIds', select: 'name code status' })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(memberships.filter((entry) => entry.userId).map((entry) => ({
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
      branches: entry.branchIds || [],
      createdAt: entry.createdAt,
    })));
  } catch (error) {
    console.error('Unable to list organization members:', error);
    return res.status(503).json({ message: 'Organization members could not be loaded.' });
  }
});

router.get('/audit', async (req, res) => {
  if (!hasTenantRole(req.tenant.membership, ['organization_owner', 'head_office_admin'])) {
    return res.status(403).json({ message: 'You are not allowed to view organization audit events.' });
  }

  const limitValue = Number.parseInt(req.query.limit, 10);
  const limit = Number.isFinite(limitValue) ? Math.max(1, Math.min(limitValue, 100)) : 50;
  const filter = { organizationId: req.tenant.organization._id };
  if (req.query.branchId) {
    if (!mongoose.Types.ObjectId.isValid(String(req.query.branchId))) {
      return res.status(400).json({ message: 'Choose a valid branch filter.' });
    }
    if (!canAccessBranch(req.tenant.membership, req.query.branchId)) {
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
