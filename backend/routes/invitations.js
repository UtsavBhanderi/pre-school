'use strict';

const express = require('express');
const mongoose = require('mongoose');
const OrganizationInvitation = require('../models/OrganizationInvitation');
const OrganizationMembership = require('../models/OrganizationMembership');
const Guardian = require('../models/Guardian');
const ChildGuardian = require('../models/ChildGuardian');
const Branch = require('../models/Branch');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole, canAccessBranch } = require('../utils/tenantAuthorization');
const { INVITABLE_ROLES } = require('../models/OrganizationInvitation');
const { createInvitationToken, invitationExpiry } = require('../utils/invitationTokens');
const { createInvitationUrl, sendInvitationEmail } = require('../utils/invitationEmail');
const { assertQuotaCapacity } = require('../utils/saasQuota');
const TenantClass = require('../models/TenantClass');

const router = express.Router();
router.use(tenantContext);

const ORG_ADMINS = ['organization_owner', 'head_office_admin'];
const BRANCH_INVITE_ROLES = ['teacher', 'admissions', 'transport_staff', 'parent'];

function clean(value, max = 200) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

async function writeInvitationAudit(req, session, action, invitation, summary) {
  await AuditEvent.create([{
    organizationId: req.tenant.organization._id,
    branchId: invitation.branchIds?.[0] || req.tenant.branch?._id || null,
    actorUserId: req.user._id,
    action,
    resourceType: 'organization_invitation',
    resourceId: String(invitation._id),
    summary: clean(summary, 500),
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  }], session ? { session } : {});
}

router.get('/', async (req, res) => {
  if (!hasTenantRole(req.tenant.membership, [...ORG_ADMINS, 'branch_admin'])) {
    return res.status(403).json({ message: 'You do not have permission to view invitations.' });
  }
  const filter = { organizationId: req.tenant.organization._id };
  if (req.tenant.membership.role === 'branch_admin') {
    filter.branchIds = { $in: req.tenant.membership.branchIds || [] };
  }
  try {
    const invitations = await OrganizationInvitation.find(filter)
      .select('-tokenHash -deliveryError')
      .populate({ path: 'branchIds', select: 'name code' })
      .populate({ path: 'invitedBy', select: 'username email' })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    return res.json(invitations.map((invitation) => ({
      id: String(invitation._id),
      email: invitation.email,
      fullName: invitation.fullName,
      role: invitation.role,
      classNames: invitation.classNames || [],
      status: invitation.status,
      deliveryStatus: invitation.deliveryStatus,
      expiresAt: invitation.expiresAt,
      sentAt: invitation.sentAt,
      createdAt: invitation.createdAt,
      branches: invitation.branchIds || [],
      invitedBy: invitation.invitedBy ? invitation.invitedBy.username : 'Unknown',
      deliveryNote: invitation.deliveryError || '',
    })));
  } catch (error) {
    console.error('Unable to list invitations:', error.message);
    return res.status(503).json({ message: 'Invitations could not be loaded.' });
  }
});

