'use strict';

function resolveWorkspaceMembershipState(records) {
  const memberships = (Array.isArray(records) ? records : []).filter((entry) =>
    entry?.status === 'active' && entry.organizationId?.status === 'active'
  );
  const hasInactiveWorkspaceMemberships = (Array.isArray(records) ? records : []).some((entry) =>
    entry?.status !== 'active' || entry.organizationId?.status !== 'active'
  );
  return { memberships, hasInactiveWorkspaceMemberships };
}

module.exports = { resolveWorkspaceMembershipState };
