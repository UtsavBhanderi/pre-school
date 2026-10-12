'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canListTeam,
  canListAudit,
  evaluateMembershipEditPermission,
  evaluateMembershipRoleTransition,
} = require('../utils/tenantMembershipPolicy');

const owner = { _id: 'owner-membership', userId: 'owner-user', role: 'organization_owner', status: 'active', accessAllBranches: true, branchIds: [] };
const headOffice = { _id: 'hq-membership', userId: 'hq-user', role: 'head_office_admin', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };
const branchAdmin = { _id: 'branch-admin-membership', userId: 'branch-admin-user', role: 'branch_admin', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };
const teacher = { _id: 'teacher-membership', userId: 'teacher-user', role: 'teacher', status: 'active', accessAllBranches: false, branchIds: ['branch-a'] };
const outsideTeacher = { _id: 'outside-teacher-membership', userId: 'outside-teacher-user', role: 'teacher', status: 'active', accessAllBranches: false, branchIds: ['branch-a', 'branch-b'] };

test('only active organization, head-office and branch administrators can list the team and audit', () => {
  for (const membership of [owner, headOffice, branchAdmin]) {
    assert.equal(canListTeam(membership), true);
    assert.equal(canListAudit(membership), true);
  }
  assert.equal(canListTeam({ ...owner, status: 'suspended' }), false);
  assert.equal(canListAudit({ role: 'teacher', status: 'active' }), false);
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

test('branch managers may edit only members entirely contained in their own branch scope', () => {
  assert.equal(evaluateMembershipEditPermission({
    manager: branchAdmin,
    target: teacher,
    actorUserId: 'branch-admin-user',
  }).allowed, true);

  assert.equal(evaluateMembershipEditPermission({
    manager: branchAdmin,
    target: outsideTeacher,
    actorUserId: 'branch-admin-user',
  }).code, 'BRANCH_ADMIN_SCOPE');

  assert.equal(evaluateMembershipEditPermission({
    manager: branchAdmin,
    target: { ...teacher, role: 'accountant' },
    actorUserId: 'branch-admin-user',
  }).code, 'BRANCH_ADMIN_SCOPE');
});

test('only an organization owner can grant or edit head-office administrator access', () => {
  assert.equal(evaluateMembershipEditPermission({
    manager: headOffice,
    target: { ...teacher, role: 'head_office_admin' },
    actorUserId: 'hq-user',
  }).code, 'HEAD_OFFICE_CONTROL');

  assert.equal(evaluateMembershipEditPermission({
    manager: owner,
    target: teacher,
    actorUserId: 'owner-user',
  }).allowed, true);
});

test('parent memberships cannot be converted to staff roles or edited through staff scope', () => {
  assert.equal(evaluateMembershipRoleTransition({
    managerRole: 'organization_owner',
    currentRole: 'parent',
    nextRole: 'teacher',
  }).code, 'PARENT_SCOPE_LOCKED');

  assert.equal(evaluateMembershipRoleTransition({
    managerRole: 'organization_owner',
    currentRole: 'teacher',
    nextRole: 'parent',
  }).code, 'PARENT_SCOPE_LOCKED');
});

test('branch administrators cannot promote staff to finance or organization-wide roles', () => {
  assert.equal(evaluateMembershipRoleTransition({
    managerRole: 'branch_admin',
    currentRole: 'teacher',
    nextRole: 'accountant',
  }).code, 'BRANCH_ADMIN_SCOPE');

  assert.equal(evaluateMembershipRoleTransition({
    managerRole: 'head_office_admin',
    currentRole: 'teacher',
    nextRole: 'head_office_admin',
  }).code, 'HEAD_OFFICE_CONTROL');

  assert.equal(evaluateMembershipRoleTransition({
    managerRole: 'organization_owner',
    currentRole: 'teacher',
    nextRole: 'head_office_admin',
  }).allowed, true);
});
