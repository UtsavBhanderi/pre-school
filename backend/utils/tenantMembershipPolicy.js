'use strict';

const { canAccessBranch, hasTenantRole } = require('./tenantAuthorization');

const TEAM_MANAGER_ROLES = ['organization_owner', 'head_office_admin', 'branch_admin'];
const BRANCH_ADMIN_MANAGED_ROLES = ['teacher', 'admissions', 'transport_staff', 'parent'];
const MUTABLE_STAFF_ROLES = [
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
];

function idOf(value) {
  return String(value?._id || value?.id || value || '');
}

function canListTeam(membership) {
  return hasTenantRole(membership, TEAM_MANAGER_ROLES);
}

function canListAudit(membership) {
  return hasTenantRole(membership, TEAM_MANAGER_ROLES);
}

function evaluateMembershipEditPermission({ manager, target, actorUserId }) {
  if (!canListTeam(manager)) {
    return { allowed: false, code: 'TEAM_MANAGER_REQUIRED', message: 'Only an authorized administrator can change team access.' };
  }
  if (idOf(manager._id) === idOf(target._id) || idOf(actorUserId) === idOf(target.userId)) {
    return { allowed: false, code: 'SELF_ACCESS_CHANGE', message: 'You cannot change or suspend your own access here. Ask another organization administrator to do that.' };
  }
  if (target.role === 'organization_owner') {
    return { allowed: false, code: 'OWNER_TRANSFER_REQUIRED', message: 'The organization owner cannot be changed or suspended from this screen. Use a separate, audited owner-transfer process.' };
  }

  if (manager.role === 'branch_admin') {
    if (!BRANCH_ADMIN_MANAGED_ROLES.includes(target.role) || target.accessAllBranches) {
      return { allowed: false, code: 'BRANCH_ADMIN_SCOPE', message: 'Branch administrators can only manage branch-scoped teachers, admissions staff, transport staff and parent access.' };
    }
    const managerBranchIds = Array.isArray(manager.branchIds) ? manager.branchIds.map(idOf) : [];
    const targetBranchIds = Array.isArray(target.branchIds) ? target.branchIds.map(idOf) : [];
    if (!managerBranchIds.length || !targetBranchIds.length ||
        targetBranchIds.some((branchId) => !canAccessBranch(manager, branchId))) {
      return { allowed: false, code: 'BRANCH_ADMIN_SCOPE', message: 'This team member has access outside your assigned branches, so only an organization administrator can change it.' };
    }
  }

  if (target.role === 'head_office_admin' && manager.role !== 'organization_owner') {
    return { allowed: false, code: 'HEAD_OFFICE_CONTROL', message: 'Only the organization owner can change another head-office administrator.' };
  }

  return { allowed: true };
}

function evaluateMembershipRoleTransition({ managerRole, currentRole, nextRole }) {
  if (currentRole === 'parent' || nextRole === 'parent') {
    if (currentRole !== nextRole) {
      return {
        allowed: false,
        code: 'PARENT_SCOPE_LOCKED',
        message: 'Parent access must stay linked to its verified guardian records. Use a verified guardian invitation flow to change family links.',
      };
    }
    return { allowed: true, familyRole: true };
  }

  if (!MUTABLE_STAFF_ROLES.includes(nextRole)) {
    return { allowed: false, code: 'INVALID_ROLE', message: 'Choose a supported staff role.' };
  }
  if (managerRole === 'branch_admin' &&
      (!BRANCH_ADMIN_MANAGED_ROLES.includes(currentRole) || !BRANCH_ADMIN_MANAGED_ROLES.includes(nextRole))) {
    return {
      allowed: false,
      code: 'BRANCH_ADMIN_SCOPE',
      message: 'Branch administrators can only manage branch-scoped teachers, admissions staff and transport staff.',
    };
  }
  if (currentRole === 'head_office_admin' && managerRole !== 'organization_owner') {
    return { allowed: false, code: 'HEAD_OFFICE_CONTROL', message: 'Only the organization owner can change another head-office administrator.' };
  }
  if (nextRole === 'head_office_admin' && managerRole !== 'organization_owner') {
    return { allowed: false, code: 'HEAD_OFFICE_CONTROL', message: 'Only the organization owner can grant head-office administrator access.' };
  }

  return { allowed: true, familyRole: false };
}

module.exports = {
  TEAM_MANAGER_ROLES,
  BRANCH_ADMIN_MANAGED_ROLES,
  MUTABLE_STAFF_ROLES,
  canListTeam,
  canListAudit,
  evaluateMembershipEditPermission,
  evaluateMembershipRoleTransition,
};
