'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const auth = require('../middleware/auth');
const { validateOrganizationRegistration } = require('../utils/tenantRegistration');

const router = express.Router();

const signToken = (user) => jwt.sign(
  { user: { id: String(user._id), role: user.role } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

function registrationReadinessError() {
  return process.env.ENABLE_SAAS_REGISTRATION === 'true' &&
    process.env.SAAS_TENANT_DATA_READY === 'true';
}

// This gate intentionally requires two explicit deployment settings. Do not
// enable self-service tenants until all school APIs and media delivery have
// tenant enforcement and the isolation test suite passes.
router.post('/register', async (req, res) => {
  if (!registrationReadinessError()) {
    return res.status(503).json({
      code: 'SAAS_ONBOARDING_NOT_READY',
      message: 'Self-service registration is not available yet. Organization onboarding will open after tenant data and private file access have passed the launch checks.',
    });
  }

  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Authentication is not configured on the server.' });
  }

  const validation = validateOrganizationRegistration(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Please correct the highlighted organization details.',
      errors: validation.errors,
    });
  }

  const input = validation.value;
  let session = null;
  let created = null;

  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const existingUser = await User.findOne({ email: input.email }).select('_id').session(session);
      if (existingUser) {
        const conflict = new Error('An account with this email already exists. Sign in or use another email.');
        conflict.code = 'EMAIL_EXISTS';
        throw conflict;
      }

      const [user] = await User.create([{
        username: input.username,
        email: input.email,
        password: input.password,
        role: 'admin',
      }], { session });

      // Random suffix avoids leaking organization names through slug collisions
      // and keeps slugs unique even when two organizations have the same name.
      const slug = input.organizationSlugBase + '-' + crypto.randomBytes(4).toString('hex');
      const [organization] = await Organization.create([{
        name: input.organizationName,
        slug,
        timezone: input.timezone,
        createdBy: user._id,
        subscription: { plan: 'trial', status: 'trial' },
      }], { session });

      const [branch] = await Branch.create([{
        organizationId: organization._id,
        name: input.branchName,
        code: input.branchCode,
        timezone: input.timezone,
        openedAt: new Date(),
        createdBy: user._id,
      }], { session });

      await OrganizationMembership.create([{
        organizationId: organization._id,
        userId: user._id,
        role: 'organization_owner',
        branchIds: [branch._id],
        accessAllBranches: true,
        status: 'active',
        activatedAt: new Date(),
      }], { session });

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: branch._id,
        actorUserId: user._id,
        action: 'organization.registered',
        resourceType: 'organization',
        resourceId: String(organization._id),
        summary: 'Organization and initial branch created.',
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      created = { user, organization, branch };
    });

    return res.status(201).json({
      message: 'Organization created.',
      token: signToken(created.user),
      user: {
        id: String(created.user._id),
        username: created.user.username,
        email: created.user.email,
        role: created.user.role,
      },
      organization: {
        id: String(created.organization._id),
        name: created.organization.name,
        slug: created.organization.slug,
        timezone: created.organization.timezone,
        currency: created.organization.currency,
      },
      branch: {
        id: String(created.branch._id),
        name: created.branch.name,
        code: created.branch.code,
      },
    });
  } catch (error) {
    if (error.code === 'EMAIL_EXISTS' || error.code === 11000) {
      return res.status(409).json({
        message: error.code === 'EMAIL_EXISTS'
          ? error.message
          : 'A conflicting account or organization identifier already exists. Please try again.',
      });
    }
    console.error('Organization registration failed:', error.message);
    return res.status(503).json({
      message: 'The organization could not be created safely. Please try again later.',
    });
  } finally {
    if (session) await session.endSession();
  }
});

router.get('/mine', auth, async (req, res) => {
  try {
    const memberships = await OrganizationMembership.find({
      userId: req.user._id,
      status: 'active',
    })
      .populate({ path: 'organizationId', select: 'name slug status timezone locale currency subscription.plan subscription.status' })
      .populate({ path: 'branchIds', select: 'name code status timezone' })
      .sort({ createdAt: 1 })
      .lean();

    return res.json(memberships.filter((membership) => membership.organizationId));
  } catch (error) {
    console.error('Unable to list organization memberships:', error);
    return res.status(503).json({ message: 'Your organization memberships could not be loaded.' });
  }
});

module.exports = router;
