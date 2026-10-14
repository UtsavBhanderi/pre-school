'use strict';

const MANAGEABLE_LEGACY_ROLES = ['admin', 'teacher'];
const USER_ACCESS_STATUSES = ['active', 'suspended'];

function normalizeAccessStatus(status) {
  // Accounts created before the status field existed remain active by default.
  return status === 'suspended' ? 'suspended' : 'active';
}

function evaluateUserAccessChange({
  actorUserId,
  targetUserId,
  currentRole,
  currentStatus,
  requestedRole,
  requestedStatus,
  reason,
}) {
  const status = normalizeAccessStatus(currentStatus);
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';

  if (String(actorUserId) === String(targetUserId)) {
    return { allowed: false, code: 'SELF_ACCESS_CHANGE', message: 'You cannot change your own role or suspend your own account.' };
  }
  if (!MANAGEABLE_LEGACY_ROLES.includes(currentRole)) {
    return { allowed: false, code: 'UNSUPPORTED_ACCOUNT_ROLE', message: 'This account uses a role that cannot be managed from the legacy school access page.' };
  }
  if (!MANAGEABLE_LEGACY_ROLES.includes(requestedRole)) {
    return { allowed: false, code: 'INVALID_ROLE', message: 'Choose Administrator or Teacher.' };
  }
  if (!USER_ACCESS_STATUSES.includes(requestedStatus)) {
    return { allowed: false, code: 'INVALID_STATUS', message: 'Choose Active or Suspended.' };
  }
  if (cleanReason.length < 3) {
    return { allowed: false, code: 'REASON_REQUIRED', message: 'Enter a reason of at least 3 characters for the access change.' };
  }
  if (requestedRole === currentRole && requestedStatus === status) {
    return { allowed: false, code: 'NO_ACCESS_CHANGE', message: 'No access changes were made.' };
  }

  const removesActiveAdministrator = currentRole === 'admin' &&
    status === 'active' &&
    (requestedRole !== 'admin' || requestedStatus === 'suspended');

  return {
    allowed: true,
    reason: cleanReason,
    currentStatus: status,
    removesActiveAdministrator,
    changedFields: [
      ...(requestedRole !== currentRole ? ['role'] : []),
      ...(requestedStatus !== status ? ['status'] : []),
    ],
  };
}

module.exports = {
  MANAGEABLE_LEGACY_ROLES,
  USER_ACCESS_STATUSES,
  normalizeAccessStatus,
  evaluateUserAccessChange,
};