router.post('/', async (req, res) => {
  const inviterRole = req.tenant.membership.role;
  if (!hasTenantRole(req.tenant.membership, [...ORG_ADMINS, 'branch_admin'])) {
    return res.status(403).json({ message: 'Only authorized administrators can invite team members or parents.' });
  }

  const email = clean(req.body?.email, 254).toLowerCase();
  const fullName = clean(req.body?.fullName, 120);
  const role = clean(req.body?.role, 40);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
  if (fullName.length < 2) return res.status(400).json({ message: 'Enter the invitee’s full name.' });
  if (!INVITABLE_ROLES.includes(role)) return res.status(400).json({ message: 'Choose a valid access role.' });
  if (inviterRole === 'branch_admin' && !BRANCH_INVITE_ROLES.includes(role)) {
    return res.status(403).json({ message: 'Branch administrators may invite teachers, admissions staff, transport staff, or parents.' });
  }

  let branchIds = [];
  let guardianIds = [];
  let classNames = [];
  if (role === 'parent') {
    if (!hasTenantRole(req.tenant.membership, [...ORG_ADMINS, 'branch_admin'])) {
      return res.status(403).json({ message: 'You do not have permission to invite a parent.' });
    }
    const submittedGuardianIds = Array.isArray(req.body?.guardianIds)
      ? [...new Set(req.body.guardianIds.map((value) => String(value)))]
      : [];
    if (submittedGuardianIds.length < 1 || submittedGuardianIds.length > 10 ||
        submittedGuardianIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'Select 1 to 10 existing guardian contacts to link to this parent login.' });
    }

    try {
      const guardians = await Guardian.find({
        _id: { $in: submittedGuardianIds },
        organizationId: req.tenant.organization._id,
        email,
      }).select('_id').lean();
      if (guardians.length !== submittedGuardianIds.length) {
        return res.status(400).json({ message: 'Every selected guardian must belong to this organization and have the same email address as the invitation.' });
      }
      const links = await ChildGuardian.find({
        organizationId: req.tenant.organization._id,
        guardianId: { $in: submittedGuardianIds },
      }).select('guardianId branchId').lean();
      if (!links.length || submittedGuardianIds.some((guardianId) => !links.some((link) => String(link.guardianId) === guardianId))) {
        return res.status(400).json({ message: 'The selected contacts are not linked to a child in this organization.' });
      }
      branchIds = [...new Set(links.map((link) => String(link.branchId)))];
      guardianIds = submittedGuardianIds;

      if (inviterRole === 'branch_admin') {
        const accessible = req.tenant.membership.branchIds || [];
        if (branchIds.some((id) => !accessible.some((allowedId) => String(allowedId) === id))) {
          return res.status(403).json({ message: 'A branch administrator may only invite a parent linked to their assigned branches.' });
        }
      }
      const alreadyConnected = await OrganizationMembership.findOne({
        organizationId: req.tenant.organization._id,
        role: 'parent',
        status: 'active',
        guardianIds: { $in: guardianIds },
      }).select('_id').lean();
      if (alreadyConnected) {
        return res.status(409).json({ message: 'One of the selected guardian contacts already belongs to an active parent portal account.' });
      }
    } catch (error) {
      console.error('Unable to validate guardian invitation:', error.message);
      return res.status(503).json({ message: 'Parent access could not be verified.' });
    }
  } else {
    if (role === 'teacher') {
      const requestedClasses = Array.isArray(req.body?.classNames)
        ? [...new Set(req.body.classNames.map((value) => clean(value, 80)))]
        : [];
      if (!requestedClasses.length || requestedClasses.some((className) => className.length < 2 || className.length > 80)) {
        return res.status(400).json({ message: 'Assign at least one configured class to this teacher.' });
      }
      classNames = requestedClasses;
    }

    const submittedBranchIds = Array.isArray(req.body?.branchIds)
      ? [...new Set(req.body.branchIds.map((value) => String(value)))]
      : [];
    if (submittedBranchIds.length < 1 || submittedBranchIds.length > 100 ||
        submittedBranchIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
      return res.status(400).json({ message: 'Select at least one branch for this account.' });
    }

    try {
      const branches = await Branch.find({
        _id: { $in: submittedBranchIds },
        organizationId: req.tenant.organization._id,
        status: 'active',
      }).select('_id').lean();
      if (branches.length !== submittedBranchIds.length) {
        return res.status(400).json({ message: 'Every selected branch must be active and belong to this organization.' });
      }
      if (submittedBranchIds.some((id) => !canAccessBranch(req.tenant.membership, id))) {
        return res.status(403).json({ message: 'You cannot assign a user to a branch outside your own access.' });
      }
      if (role === 'teacher') {
        for (const assignedBranchId of submittedBranchIds) {
          const availableClassNames = await TenantClass.distinct('name', {
            organizationId: req.tenant.organization._id,
            branchId: assignedBranchId,
            name: { $in: classNames },
            status: 'active',
          });
          const missing = classNames.filter((className) => !availableClassNames.includes(className));
          if (missing.length) {
            return res.status(400).json({
              message: 'Configure these classes in every selected branch before assigning them to a teacher: ' + missing.join(', ') + '.',
            });
          }
        }
      }
      branchIds = submittedBranchIds;
    } catch (error) {
      console.error('Unable to validate invitation branches:', error.message);
      return res.status(503).json({ message: 'Branch access could not be verified.' });
    }
  }

  try {
    const pending = await OrganizationInvitation.findOne({
      organizationId: req.tenant.organization._id,
      email,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).select('_id').lean();
    if (pending) return res.status(409).json({ message: 'An active invitation already exists for this email address.' });

    const { token, tokenHash } = createInvitationToken();
    const expiresAt = invitationExpiry();
    let invitation;
    await mongoose.startSession().then(async (session) => {
      try {
        await session.withTransaction(async () => {
          if (role !== 'parent') {
            await assertQuotaCapacity({
              organizationId: req.tenant.organization._id,
              resource: 'staff',
              session,
            });
          }
          const [created] = await OrganizationInvitation.create([{
            organizationId: req.tenant.organization._id,
            branchIds,
            guardianIds,
            classNames,
            role,
            email,
            fullName,
            tokenHash,
            expiresAt,
            invitedBy: req.user._id,
          }], { session });
          invitation = created;
          await writeInvitationAudit(req, session, 'invitation.created', created, 'Invitation created for ' + email + ' (' + role + ').');
        });
      } finally {
        await session.endSession();
      }
    });

    const inviteUrl = createInvitationUrl(token);
    const delivery = await sendInvitationEmail({
      email,
      fullName,
      organizationName: req.tenant.organization.name,
      role,
      inviteUrl,
    });
    invitation.deliveryStatus = delivery.sent ? 'sent' : 'failed';
    invitation.sentAt = delivery.sentAt || null;
    invitation.deliveryError = delivery.sent ? '' : clean(delivery.reason, 200);
    await invitation.save();

    const response = {
      message: delivery.sent ? 'Invitation sent by email.' : 'Invitation created, but email was not sent.',
      invitation: {
        id: String(invitation._id),
        email,
        fullName,
        role,
        classNames,
        status: invitation.status,
        deliveryStatus: invitation.deliveryStatus,
        expiresAt,
        branches: branchIds.map(String),
      },
      deliveryNote: delivery.sent ? '' : delivery.reason,
    };
    // Reveal the raw one-time secret only to the authenticated inviter when an
    // email is not confirmed as sent. It is never saved or logged in plaintext.
    if (!delivery.sent) response.invitationUrl = inviteUrl;
    return res.status(201).json(response);
  } catch (error) {
    if (error.code === 'PLAN_LIMIT_REACHED') return res.status(409).json({ code: error.code, message: error.message, limit: error.limit, used: error.used, plan: error.plan });
    if (error.code === 'SUBSCRIPTION_READ_ONLY') return res.status(402).json({ code: error.code, message: error.message });
    if (error.code === 11000) return res.status(409).json({ message: 'An invitation identifier conflict occurred. Please try again.' });
    console.error('Unable to create invitation:', error.message);
    return res.status(503).json({ message: 'The invitation could not be created safely.' });
  }
});

