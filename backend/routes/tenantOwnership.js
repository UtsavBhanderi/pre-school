'use strict';

const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const Organization = require('../models/Organization');
const OrganizationMembership = require('../models/OrganizationMembership');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext } = require('../middleware/tenantContext');
const { hasTenantRole } = require('../utils/tenantAuthorization');

const router = express.Router();

router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function ownerTransferInput(body = {}, organization) {
  const targetMembershipId = clean(body.targetMembershipId, 32);
  const confirmOrganizationSlug = clean(body.confirmOrganizationSlug, 140);
  const confirmPassword = typeof body.confirmPassword === 'string' ? body.confirmPassword : '';
  const reason = clean(body.reason, 500);
  const errors = {};

  if (!mongoose.Types.ObjectId.isValid(targetMembershipId)) {
    errors.targetMembershipId = 'Choose an existing head-office administrator as the new owner.';
  }
  if (confirmOrganizationSlug !== organization.slug) {
    errors.confirmOrganizationSlug = 'Type the exact organization slug to confirm the ownership transfer.';
  }
  if (!confirmPassword || confirmPassword.length > 128) {
    errors.confirmPassword = 'Enter your current password to confirm this sensitive change.';
  }
  if (reason.length < 20) {
    errors.reason = 'Explain the ownership transfer in at least 20 characters for the audit record.';
  }

  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, value: { targetMembershipId, confirmOrganizationSlug, confirmPassword, reason } };
}

router.post('/transfer-owner', async (req, res) => {
  if (!hasTenantRole(req.tenant?.membership, ['organization_owner'])) {
    return res.status(403).json({ message: 'Only the current organization owner can transfer ownership.' });
  }

  const validation = ownerTransferInput(req.body, req.tenant.organization);
  if (!validation.valid) {
    return res.status(400).json({
      message: 'Please correct the ownership transfer confirmation.',
      errors: validation.errors,
    });
  }

  let session = null;
  try {
    session = await mongoose.startSession();
    let transferResult;

    await session.withTransaction(async () => {
      const organization = await Organization.findOne({
        _id: req.tenant.organization._id,
        slug: validation.value.confirmOrganizationSlug,
        status: 'active',
      }).session(session);
      if (!organization) {
        const unavailable = new Error('The organization is not active or its details changed. Refresh and try again.');
        unavailable.code = 'ORGANIZATION_UNAVAILABLE';
        throw unavailable;
      }

      const actorMembership = await OrganizationMembership.findOne({
        _id: req.tenant.membership._id,
        organizationId: organization._id,
        userId: req.user._id,
        role: 'organization_owner',
        status: 'active',
      }).session(session);
      if (!actorMembership) {
        const ownerChanged = new Error('You are no longer the active organization owner. Refresh the workspace and sign in again.');
        ownerChanged.code = 'OWNER_CHANGED';
        throw ownerChanged;
      }

      const activeOwnerCount = await OrganizationMembership.countDocuments({
        organizationId: organization._id,
        role: 'organization_owner',
        status: 'active',
      }).session(session);
      if (activeOwnerCount !== 1) {
        const inconsistent = new Error('This organization has an inconsistent owner record. Contact platform support before attempting a transfer.');
        inconsistent.code = 'OWNER_STATE_INCONSISTENT';
        throw inconsistent;
      }

      const targetMembership = await OrganizationMembership.findOne({
        _id: validation.value.targetMembershipId,
        organizationId: organization._id,
        role: 'head_office_admin',
        status: 'active',
      }).session(session);
      if (!targetMembership) {
        const invalidTarget = new Error('The new owner must be an active head-office administrator in this organization.');
        invalidTarget.code = 'INVALID_SUCCESSOR';
        throw invalidTarget;
      }
      if (String(targetMembership.userId) === String(req.user._id)) {
        const sameUser = new Error('Choose a different person as the new owner.');
        sameUser.code = 'INVALID_SUCCESSOR';
        throw sameUser;
      }

      const actor = await User.findById(req.user._id).session(session);
      const successor = await User.findById(targetMembership.userId).session(session);
      if (!actor || !successor) {
        const missingUser = new Error('The owner or selected successor account no longer exists.');
        missingUser.code = 'USER_NOT_FOUND';
        throw missingUser;
      }
      if (!(await actor.matchPassword(validation.value.confirmPassword))) {
        const wrongPassword = new Error('The current password did not match. No changes were made.');
        wrongPassword.code = 'PASSWORD_MISMATCH';
        throw wrongPassword;
      }

      const previousOwnerUserId = actor._id;
      const newOwnerUserId = successor._id;

      // Preserve the outgoing owner's head-office access, but make the
      // ownership role unique. The successor becomes an all-branch owner.
      actorMembership.role = 'head_office_admin';
      actorMembership.accessAllBranches = true;
      actorMembership.branchIds = [];
      await actorMembership.save({ session });

      targetMembership.role = 'organization_owner';
      targetMembership.accessAllBranches = true;
      targetMembership.branchIds = [];
      await targetMembership.save({ session });

      // Expire all existing JWTs for both accounts so neither browser carries
      // a stale role/session after the transfer. Each must sign in again.
      const previousSession = await User.updateOne(
        { _id: previousOwnerUserId },
        { $inc: { authVersion: 1 } },
        { session, runValidators: true },
      );
      const successorSession = await User.updateOne(
        { _id: newOwnerUserId },
        { $inc: { authVersion: 1 } },
        { session, runValidators: true },
      );
      if (previousSession.matchedCount !== 1 || successorSession.matchedCount !== 1) {
        const sessionFailure = new Error('Owner accounts changed during the transfer. No changes were committed.');
        sessionFailure.code = 'USER_NOT_FOUND';
        throw sessionFailure;
      }

      const summary = (
        'Organization ownership transferred from ' + actor.email + ' to ' + successor.email +
        '; both users must sign in again.'
      ).slice(0, 500);
      await AuditEvent.create([{
        organizationId: organization._id,
        branchId: null,
        actorUserId: previousOwnerUserId,
        action: 'organization.owner_transferred',
        resourceType: 'organization_ownership',
        resourceId: String(organization._id),
        outcome: 'success',
        reason: validation.value.reason,
        summary,
        changedFields: [
          'previousOwnerRole',
          'newOwnerRole',
          'previousOwnerAccessAllBranches',
          'newOwnerAccessAllBranches',
          'previousOwnerSessionsRevoked',
          'newOwnerSessionsRevoked',
        ],
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      }], { session });

      transferResult = {
        organizationName: organization.name,
        newOwnerName: successor.username,
        newOwnerEmail: successor.email,
      };
    });

    return res.json({
      message: 'Ownership transferred successfully. Both accounts have been signed out for security. The new owner must sign in again.',
      organizationName: transferResult.organizationName,
      newOwner: {
        name: transferResult.newOwnerName,
        email: transferResult.newOwnerEmail,
      },
      requiresSignIn: true,
    });
  } catch (error) {
    const statuses = {
      ORGANIZATION_UNAVAILABLE: 409,
      OWNER_CHANGED: 409,
      OWNER_STATE_INCONSISTENT: 409,
      INVALID_SUCCESSOR: 400,
      USER_NOT_FOUND: 404,
      PASSWORD_MISMATCH: 401,
    };
    if (statuses[error.code]) return res.status(statuses[error.code]).json({ message: error.message });
    console.error('Owner transfer failed:', error.message);
    return res.status(503).json({ message: 'Ownership transfer could not be completed safely. No partial change was committed.' });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
