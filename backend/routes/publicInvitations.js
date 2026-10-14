'use strict';

const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const Guardian = require('../models/Guardian');
const OrganizationInvitation = require('../models/OrganizationInvitation');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const { hashInvitationToken, isInvitationLive } = require('../utils/invitationTokens');
const { assertOrganizationWritable, assertQuotaCapacity } = require('../utils/saasQuota');

const router = express.Router();

const signToken = (user) => jwt.sign(
  { user: { id: String(user._id), role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

function validPassword(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128 && value.trim().length > 0;
}

async function findLiveInvitation(token, session) {
  const tokenHash = hashInvitationToken(token);
  if (!tokenHash) return null;
  let query = OrganizationInvitation.findOne({ tokenHash }).select('+tokenHash');
  if (session) query = query.session(session);
  return query;
}

// Inspect invitation tokens from a POST body, not a URL query string.
router.post('/inspect', async (req, res) => {
  try {
    const invitation = await findLiveInvitation(req.body?.token);
    if (!invitation || !isInvitationLive(invitation)) {
      return res.status(410).json({ message: 'This invitation is invalid, already used, revoked, or expired. Ask your preschool administrator for a new invitation.' });
    }

    const organization = await Organization.findOne({
      _id: invitation.organizationId,
      status: 'active',
    }).select('name').lean();
    if (!organization) return res.status(410).json({ message: 'This preschool workspace is not available.' });

    return res.json({
      invitation: {
        fullName: invitation.fullName,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        organizationName: organization.name,
      },
    });
  } catch (error) {
    console.error('Unable to inspect invitation:', error.message);
    return res.status(503).json({ message: 'The invitation could not be checked right now.' });
  }
});

router.post('/accept', async (req, res) => {
  if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'Authentication is not configured on the server.' });
  const token = typeof req.body?.token === 'string' ? req.body.token : '';
  const password = req.body?.password;
  if (!hashInvitationToken(token)) return res.status(400).json({ message: 'Open the full invitation link and try again.' });
  if (!validPassword(password)) {
    return res.status(400).json({ message: 'Use a password between 12 and 128 characters. For an existing account, enter its current password.' });
  }

  let acceptedUser;
  let acceptedRole;
  let organizationId;
  try {
    await (async () => {
      const session = await mongoose.startSession();
      try {
        await session.withTransaction(async () => {
          const invitation = await findLiveInvitation(token, session);
          if (!invitation || !isInvitationLive(invitation)) {
            const expired = new Error('This invitation is invalid, already used, revoked, or expired.');
            expired.code = 'INVITATION_INVALID';
            throw expired;
          }
          const organization = await Organization.findOne({
            _id: invitation.organizationId,
            status: 'active',
          }).session(session);
          if (!organization) {
            const unavailable = new Error('This preschool workspace is not available.');
            unavailable.code = 'ORGANIZATION_UNAVAILABLE';
            throw unavailable;
          }

          const liveBranches = await Branch.countDocuments({
            _id: { $in: invitation.branchIds },
            organizationId: organization._id,
            status: 'active',
          }).session(session);
          if (!invitation.branchIds.length || liveBranches !== invitation.branchIds.length) {
            const branchUnavailable = new Error('The assigned branch access is no longer available. Contact the preschool administrator.');
            branchUnavailable.code = 'BRANCH_UNAVAILABLE';
            throw branchUnavailable;
          }

          let user = await User.findOne({ email: invitation.email }).session(session);
          if (user) {
            if (!(await user.matchPassword(password))) {
              const badPassword = new Error('This email already has an account. Enter that account’s current password to connect it to the invitation.');
              badPassword.code = 'EXISTING_ACCOUNT_PASSWORD';
              throw badPassword;
            }
          } else {
            const legacyRole = invitation.role === 'parent'
              ? 'student'
              : ['head_office_admin', 'branch_admin'].includes(invitation.role) ? 'admin' : 'teacher';
            const [createdUser] = await User.create([{
              username: invitation.fullName,
              email: invitation.email,
              password,
              role: legacyRole,
            }], { session });
            user = createdUser;
          }

          const priorMembership = await OrganizationMembership.findOne({
            organizationId: organization._id,
            userId: user._id,
          }).session(session);
          if (priorMembership) {
            const hasMembership = new Error('This account is already connected to the organization. Contact the administrator if you need your access changed.');
            hasMembership.code = 'MEMBERSHIP_EXISTS';
            throw hasMembership;
          }

          if (invitation.role === 'parent') {
            const guardians = await Guardian.find({
              _id: { $in: invitation.guardianIds },
              organizationId: organization._id,
              email: invitation.email,
            }).session(session);
            if (guardians.length !== invitation.guardianIds.length || !guardians.length) {
              const guardianMismatch = new Error('The family contact records no longer match this invitation. Contact the preschool.');
              guardianMismatch.code = 'GUARDIAN_MISMATCH';
              throw guardianMismatch;
            }
          }

          if (invitation.role === 'parent') {
            await assertOrganizationWritable({ organizationId: organization._id, session });
          } else {
            await assertQuotaCapacity({
              organizationId: organization._id,
              resource: 'staff',
              session,
              excludeInvitationId: invitation._id,
            });
          }

          const [membership] = await OrganizationMembership.create([{
            organizationId: organization._id,
            userId: user._id,
            role: invitation.role,
            branchIds: invitation.branchIds,
            guardianIds: invitation.role === 'parent' ? invitation.guardianIds : [],
            classNames: invitation.classNames || [],
            accessAllBranches: false,
            status: 'active',
            invitedBy: invitation.invitedBy,
            activatedAt: new Date(),
          }], { session });

          // Consume the one-time token with a conditional update inside the same
          // transaction. Saving the loaded Mongoose document can re-include its
          // immutable branch/class/guardian fields and fail strict validation.
          const acceptedAt = new Date();
          const consumedInvitation = await OrganizationInvitation.updateOne({
            _id: invitation._id,
            organizationId: organization._id,
            status: 'pending',
            expiresAt: { $gt: acceptedAt },
          }, {
            $set: {
              status: 'accepted',
              acceptedBy: user._id,
              acceptedAt,
            },
          }, { session });
          if (consumedInvitation.modifiedCount !== 1) {
            const alreadyConsumed = new Error('This invitation was already used, revoked, or expired.');
            alreadyConsumed.code = 'INVITATION_INVALID';
            throw alreadyConsumed;
          }

          await AuditEvent.create([{
            organizationId: organization._id,
            branchId: invitation.branchIds[0] || null,
            actorUserId: user._id,
            action: 'invitation.accepted',
            resourceType: 'organization_invitation',
            resourceId: String(invitation._id),
            summary: 'Invitation accepted; organization membership activated as ' + membership.role + '.',
            ipAddress: String(req.ip || '').slice(0, 64),
            userAgent: String(req.get('user-agent') || '').slice(0, 300),
          }], { session });

          acceptedUser = user;
          acceptedRole = membership.role;
          organizationId = String(organization._id);
        });
      } finally {
        await session.endSession();
      }
    })();

    return res.status(201).json({
      message: 'Invitation accepted. Your account is ready.',
      token: signToken(acceptedUser),
      user: {
        id: String(acceptedUser._id),
        username: acceptedUser.username,
        email: acceptedUser.email,
        role: acceptedUser.role,
        tenantRole: acceptedRole,
        organizationId,
      },
    });
  } catch (error) {
    const statuses = {
      INVITATION_INVALID: 410,
      ORGANIZATION_UNAVAILABLE: 410,
      BRANCH_UNAVAILABLE: 409,
      EXISTING_ACCOUNT_PASSWORD: 401,
      MEMBERSHIP_EXISTS: 409,
      GUARDIAN_MISMATCH: 409,
      PLAN_LIMIT_REACHED: 409,
      SUBSCRIPTION_READ_ONLY: 402,
      ORGANIZATION_UNAVAILABLE: 410,
    };
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'This invitation has already been used or a conflicting account was created. Try signing in or contact your administrator.' });
    console.error('Unable to accept invitation:', error.message);
    return res.status(503).json({ message: 'Your invitation could not be accepted safely. Please try again.' });
  }
});

module.exports = router;