router.patch('/:id/revoke', async (req, res) => {
  if (!hasTenantRole(req.tenant.membership, [...ORG_ADMINS, 'branch_admin'])) {
    return res.status(403).json({ message: 'You do not have permission to revoke invitations.' });
  }
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ message: 'Choose a valid invitation.' });

  try {
    const invitation = await OrganizationInvitation.findOne({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      status: 'pending',
    });
    if (!invitation) return res.status(404).json({ message: 'A pending invitation was not found.' });
    if (req.tenant.membership.role === 'branch_admin' &&
        invitation.branchIds.some((id) => !canAccessBranch(req.tenant.membership, id))) {
      return res.status(403).json({ message: 'You cannot revoke an invitation outside your branch access.' });
    }

    const revokedAt = new Date();
    // Update only the mutable lifecycle fields. Saving the full document can
    // re-submit immutable branch/class/guardian scope fields in strict mode.
    const revoked = await OrganizationInvitation.findOneAndUpdate({
      _id: invitation._id,
      organizationId: req.tenant.organization._id,
      status: 'pending',
    }, {
      $set: {
        status: 'revoked',
        revokedBy: req.user._id,
        revokedAt,
      },
    }, { new: true, runValidators: true });

    if (!revoked) return res.status(409).json({ message: 'This invitation was already accepted, revoked, or expired.' });
    await writeInvitationAudit(req, null, 'invitation.revoked', revoked, 'Invitation revoked for ' + revoked.email + '.');
    return res.json({ message: 'Invitation revoked.' });
  } catch (error) {
    console.error('Unable to revoke invitation:', error.message);
    return res.status(503).json({ message: 'The invitation could not be revoked safely.' });
  }
});

module.exports = router;
