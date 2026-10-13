'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveWorkspaceMembershipState } = require('../utils/workspaceMembershipState');

test('only active memberships belonging to active organizations are usable', () => {
  const active = {
    _id: 'active-membership',
    status: 'active',
    organizationId: { _id: 'active-org', status: 'active' },
  };
  const suspended = {
    _id: 'suspended-membership',
    status: 'suspended',
    organizationId: { _id: 'active-org-2', status: 'active' },
  };
  const inactiveOrganization = {
    _id: 'inactive-organization-membership',
    status: 'active',
    organizationId: { _id: 'inactive-org', status: 'suspended' },
  };

  const result = resolveWorkspaceMembershipState([active, suspended, inactiveOrganization]);
  assert.deepEqual(result.memberships, [active]);
  assert.equal(result.hasInactiveWorkspaceMemberships, true);
});

test('a user with no membership records is not mislabelled as suspended', () => {
  assert.deepEqual(resolveWorkspaceMembershipState([]), {
    memberships: [],
    hasInactiveWorkspaceMemberships: false,
  });
  assert.deepEqual(resolveWorkspaceMembershipState(null), {
    memberships: [],
    hasInactiveWorkspaceMemberships: false,
  });
});

test('deleted organizations are treated as inactive access rather than legacy access', () => {
  const deletedOrganization = {
    _id: 'orphaned-membership',
    status: 'active',
    organizationId: null,
  };
  const result = resolveWorkspaceMembershipState([deletedOrganization]);
  assert.deepEqual(result.memberships, []);
  assert.equal(result.hasInactiveWorkspaceMemberships, true);
});

test('a fully active member has no inactive-workspace warning', () => {
  const result = resolveWorkspaceMembershipState([{
    status: 'active',
    organizationId: { status: 'active' },
  }]);
  assert.equal(result.memberships.length, 1);
  assert.equal(result.hasInactiveWorkspaceMemberships, false);
});
