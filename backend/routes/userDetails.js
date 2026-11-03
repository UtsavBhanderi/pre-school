'use strict';

const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserAccessAuditEvent = require('../models/UserAccessAuditEvent');
const ParentAccount = require('../models/ParentAccount');
const { normalizeAccessStatus, evaluateUserAccessChange } = require('../utils/userAccessPolicy');

const router = express.Router();

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function safeUser(user) {
  return {
    _id: String(user._id),
    username: user.username,
    email: user.email,
    role: user.role,
    status: normalizeAccessStatus(user.status),
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

// This router is mounted behind auth, legacySingleTenantOnly, and adminOnly.
router.get('/', async (req, res) => {
  try {
    const users = await User.find({})
      .select('username email role status createdAt updatedAt')
      .sort({ createdAt: -1, username: 1 })
      .limit(1000)
      .lean();
    return res.json(users.map((user) => ({
      _id: String(user._id),
      username: user.username,
      email: user.email,
      role: user.role,
      status: normalizeAccessStatus(user.status),
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    })));
  } catch (error) {
    console.error('Unable to list user accounts:', error?.name || 'query_error');
    return res.status(503).json({ message: 'User accounts could not be loaded. Please try again.' });
  }
});

router.get('/audit', async (req, res) => {
  try {
    const events = await UserAccessAuditEvent.find({})
      .sort({ createdAt: -1 })
      .limit(50)
      .populate({ path: 'actorUserId', select: 'username email' })
      .lean();
    return res.json(events.map((event) => ({
      id: String(event._id),
      targetUserId: String(event.targetUserId),
      targetName: event.targetName || 'Unknown account',
      targetEmail: event.targetEmail || '',
      action: event.action,
      previousRole: event.previousRole || '',
      role: event.role,
      previousStatus: normalizeAccessStatus(event.previousStatus),
      status: normalizeAccessStatus(event.status),
      changedFields: Array.isArray(event.changedFields) ? event.changedFields : [],
      reason: event.reason || '',
      actor: event.actorUserId
        ? { name: event.actorUserId.username, email: event.actorUserId.email }
        : { name: 'Former administrator', email: '' },
      createdAt: event.createdAt,
    })));
  } catch (error) {
    console.error('Unable to load user access history:', error?.name || 'query_error');
    return res.status(503).json({ message: 'User access history could not be loaded.' });
  }
});

router.patch('/:id', async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(400).json({ message: 'Choose a valid user account.' });
  }

  const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body
    : {};
  const unsupportedFields = Object.keys(body).filter((key) =>
    !['role', 'status', 'reason'].includes(key)
  );
  if (unsupportedFields.length) {
    return res.status(400).json({ message: 'Only role, status, and reason may be changed from User access.' });
  }

  let session;
  let targetSnapshot;
  let auditData;
  try {
    session = await mongoose.startSession();
    await session.withTransaction(async () => {
      const target = await User.findById(req.params.id).session(session);
      if (!target) {
        const missing = new Error('User account not found.');
        missing.code = 'USER_NOT_FOUND';
        throw missing;
      }

      const currentStatus = normalizeAccessStatus(target.status);
      const requestedRole = Object.prototype.hasOwnProperty.call(body, 'role')
        ? clean(body.role, 40).toLowerCase()
        : target.role;
      const requestedStatus = Object.prototype.hasOwnProperty.call(body, 'status')
        ? clean(body.status, 20).toLowerCase()
        : currentStatus;

      const policy = evaluateUserAccessChange({
        actorUserId: req.user._id,
        targetUserId: target._id,
        currentRole: target.role,
        currentStatus,
        requestedRole,
        requestedStatus,
        reason: body.reason,
      });

      if (!policy.allowed) {
        const denied = new Error(policy.message);
        denied.code = policy.code;
        throw denied;
      }

      if (policy.removesActiveAdministrator) {
        const remainingAdministrators = await User.countDocuments({
          _id: { $ne: target._id },
          role: 'admin',
          // $ne includes pre-migration accounts where status has not been stored yet.
          status: { $ne: 'suspended' },
        }).session(session);
        if (remainingAdministrators < 1) {
          const lastAdmin = new Error('This is the last active administrator. Promote another active user to Administrator before changing this account.');
          lastAdmin.code = 'LAST_ACTIVE_ADMIN';
          throw lastAdmin;
        }
      }

      const previousRole = target.role;
      if (target.role === 'parent') {
        const parentAccount = await ParentAccount.findOne({ userId: target._id }).session(session);
        if (!parentAccount) {
          const missingParentAccount = new Error('The parent family record is missing. Contact the preschool office before changing this access.');
          missingParentAccount.code = 'PARENT_ACCOUNT_NOT_FOUND';
          throw missingParentAccount;
        }
        // Parent accounts are status-only here. Their student allow-list is
        // immutable from this staff screen and cannot be converted into a staff role.
        parentAccount.status = requestedStatus;
        await parentAccount.save({ session });
      }

      target.role = requestedRole;
      target.status = requestedStatus;
      target.authVersion = (Number.isInteger(target.authVersion) ? target.authVersion : 0) + 1;
      await target.save({ session });

      targetSnapshot = safeUser(target);
      auditData = {
        actorUserId: req.user._id,
        targetUserId: target._id,
        targetName: target.username,
        targetEmail: target.email,
        action: 'user.access_updated',
        previousRole,
        role: target.role,
        previousStatus: currentStatus,
        status: requestedStatus,
        reason: policy.reason,
        changedFields: [...policy.changedFields, ...(target.role === 'parent' ? ['parentAccountStatus'] : []), 'sessionsRevoked'],
        ipAddress: String(req.ip || '').slice(0, 64),
        userAgent: String(req.get('user-agent') || '').slice(0, 300),
      };
    });
  } catch (error) {
    const statusByCode = {
      USER_NOT_FOUND: 404,
      SELF_ACCESS_CHANGE: 409,
      UNSUPPORTED_ACCOUNT_ROLE: 409,
      PARENT_ROLE_LOCKED: 409,
      PARENT_ACCOUNT_NOT_FOUND: 409,
      NO_ACCESS_CHANGE: 409,
      LAST_ACTIVE_ADMIN: 409,
      INVALID_ROLE: 400,
      INVALID_STATUS: 400,
      REASON_REQUIRED: 400,
    };
    if (error?.code === 11000) {
      return res.status(409).json({ message: 'This user account conflicts with an existing record.' });
    }
    if (statusByCode[error?.code]) {
      return res.status(statusByCode[error.code]).json({ code: error.code, message: error.message });
    }
    console.error('Unable to update user access:', error?.name || 'update_error');
    return res.status(503).json({ message: 'User access could not be updated safely. Please try again.' });
  } finally {
    if (session) await session.endSession();
  }

  let auditWarning = false;
  try {
    await UserAccessAuditEvent.create(auditData);
  } catch (auditError) {
    auditWarning = true;
    console.error('Unable to record user access audit event:', auditError?.name || 'audit_error');
  }

  return res.json({
    message: auditWarning
      ? 'Access updated and all existing sessions revoked, but the audit record could not be saved. Please contact support.'
      : 'Access updated. The user must sign in again for the change to take effect.',
    auditWarning,
    sessionsRevoked: true,
    user: targetSnapshot,
  });
});

module.exports = router;
