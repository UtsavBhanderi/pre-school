'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isReadOnlyMaintenanceRequest } = require('../utils/tenantMaintenancePolicy');

const id = '64b0d114f6d4b7a2d4a2f901';

test('owner transfer is the only ownership path allowed through subscription read-only mode', () => {
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'POST',
    baseUrl: '/api/saas/ownership',
    path: '/transfer-owner',
    body: { targetMembershipId: id, reason: 'required validation happens in the route' },
  }), true);
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'POST',
    baseUrl: '/api/saas/ownership',
    path: '/transfer-owner/',
    body: {},
  }), false);
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'POST',
    baseUrl: '/api/saas/operations',
    path: '/children',
    body: {},
  }), false);
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'GET',
    baseUrl: '/api/saas/ownership',
    path: '/transfer-owner',
    body: {},
  }), false);
});

test('a suspension-only membership request is allowed during read-only mode', () => {
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'PATCH',
    baseUrl: '/api/saas',
    path: '/members/' + id,
    body: { status: 'suspended', reason: 'Security incident reported.' },
  }), true);
});

test('read-only maintenance cannot change role, branch, class or re-enable access', () => {
  const base = {
    method: 'PATCH',
    baseUrl: '/api/saas',
    path: '/members/' + id,
  };
  for (const body of [
    { status: 'active', reason: 'Re-enable this account after payment.' },
    { status: 'suspended', reason: 'Suspension plus promotion.', role: 'head_office_admin' },
    { status: 'suspended', reason: 'Suspension plus branch change.', branchIds: [id] },
    { status: 'suspended', reason: 'Suspension plus all branch access.', accessAllBranches: true },
    { status: 'suspended', reason: 'Suspension plus class change.', classNames: ['Play Group'] },
    { status: 'suspended', reason: '' },
  ]) {
    assert.equal(isReadOnlyMaintenanceRequest({ ...base, body }), false, JSON.stringify(body));
  }
});

test('maintenance exception requires the expected router mount and a valid member ID', () => {
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'PATCH',
    baseUrl: '/api/saas',
    path: '/members/not-an-id',
    body: { status: 'suspended', reason: 'Security incident reported.' },
  }), false);
  assert.equal(isReadOnlyMaintenanceRequest({
    method: 'PATCH',
    baseUrl: '/api/saas/ownership',
    path: '/members/' + id,
    body: { status: 'suspended', reason: 'Security incident reported.' },
  }), false);
});
