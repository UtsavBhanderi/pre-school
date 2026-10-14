'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const serverSource = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');

test('each public invitation and tenant portal workflow has one active router mount', () => {
  const expectedMounts = [
    "app.use('/api/invitations', publicInvitationsRoutes);",
    "app.use('/api/saas/invitations', auth, invitationsRoutes);",
    "app.use('/api/saas/parent', auth, parentPortalRoutes);",
  ];

  for (const mount of expectedMounts) {
    assert.equal(serverSource.split(mount).length - 1, 1, mount + ' must be mounted exactly once');
  }

  assert.doesNotMatch(serverSource, /app\.use\('\/api\/invitations',\s*invitationAcceptanceRoutes\)/);
  assert.doesNotMatch(serverSource, /app\.use\('\/api\/saas\/invitations',\s*auth,\s*tenantInvitationsRoutes\)/);
  assert.doesNotMatch(serverSource, /app\.use\('\/api\/saas\/parent',\s*auth,\s*tenantParentRoutes\)/);
});

test('incompatible legacy invitation routers are not imported by the active server', () => {
  assert.doesNotMatch(serverSource, /require\('\.\/routes\/(?:invitationAcceptance|tenantInvitations|tenantParent)'\)/);
});
