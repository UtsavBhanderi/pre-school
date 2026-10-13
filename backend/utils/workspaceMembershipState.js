'use strict';

function resolveWorkspaceMembershipState(records) {
  const list = Array.isArray(records) ? records : [];
  const memberships = list.filter((entry) =>
    entry?.status === 'active' && entry.organizationId?.status === 'active'
  );
  const hasInactiveWorkspaceMemberships = list.some((entry) =>
    entry?.status !== 'active' || entry.organizationId?.status !== 'active'
  );
  return { memberships, hasInactiveWorkspaceMemberships };
}

module.exports = { resolveWorkspaceMembershipState };
