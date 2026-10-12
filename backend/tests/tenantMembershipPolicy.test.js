'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canListTeam,
  evaluateMembershipEditPermission,
  evaluateMembershipRoleTransition,
} = require('../utils/tenantMembershipPolicy');

const owner = { _id: 'owner-membership', userId: 'owner-user', role: 'organization_owner', status: 'active', accessAllBranches: true, branchIds: [] };
const headOffice = { _id: 'hq-membership', userId: 'hq-user', role: 'head_office_admin', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };
const branchAdmin = { _id: 'branch-admin-membership', userId: 'branch-admin-user', role: 'branch_admin', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };
const teacher = { _id: 'teacher-membership', userId: 'teacher-user', role: 'teacher', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };

test('only active organization, head-office and branch administrators can list the team', () => {
  assert.equal(canListTeam(owner), true);
  assert.equal(canListTeam(headOffice), true);
  assert.equal(canListTeam(branchAdmin), true);
  assert.equal(canListTeam({ ...owner, status: 'suspended' }), false);
  assert.equal(canListTeam({ role: 'teacher', status: 'active' }), false);
});

test('membership editing blocks self-access changes and protects the organization owner', () => {
  assert.equal(evaluateMembershipEditPermission({
    manager: owner,
    target: { _id: 'member-2', userId: 'owner-user', role: 'teacher', branchIds: ['branch-a'] },
    actorUserId: 'owner-user',
  }).code, 'SELF_ACCESS_CHANGE');

  assert.equal(evaluateMembershipEditPermission({
    manager: headOffice,
    target: { _id: 'owner-membership', userId: 'owner-user', role: 'organization_owner', branchIds: [] },
    actorUserId: 'hq-user',
  }).code, 'OWNER_TRANSFER_REQUIRED');
});

test('branch managers may only edit memberships scoped completely within their branch access', () => {
  assert.equal(evaluateMembershipEditPermission({
    manager: branchAdmin,
    target: teacher,
    actorUserId: 'branch-admin-user',
  }).allowed, false); // The target is not the manager, but manager user ID comparison below is independent.
});
