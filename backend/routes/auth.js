'use strict';

const express = require('express');
const router = express.Router();
const User = require('../models/User');
const Organization = require('../models/Organization');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/auth');
const OrganizationMembership = require('../models/OrganizationMembership');
const bcrypt = require('bcryptjs');
const { createPasswordResetToken, hashPasswordResetToken, passwordResetExpiry, isValidNewPassword } = require('../utils/passwordResetTokens');
const { createPasswordResetUrl, sendPasswordResetEmail } = require('../utils/passwordResetEmail');
const { resolveWorkspaceMembershipState } = require('../utils/workspaceMembershipState');
const UserAccessAuditEvent = require('../models/UserAccessAuditEvent');

// The legacy school dashboard currently supports teacher and administrator accounts only.
const ALLOWED_ROLES = new Set(['teacher', 'admin']);

const signToken = (user) => jwt.sign(
  { user: { id: user.id, role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

// Account creation is restricted to authenticated legacy administrators.
router.post('/register', async (req, res) => {
  try {
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ message: 'Authentication is not configured on the server.' });
    }

    const token = req.header('x-auth-token');
    if (!token) {
      return res.status(401).json({ message: 'Administrator authentication is required to create users.' });
    }

    let requester;
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET);
      requester = await User.findById(decoded?.user?.id).select('-password');
    } catch {
      return res.status(401).json({ message: 'Token is invalid or has expired.' });
    }

    if (!requester) return res.status(401).json({ message: 'The authenticated account no longer exists.' });
    if (requester.status === 'suspended') {
      return res.status(401).json({ code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended. Contact your school administrator.' });
    }
    const tokenVersion = Number.isInteger(decoded?.user?.authVersion) ? decoded.user.authVersion : 0;
    const currentVersion = Number.isInteger(requester.authVersion) ? requester.authVersion : 0;
    if (tokenVersion !== currentVersion) {
      return res.status(401).json({ message: 'Your sign-in session has expired. Please sign in again.' });
    }
    if (requester.role !== 'admin') {
      return res.status(403).json({ message: 'Only an administrator can create user accounts.' });
    }

    // This endpoint is only for the legacy single-school workspace. SaaS users
    // must use organization-scoped invitations so new accounts receive a proper
    // organization membership, branch scope, and audit trail.
    const existingMembership = await OrganizationMembership.exists({ userId: requester._id });
    if (existingMembership) {
      return res.status(403).json({
        code: 'TENANT_INVITATION_REQUIRED',
        message: 'Use your organization’s Team & activity page to invite users and assign their school access.',
      });
    }
    const anyOrganizationExists = await Organization.exists({});
    if (anyOrganizationExists) {
      return res.status(403).json({
        code: 'LEGACY_API_DISABLED_FOR_SAAS',
        message: 'This account-creation flow is disabled while SaaS organization data exists. Use organization-scoped invitations.',
      });
    }

    const payload = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
      ? req.body
      : {};
    const username = typeof payload.username === 'string' ? payload.username.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
    const password = typeof payload.password === 'string' ? payload.password : '';
    const requestedRole = typeof payload.role === 'string' ? payload.role.trim().toLowerCase() : 'teacher';

    if (!username || !email || !password) {
      return res.status(400).json({ message: 'Full name, email, and password are required.' });
    }
    if (username.length < 2 || username.length > 80) {
      return res.status(400).json({ message: 'Full name must contain 2 to 80 characters.' });
    }
    if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    if (!isValidNewPassword(password)) {
      return res.status(400).json({ message: 'Choose a password between 12 and 128 characters.' });
    }
    if (!ALLOWED_ROLES.has(requestedRole)) {
      return res.status(400).json({ message: 'Choose Administrator or Teacher. Other account roles are not enabled in this workspace.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }

    const user = await User.create({ username, email, password, role: requestedRole, status: 'active' });
    let auditWarning = false;
    try {
      await UserAccessAuditEvent.create({
        actorUserId: requester._id,
        targetUserId: user._id,
        targetName: user.username,
        targetEmail: user.email,
        action: 'user.created',
        role: user.role,
        status: 'active',
        reason: 'Account created by an administrator',
        changedFields: ['role', 'status'],
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      });
    } catch (auditError) {
      auditWarning = true;
      console.error('Unable to record user creation audit event:', auditError?.name || 'audit_error');
    }

    // Do not return a JWT for the newly created user to the administrator.
    return res.status(201).json({
      message: 'Account created successfully.',
      auditWarning,
      user: { id: user.id, username: user.username, email: user.email, role: user.role, status: 'active', createdAt: user.createdAt },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    console.error('Registration failed:', error);
    return res.status(500).json({ message: 'Unable to create the account.' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user || !(await user.matchPassword(password))) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }
    if (user.status === 'suspended') {
      return res.status(403).json({ code: 'ACCOUNT_SUSPENDED', message: 'This account is suspended. Contact your school administrator.' });
    }

    return res.json({ token: signToken(user) });
  } catch (error) {
    console.error('Login failed:', error);
    return res.status(500).json({ message: 'Unable to log in right now.' });
  }
});

const PASSWORD_RESET_GENERIC_MESSAGE = 'If an account exists for that email address, password reset instructions will be sent shortly.';

router.post('/forgot-password', async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return res.status(400).json({ message: 'Enter a valid email address.' });
  }

  try {
    // Do not let the response reveal whether the email has an account.
    const user = await User.findOne({ email }).select('_id username email').lean();
    if (user) {
      const { token, tokenHash } = createPasswordResetToken();
      const expiresAt = passwordResetExpiry();
      await User.updateOne(
        { _id: user._id },
        { $set: { passwordResetTokenHash: tokenHash, passwordResetExpiresAt: expiresAt } },
        { runValidators: true },
      );

      const delivery = await sendPasswordResetEmail({
        email: user.email,
        fullName: user.username,
        resetUrl: createPasswordResetUrl(token),
      });

      if (!delivery.sent) {
        // Never expose the raw token through an API response or logs when email
        // delivery is unavailable. Clear the hash so a dead link is not stored.
        await User.updateOne(
          { _id: user._id, passwordResetTokenHash: tokenHash },
          { $set: { passwordResetTokenHash: null, passwordResetExpiresAt: null } },
        );
      }
    }

    return res.status(200).json({ message: PASSWORD_RESET_GENERIC_MESSAGE });
  } catch (error) {
    console.error('Unable to process password reset request:', error?.name || 'request_error');
    return res.status(503).json({ message: 'We could not process that request right now. Please try again shortly.' });
  }
});

router.post('/reset-password', async (req, res) => {
  const rawToken = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = req.body?.password;
  const tokenHash = hashPasswordResetToken(rawToken);
  if (!tokenHash) {
    return res.status(400).json({ message: 'The reset link is invalid. Request a new password reset email.' });
  }
  if (!isValidNewPassword(password)) {
    return res.status(400).json({ message: 'Choose a password between 12 and 128 characters. It cannot be blank.' });
  }

  try {
    // findOneAndUpdate is conditional and atomic: only one concurrent request
    // can consume the token. Hash the new password explicitly because this
    // atomic update does not execute the User document's save middleware.
    const passwordHash = await bcrypt.hash(password, 12);
    const now = new Date();
    const user = await User.findOneAndUpdate(
      {
        passwordResetTokenHash: tokenHash,
        passwordResetExpiresAt: { $gt: now },
      },
      {
        $set: {
          password: passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
        $inc: { authVersion: 1 },
      },
      { new: true, runValidators: true },
    ).select('_id');

    if (!user) {
      return res.status(410).json({ message: 'This reset link is invalid, expired, or already used. Request a new one.' });
    }

    return res.json({
      message: 'Password updated successfully. Please sign in again with your new password.',
    });
  } catch (error) {
    console.error('Unable to complete password reset:', error?.name || 'reset_error');
    return res.status(503).json({ message: 'Your password could not be updated safely. Please try again.' });
  }
});

router.get('/me', auth, async (req, res) => {
  try {
    const allMemberships = await OrganizationMembership.find({
      userId: req.user._id,
    })
      .populate({ path: 'organizationId', select: 'name slug status timezone locale currency subscription.plan subscription.status' })
      .populate({ path: 'branchIds', select: 'name code status timezone' })
      .sort({ createdAt: 1 })
      .lean();

    const { memberships, hasInactiveWorkspaceMemberships } = resolveWorkspaceMembershipState(allMemberships);

    return res.json({
      user: {
        hasInactiveWorkspaceMemberships,
        id: String(req.user._id),
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        memberships: memberships.filter((entry) => entry.organizationId).map((entry) => ({
          id: String(entry._id),
          organization: {
            id: String(entry.organizationId._id),
            name: entry.organizationId.name,
            slug: entry.organizationId.slug,
            timezone: entry.organizationId.timezone,
            locale: entry.organizationId.locale,
            currency: entry.organizationId.currency,
            status: entry.organizationId.status,
            subscription: entry.organizationId.subscription || {},
          },
          role: entry.role,
          status: entry.status,
          classNames: entry.classNames || [],
          branchIds: (entry.branchIds || []).map((branch) => ({
            id: String(branch._id),
            name: branch.name,
            code: branch.code,
            status: branch.status,
            timezone: branch.timezone,
          })),
          accessAllBranches: Boolean(entry.accessAllBranches),
        })),
      },
    });
  } catch (error) {
    console.error('Unable to load user workspace context:', error);
    return res.status(503).json({ message: 'Your school workspace could not be loaded.' });
  }
});

module.exports = router;
