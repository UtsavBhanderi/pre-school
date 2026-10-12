'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  MEMBERSHIP_ROLES,
  hasTenantRole,
  isKnownTenantRole,
  canAccessBranch,
  canManageOrganization,
  canManageBranch,
} = require('../utils/tenantAuthorization');

const activeOwner = {
  status: 'active',
  role: 'organization_owner',
  accessAllBranches: true,
  branchIds: [],
};

test('the membership role catalogue contains only explicit product roles', () => {
  assert.ok(MEMBERSHIP_ROLES.includes('organization_owner'));
  assert.ok(MEMBERSHIP_ROLES.includes('parent'));
  assert.equal(isKnownTenantRole('admin'), false);
  assert.equal(isKnownTenantRole('platform_superuser'), false);
});

test('role authorization requires an active membership and an allowed role', () => {
  assert.equal(hasTenantRole(activeOwner, ['organization_owner']), true);
  assert.equal(hasTenantRole({ ...activeOwner, status: 'suspended' }, ['organization_owner']), false);
  assert.equal(hasTenantRole({ ...activeOwner, role: 'teacher' }, ['organization_owner']), false);
  assert.equal(hasTenantRole(null, ['organization_owner']), false);
});

test('organization owners with all-branch scope can select branches in their organization', () => {
  assert.equal(canAccessBranch(activeOwner, 'branch-id'), true);
  assert.equal(canAccessBranch({ ...activeOwner, status: 'removed' }, 'branch-id'), false);
  assert.equal(canAccessBranch(activeOwner, ''), false);
});

test('branch-limited memberships cannot access an unassigned branch', () => {
  const membership = {
    status: 'active',
    role: 'teacher',
    accessAllBranches: false,
    branchIds: ['branch-a', { _id: 'branch-b' }],
  };
  assert.equal(canAccessBranch(membership, 'branch-a'), true);
  assert.equal(canAccessBranch(membership, 'branch-b'), true);
  assert.equal(canAccessBranch(membership, 'branch-c'), false);
  assert.equal(canAccessBranch({ ...membership, branchIds: [] }, 'branch-a'), false);
});

test('only organization-level roles can manage organization settings', () => {
  assert.equal(canManageOrganization(activeOwner), true);
  assert.equal(canManageOrganization({ status: 'active', role: 'head_office_admin' }), true);
  assert.equal(canManageOrganization({ status: 'active', role: 'branch_admin' }), false);
  assert.equal(canManageBranch({ status: 'active', role: 'branch_admin' }), true);
  assert.equal(canManageBranch({ status: 'active', role: 'teacher' }), false);
});
