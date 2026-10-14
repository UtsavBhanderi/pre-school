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
const PendingOrganizationSignup = require('../models/PendingOrganizationSignup');
const {
  createOrganizationSignupToken,
  hashOrganizationSignupToken,
  organizationSignupExpiry,
} = require('../utils/organizationSignupTokens');
const { validateOrganizationSignupRequest } = require('../utils/organizationSignupValidation');
const {
  createOrganizationVerificationUrl,
  isVerificationEmailConfigured,
  sendOrganizationVerificationEmail,
} = require('../utils/organizationSignupEmail');

const router = express.Router();

const signToken = (user) => jwt.sign(
  { user: { id: String(user._id), role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const ORGANIZATION_TRIAL_DAYS = 14;
const GENERIC_SIGNUP_MESSAGE = 'If the email address can be used, we will send a verification link shortly.';
const ONBOARDING_CLOSED_MESSAGE = 'Online preschool registration is temporarily unavailable. Please try again later.';

function validFrontendConfiguration() {
  const explicit = String(process.env.FRONTEND_URL || '').trim();
  const configuredOrigin = String(process.env.FRONTEND_ORIGIN || '').split(',')[0].trim();
  const candidate = explicit || configuredOrigin;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:'].includes(parsed.protocol)) return false;
    if (process.env.NODE_ENV === 'production' &&
        (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '::1')) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function registrationIsEnabled() {
  // This third switch is an explicit launch sign-off. It must remain false
  // until the migration, privacy, backup/restore and tenant-isolation gates
  // are formally reviewed; the other flags do not imply approval.
  return process.env.ENABLE_SAAS_REGISTRATION === 'true' &&
    process.env.SAAS_TENANT_DATA_READY === 'true' &&
    process.env.SAAS_LAUNCH_APPROVED === 'true' &&
    Boolean(process.env.JWT_SECRET) &&
    isVerificationEmailConfigured() &&
    validFrontendConfiguration();
}

router.get('/registration-status', (req, res) => {
  const enabled = registrationIsEnabled();
  return res.json({
    enabled,
    message: enabled
      ? 'Online registration is available.'
      : ONBOARDING_CLOSED_MESSAGE,
  });
});

// Retire the previous direct registration endpoint. It created owner accounts
// before verifying the email; new signups must go through the verified flow.
router.post('/register', (req, res) => res.status(410).json({
  code: 'VERIFIED_SIGNUP_REQUIRED',
  message: 'Direct registration has been retired. Use the email-verified preschool signup flow.',
}));

router.post('/signup', async (req, res) => {
  if (!registrationIsEnabled()) {
    return res.status(503).json({ code: 'SAAS_ONBOARDING_NOT_READY', message: ONBOARDING_CLOSED_MESSAGE });
  }

  const validation = validateOrganizationSignupRequest(req.body);
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Please correct the preschool and owner details.',
      errors: validation.errors,
    });
  }

  const input = validation.value;
  try {
    // Do not disclose whether the email is already registered.
    const existingUser = await User.findOne({ email: input.email }).select('_id').lean();
    if (existingUser) return res.status(200).json({ message: GENERIC_SIGNUP_MESSAGE });

    const now = new Date();
    const existingPending = await PendingOrganizationSignup.findOne({
      email: input.email,
      status: 'pending',
    }).select('_id expiresAt').lean();

    // Do not send unlimited verification email retries on repeated requests.
    if (existingPending && existingPending.expiresAt > now) {
      return res.status(200).json({ message: GENERIC_SIGNUP_MESSAGE });
    }

    const { token, tokenHash } = createOrganizationSignupToken();
    const expiresAt = organizationSignupExpiry(now);
    let pending = null;
    if (existingPending) {
      pending = await PendingOrganizationSignup.findOneAndUpdate({
        _id: existingPending._id,
        status: 'pending',
        expiresAt: { $lte: now },
      }, {
        $set: { ...input, tokenHash, expiresAt, status: 'pending' },
      }, { new: true, runValidators: true });
    }

    if (!pending) {
      pending = await PendingOrganizationSignup.create({
        ...input,
        tokenHash,
        expiresAt,
        status: 'pending',
      });
    }

    const delivery = await sendOrganizationVerificationEmail({
      email: input.email,
      fullName: input.username,
      organizationName: input.organizationName,
      verificationUrl: createOrganizationVerificationUrl(token),
    });

    if (!delivery.sent) {
      // A token must never be returned to an anonymous caller. Mark it unusable
      // so an email retry can start a fresh flow.
      await PendingOrganizationSignup.updateOne({
        _id: pending._id,
        tokenHash,
        status: 'pending',
      }, { $set: { status: 'expired' } });
      console.error('Organization signup verification email was not delivered.');
    }

    return res.status(200).json({ message: GENERIC_SIGNUP_MESSAGE });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(200).json({ message: GENERIC_SIGNUP_MESSAGE });
    }
    console.error('Unable to start organization signup:', error?.name || 'signup_error');
    return res.status(503).json({ message: 'We could not process that signup right now. Please try again shortly.' });
  }
});

