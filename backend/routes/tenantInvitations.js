'use strict';

const crypto = require('crypto');
const express = require('express');
const mongoose = require('mongoose');
const OrganizationInvitation = require('../models/OrganizationInvitation');
const OrganizationMembership = require('../models/OrganizationMembership');
const Branch = require('../models/Branch');
const Guardian = require('../models/Guardian');
const User = require('../models/User');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');
const { getTransport, buildInvitationUrl, sendInvitationEmail } = require('../utils/emailDelivery');

const router = express.Router();
router.use(tenantContext);

const INVITE_ROLES = new Set([
  'head_office_admin', 'branch_admin', 'admissions',
  'teacher', 'accountant', 'hr_manager', 'transport_staff', 'parent',
]);

function clean(value, maxLength = 254) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function canInvite(req) {
  return hasTenantRole(req.tenant?.membership, ['organization_owner', 'head_office_admin']);
}

async function audit(req, action, invitation, summary) {
  await AuditEvent.create({
    organizationId: req.tenant.organization._id,
    branchId: req.tenant.branch?._id || invitation.branchIds?.[0] || null,
    actorUserId: req.user._id,
    action,
    resourceType: 'organization_invitation',
    resourceId: String(invitation._id),
    summary,
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  });
}

router.get('/', async (req, res) => {
  if (!canInvite(req)) return res.status(403).json({ message: 'Only an organization owner or head-office administrator can manage invitations.' });
  try {
    const invitations = await OrganizationInvitation.find({
      organizationId: req.tenant.organization._id,
    })
      .select('email role branchIds accessAllBranches guardianId expiresAt status invitedBy acceptedBy acceptedAt revokedAt createdAt')
      .populate({ path: 'branchIds', select: 'name code' })
      .populate({ path: 'invitedBy', select: 'username email' })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    return res.json(invitations.map((item) => ({
      id: String(item._id),
      email: item.email,
      role: item.role,
      branches: item.branchIds || [],
      accessAllBranches: Boolean(item.accessAllBranches),
      guardianId: item.guardianId ? String(item.guardianId) : null,
      status: item.status,
      invitedBy: item.invitedBy ? item.invitedBy.username : '—',
      expiresAt: item.expiresAt,
      acceptedAt: item.acceptedAt,
      revokedAt: item.revokedAt,
      createdAt: item.createdAt,
    })));
  } catch (error) {
    console.error('Unable to list invitations:', error);
    return res.status(503).json({ message: 'Invitations could not be loaded.' });
  }
});

