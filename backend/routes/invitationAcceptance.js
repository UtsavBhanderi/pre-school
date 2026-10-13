'use strict';

const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const OrganizationInvitation = require('../models/OrganizationInvitation');
const OrganizationMembership = require('../models/OrganizationMembership');
const Guardian = require('../models/Guardian');
const AuditEvent = require('../models/AuditEvent');

const router = express.Router();

const signToken = (user) => jwt.sign(
  { user: { id: String(user._id), role: user.role } },
  process.env.JWT_SECRET,
  { expiresIn: '1h' },
);

function clean(value, maxLength = 120) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function legacyRoleFor(membershipRole) {
  if (['organization_owner', 'head_office_admin', 'branch_admin'].includes(membershipRole)) return 'admin';
  if (membershipRole === 'parent') return 'student';
  return 'teacher';
}

router.post('/accept', async (req, res) => {
  const token = clean(req.body?.token, 256);
  const email = clean(req.body?.email, 254).toLowerCase();
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const fullName = clean(req.body?.fullName, 80);
  if (!token || token.length < 30 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8 || password.length > 128) {
    return res.status(400).json({ message: 'Enter the invited email and a valid password to accept the invitation.' });
  }
  if (!process.env.JWT_SECRET) return res.status(503).json({ message: 'Authentication is not configured on the server.' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      const invitation = await OrganizationInvitation.findOne({
        tokenHash,
        email,
        status: 'invited',
        expiresAt: { $gt: new Date() },
      }).session(session);
      if (!invitation) {
        const invalid = new Error('This invitation is invalid, expired, already used, or does not match that email.');
        invalid.code = 'INVITATION_INVALID';
        throw invalid;
      }

      let user = await User.findOne({ email }).session(session);
      if (user) {
        if (!(await user.matchPassword(password))) {
          const passwordError = new Error('An account already exists for this email. Enter that account’s current password to accept the invitation.');
          passwordError.code = 'EXISTING_PASSWORD_REQUIRED';
          throw passwordError;
        }
      } else {
        if (password.length < 12) {
          const shortPassword = new Error('Create a password with at least 12 characters.');
          shortPassword.code = 'PASSWORD_TOO_SHORT';
          throw shortPassword;
        }
        const guessedName = fullName || email.split('@')[0].replace(/[._-]+/g, ' ').slice(0, 80);
        const [createdUser] = await User.create([{
          username: guessedName,
          email,
          password,
          role: legacyRoleFor(invitation.role),
        }], { session });
        user = createdUser;
      }

      const existingMembership = await OrganizationMembership.findOne({
        organizationId: invitation.organizationId,
        userId: user._id,
      }).session(session);
      if (existingMembership) {
        const conflict = new Error('This account already has a membership for this organization. Ask an administrator to update the existing access.');
        conflict.code = 'MEMBERSHIP_EXISTS';
        throw conflict;
      }

      await OrganizationMembership.create([{
        organizationId: invitation.organizationId,
        userId: user._id,
        role: invitation.role,
        branchIds: invitation.branchIds,
        accessAllBranches: invitation.accessAllBranches,
        status: 'active',
        invitedBy: invitation.invitedBy,
        activatedAt: new Date(),
      }], { session });

      if (invitation.role === 'parent') {
        if (!invitation.guardianId) {
          const invalidGuardian = new Error('This parent invitation has no linked guardian record.');
          invalidGuardian.code = 'GUARDIAN_LINK_INVALID';
          throw invalidGuardian;
        }
        const linkedGuardian = await Guardian.findOneAndUpdate({
          _id: invitation.guardianId,
          organizationId: invitation.organizationId,
          portalUserId: null,
        }, {
          $set: { portalUserId: user._id, email },
        }, { new: true, session });
        if (!linkedGuardian) {
          const guardianTaken = new Error('This guardian record is already linked to another account or is no longer available.');
          guardianTaken.code = 'GUARDIAN_LINK_TAKEN';
          throw guardianTaken;
        }
      }

      const accepted = await OrganizationInvitation.findOneAndUpdate({
        _id: invitation._id,
        status: 'invited',
        expiresAt: { $gt: new Date() },
      }, {
        $set: { status: 'accepted', acceptedBy: user._id, acceptedAt: new Date() },
      }, { new: true, session });
      if (!accepted) {
        const consumed = new Error('This invitation was already accepted or expired.');
        consumed.code = 'INVITATION_INVALID';
        throw consumed;
      }

      await AuditEvent.create([{
        organizationId: invitation.organizationId,
        branchId: invitation.branchIds?.[0] || null,
        actorUserId: user._id,
        action: 'invitation.accepted',
        resourceType: 'organization_invitation',
        resourceId: String(invitation._id),
        summary: 'Invitation accepted for ' + email + ' as ' + invitation.role + '.',
      }], { session });

      result = { user, invitation };
    });

    return res.status(200).json({
      message: 'Invitation accepted. You can now sign in.',
      token: signToken(result.user),
      user: {
        id: String(result.user._id),
        username: result.user.username,
        email: result.user.email,
        role: result.user.role,
      },
      organization: String(result.invitation.organizationId),
      membershipRole: result.invitation.role,
    });
  } catch (error) {
    if (['INVITATION_INVALID', 'GUARDIAN_LINK_INVALID'].includes(error.code)) return res.status(400).json({ message: error.message });
    if (error.code === 'EXISTING_PASSWORD_REQUIRED') return res.status(401).json({ message: error.message });
    if (error.code === 'PASSWORD_TOO_SHORT') return res.status(400).json({ message: error.message });
    if (['MEMBERSHIP_EXISTS', 'GUARDIAN_LINK_TAKEN'].includes(error.code)) return res.status(409).json({ message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'This invitation could not be accepted because the account or membership already exists.' });
    console.error('Invitation acceptance failed:', error.message);
    return res.status(503).json({ message: 'The invitation could not be accepted safely. Please try again.' });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