router.post('/signup/inspect', async (req, res) => {
  if (!registrationIsEnabled()) {
    return res.status(503).json({ code: 'SAAS_ONBOARDING_NOT_READY', message: ONBOARDING_CLOSED_MESSAGE });
  }
  const tokenHash = hashOrganizationSignupToken(req.body?.token);
  if (!tokenHash) {
    return res.status(410).json({ message: 'This verification link is invalid or expired. Request a new one.' });
  }

  try {
    const now = new Date();
    const pending = await PendingOrganizationSignup.findOne({
      tokenHash,
      status: 'pending',
      expiresAt: { $gt: now },
    }).select('organizationName branchName username email timezone expiresAt').lean();
    if (!pending) {
      return res.status(410).json({ message: 'This verification link is invalid, expired, or already used. Request a new one.' });
    }
    return res.json({
      signup: {
        organizationName: pending.organizationName,
        branchName: pending.branchName,
        ownerName: pending.username,
        email: pending.email,
        timezone: pending.timezone,
        expiresAt: pending.expiresAt,
      },
    });
  } catch (error) {
    console.error('Unable to inspect organization verification:', error?.name || 'inspect_error');
    return res.status(503).json({ message: 'The verification link could not be checked right now.' });
  }
});

router.post('/signup/complete', async (req, res) => {
  if (!registrationIsEnabled()) {
    return res.status(503).json({ code: 'SAAS_ONBOARDING_NOT_READY', message: ONBOARDING_CLOSED_MESSAGE });
  }
  if (!process.env.JWT_SECRET) {
    return res.status(503).json({ message: 'Authentication is not configured on the server.' });
  }

  const tokenHash = hashOrganizationSignupToken(req.body?.token);
  const password = req.body?.password;
  if (!tokenHash) return res.status(410).json({ message: 'This verification link is invalid or expired. Request a new one.' });
  if (typeof password !== 'string' || password.length < 12 || password.length > 128 || !password.trim()) {
    return res.status(400).json({ message: 'Choose a password between 12 and 128 characters.' });
  }

  let session = null;
  let created = null;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const now = new Date();
      const pending = await PendingOrganizationSignup.findOne({
        tokenHash,
        status: 'pending',
        expiresAt: { $gt: now },
      }).select('+tokenHash').session(session);

      if (!pending) {
        const invalid = new Error('This verification link is invalid, expired, or already used. Request a new one.');
        invalid.code = 'SIGNUP_TOKEN_INVALID';
        throw invalid;
      }

      const existingUser = await User.findOne({ email: pending.email }).select('_id').session(session);
      if (existingUser) {
        const usedEmail = new Error('This email address is already connected to an account. Please sign in or contact support.');
        usedEmail.code = 'SIGNUP_EMAIL_EXISTS';
        throw usedEmail;
      }

      const [user] = await User.create([{
        username: pending.username,
        email: pending.email,
        password,
        role: 'admin',
      }], { session });

      const slug = pending.organizationSlugBase + '-' + crypto.randomBytes(4).toString('hex');
      const trialEndsAt = new Date(now.getTime() + ORGANIZATION_TRIAL_DAYS * 24 * 60 * 60 * 1000);
      const [organization] = await Organization.create([{
        name: pending.organizationName,
        slug,
        timezone: pending.timezone,
        createdBy: user._id,
        subscription: { plan: 'trial', status: 'trial', trialEndsAt },
      }], { session });

      const [branch] = await Branch.create([{
        organizationId: organization._id,
        name: pending.branchName,
        code: pending.branchCode,
        timezone: pending.timezone,
        openedAt: now,
        createdBy: user._id,
      }], { session });

      await OrganizationMembership.create([{
        organizationId: organization._id,
        userId: user._id,
        role: 'organization_owner',
        branchIds: [branch._id],
        accessAllBranches: true,
        status: 'active',
        activatedAt: now,
      }], { session });

      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: branch._id,
        actorUserId: user._id,
        action: 'organization.registered',
        resourceType: 'organization',
        resourceId: String(organization._id),
        summary: 'Email-verified organization and initial branch created; trial started.',
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      const consumed = await PendingOrganizationSignup.updateOne({
        _id: pending._id,
        tokenHash,
        status: 'pending',
        expiresAt: { $gt: now },
      }, { $set: { status: 'completed', completedAt: now } }, { session });
      if (consumed.modifiedCount !== 1) {
        const raced = new Error('This verification link is invalid, expired, or already used. Request a new one.');
        raced.code = 'SIGNUP_TOKEN_INVALID';
        throw raced;
      }

      created = { user, organization, branch, trialEndsAt };
    });

    return res.status(201).json({
      message: 'Your email is verified and your preschool workspace is ready.',
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
        trialEndsAt: created.trialEndsAt,
      },
      branch: {
        id: String(created.branch._id),
        name: created.branch.name,
        code: created.branch.code,
      },
    });
  } catch (error) {
    if (error.code === 'SIGNUP_TOKEN_INVALID') {
      return res.status(410).json({ message: error.message });
    }
    if (error.code === 'SIGNUP_EMAIL_EXISTS' || error.code === 11000) {
      return res.status(409).json({
        message: error.code === 'SIGNUP_EMAIL_EXISTS'
          ? error.message
          : 'A conflicting account or organization identifier already exists. Please request a new verification email.',
      });
    }
    console.error('Unable to complete organization signup:', error?.name || 'completion_error');
    return res.status(503).json({ message: 'Your preschool workspace could not be created safely. Please try again.' });
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