router.post('/', async (req, res) => {
  if (!canInvite(req)) return res.status(403).json({ message: 'Only an organization owner or head-office administrator can invite users.' });

  const email = clean(req.body?.email).toLowerCase();
  const role = clean(req.body?.role, 40);
  const accessAllBranches = req.body?.accessAllBranches === true;
  const guardianIdText = clean(req.body?.guardianId, 32);
  const rawBranchIds = Array.isArray(req.body?.branchIds) ? [...new Set(req.body.branchIds.map((id) => String(id)))] : [];
  const errors = {};
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'Enter a valid email address.';
  if (!INVITE_ROLES.has(role)) errors.role = 'Choose a role that can be invited.';
  if (accessAllBranches && role !== 'head_office_admin') errors.accessAllBranches = 'Only a head-office administrator can be given organization-wide branch access.';
  if (role === 'head_office_admin' && !accessAllBranches) errors.accessAllBranches = 'Head-office administrators must have all-branch access.';

  if (rawBranchIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) errors.branchIds = 'Choose valid branches.';
  if (role !== 'head_office_admin' && rawBranchIds.length === 0) errors.branchIds = 'Assign at least one branch.';
  if (role === 'parent' && !mongoose.Types.ObjectId.isValid(guardianIdText)) errors.guardianId = 'Choose the parent or guardian contact to invite.';

  if (Object.keys(errors).length) return res.status(400).json({ message: 'Please correct the invitation details.', errors });

  if (!getTransport() && process.env.NODE_ENV === 'production') {
    return res.status(503).json({ message: 'Email delivery is not configured. Invitation email is required in production.' });
  }

  try {
    const organizationId = req.tenant.organization._id;
    const activeBranches = await Branch.find({
      organizationId,
      status: 'active',
      ...(accessAllBranches ? {} : { _id: { $in: rawBranchIds } }),
    }).select('_id code name').lean();
    if (!accessAllBranches && activeBranches.length !== rawBranchIds.length) {
      return res.status(400).json({ message: 'One or more selected branches are not active branches in this organization.' });
    }
    const branchIds = accessAllBranches ? activeBranches.map((item) => item._id) : rawBranchIds;

    let guardian = null;
    if (role === 'parent') {
      guardian = await Guardian.findOne({
        _id: guardianIdText,
        organizationId,
      }).select('_id email fullName portalUserId').lean();
      if (!guardian) return res.status(404).json({ message: 'Guardian contact not found in this organization.' });
      if (guardian.portalUserId) return res.status(409).json({ message: 'This guardian already has portal access. Ask them to sign in or use the account recovery process.' });
      if (guardian.email && guardian.email.toLowerCase() !== email) {
        return res.status(400).json({ message: 'The invitation email must match the email saved on the guardian contact.' });
      }
      const linkedBranches = await Branch.find({ organizationId, _id: { $in: branchIds }, status: 'active' }).select('_id').lean();
      const linkedIds = new Set(linkedBranches.map((item) => String(item._id)));
      const link = await require('../models/ChildGuardian').findOne({
        organizationId,
        guardianId: guardian._id,
        branchId: { $in: [...linkedIds] },
      }).select('_id').lean();
      if (!link) return res.status(400).json({ message: 'The guardian must be linked to a child in one of the assigned branches before portal access is invited.' });
    }

    const existingUser = await User.findOne({ email }).select('_id').lean();
    if (existingUser) {
      const activeMember = await OrganizationMembership.findOne({
        organizationId,
        userId: existingUser._id,
        status: 'active',
      }).select('_id').lean();
      if (activeMember) {
        return res.status(409).json({ message: 'This email already has active membership in the organization.' });
      }
    }
    const pending = await OrganizationInvitation.findOne({
      organizationId,
      email,
      status: 'invited',
      expiresAt: { $gt: new Date() },
    }).select('_id').lean();
    if (pending) return res.status(409).json({ message: 'An active invitation already exists for this email.' });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
    const invitation = await OrganizationInvitation.create({
      organizationId,
      branchIds,
      accessAllBranches,
      email,
      role,
      guardianId: guardian?._id || null,
      tokenHash,
      expiresAt,
      invitedBy: req.user._id,
      status: 'invited',
    });

    const acceptUrl = buildInvitationUrl(token);
    let emailSent = false;
    try {
      await sendInvitationEmail({
        email,
        organizationName: req.tenant.organization.name,
        role,
        invitedByName: req.user.username,
        acceptUrl,
        expiresAt,
      });
      emailSent = true;
    } catch (error) {
      if (process.env.NODE_ENV === 'production') {
        await OrganizationInvitation.updateOne(
          { _id: invitation._id, organizationId, status: 'invited' },
          { $set: { status: 'revoked', revokedBy: req.user._id, revokedAt: new Date() } },
        );
        return res.status(503).json({ message: 'The invitation email could not be sent. No active invitation was left behind.' });
      }
      // Development-only manual delivery lets local integration testing proceed.
      if (error.code !== 'EMAIL_NOT_CONFIGURED') {
        await OrganizationInvitation.updateOne(
          { _id: invitation._id, organizationId, status: 'invited' },
          { $set: { status: 'revoked', revokedBy: req.user._id, revokedAt: new Date() } },
        );
        return res.status(503).json({ message: 'The invitation email could not be sent. Please check the email configuration.' });
      }
    }

    await audit(req, 'invitation.created', invitation, 'Invitation created for ' + email + ' as ' + role + '.');
    return res.status(201).json({
      message: emailSent ? 'Invitation email sent. The link expires in 72 hours.' : 'Invitation created for development. Configure email to send invitations automatically.',
      invitation: {
        id: String(invitation._id),
        email,
        role,
        status: invitation.status,
        expiresAt,
        emailSent,
        ...(!emailSent && process.env.NODE_ENV !== 'production' ? { acceptUrl } : {}),
      },
    });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: 'An active invitation or membership already exists for this email.' });
    console.error('Unable to create invitation:', error.message);
    return res.status(503).json({ message: 'The invitation could not be created safely.' });
  }
});

router.delete('/:id', async (req, res) => {
  if (!canInvite(req)) return res.status(403).json({ message: 'Only an organization owner or head-office administrator can revoke invitations.' });
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid invitation.' });
  try {
    const invitation = await OrganizationInvitation.findOneAndUpdate({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      status: 'invited',
    }, {
      $set: { status: 'revoked', revokedBy: req.user._id, revokedAt: new Date() },
    }, { new: true });
    if (!invitation) return res.status(404).json({ message: 'An active invitation was not found in this organization.' });
    await audit(req, 'invitation.revoked', invitation, 'Invitation revoked for ' + invitation.email + '.');
    return res.json({ message: 'Invitation revoked.' });
  } catch (error) {
    console.error('Unable to revoke invitation:', error);
    return res.status(503).json({ message: 'The invitation could not be revoked.' });
  }
});

module.exports = router;
