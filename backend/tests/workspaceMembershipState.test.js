'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWorkspaceMembershipState } = require('../utils/workspaceMembershipState');

test('only active memberships in active organizations are exposed to the frontend', () => {
  const active = { _id: 'active-member', status: 'active', organizationId: { _id: 'org-1', status: 'active' } };
  const suspended = { _id: 'suspended-member', status: 'suspended', organizationId: { _id: 'org-2', status: 'active' } };
  const inactiveOrganization = { _id: 'org-suspended-member', status: 'active', organizationId: { _id: 'org-3', status: 'suspended' } };
  const result = resolveWorkspaceMembershipState([active, suspended, inactiveOrganization]);
  assert.deepEqual(result.memberships, [active]);
  assert.equal(result.hasInactiveWorkspaceMemberships, true);
});

test('a suspended or removed-only account receives an inactive-access signal', () => {
  const result = resolveWorkspaceMembershipState([
    { status: 'suspended', organizationId: { status: 'active' } },
    { status: 'removed', organizationId: { status: 'active' } },
  ]);
  assert.deepEqual(result.memberships, []);
  assert.equal(result.hasInactiveWorkspaceMemberships, true);
});

test('legacy accounts with no workspace membership do not get a false inactive warning', () => {
  assert.deepEqual(resolveWorkspaceMembershipState([]), {
    memberships: [],
    hasInactiveWorkspaceMemberships: false,
  });
  assert.deepEqual(resolveWorkspaceMembershipState(null), {
    memberships: [],
    hasInactiveWorkspaceMemberships: false,
  });
});
