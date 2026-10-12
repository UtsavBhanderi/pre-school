'use strict';

const { MEMBERSHIP_ROLES } = require('../models/OrganizationMembership');

const TENANT_ADMIN_ROLES = ['organization_owner', 'head_office_admin'];
const BRANCH_MANAGER_ROLES = [...TENANT_ADMIN_ROLES, 'branch_admin'];

function hasTenantRole(membership, allowedRoles) {
  return Boolean(
    membership &&
    membership.status === 'active' &&
    Array.isArray(allowedRoles) &&
    allowedRoles.includes(membership.role)
  );
}

function isKnownTenantRole(role) {
  return MEMBERSHIP_ROLES.includes(role);
}

function canAccessBranch(membership, branchId) {
  if (!membership || membership.status !== 'active' || !branchId) return false;
  if (membership.accessAllBranches === true) return true;
  const allowedIds = Array.isArray(membership.branchIds) ? membership.branchIds : [];
  return allowedIds.some((id) => String(id?._id || id) === String(branchId));
}

function canManageOrganization(membership) {
  return hasTenantRole(membership, TENANT_ADMIN_ROLES);
}

function canManageBranch(membership) {
  return hasTenantRole(membership, BRANCH_MANAGER_ROLES);
}

module.exports = {
  TENANT_ADMIN_ROLES,
  BRANCH_MANAGER_ROLES,
  hasTenantRole,
  isKnownTenantRole,
  canAccessBranch,
  canManageOrganization,
  canManageBranch,
};
