'use strict';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function isReadOnlyMaintenanceRequest({ method, baseUrl, path, body }) {
  const requestMethod = String(method || '').toUpperCase();
  const mount = String(baseUrl || '').replace(/\/+$/, '');
  const routePath = String(path || '');
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  // An ownership handover is a tightly validated security operation rather
  // than a normal school-data write. Its route performs password, slug,
  // successor, membership and audit checks in a single transaction.
  if (
    requestMethod === 'POST' &&
    mount === '/api/saas/ownership' &&
    routePath === '/transfer-owner'
  ) {
    return true;
  }

  // Only a dedicated suspension-only request can bypass subscription read-only
  // mode. Do not allow a role, branch, class or access-scope change to hide
  // inside a request that also suspends the account.
  const memberMatch = routePath.match(/^\/members\/([a-f\d]{24})$/i);
  const keys = Object.keys(payload).sort();
  const suspensionOnlyPayload =
    payload.status === 'suspended' &&
    typeof payload.reason === 'string' &&
    payload.reason.trim().length >= 3 &&
    keys.length === 2 &&
    keys[0] === 'reason' &&
    keys[1] === 'status';

  return Boolean(
    requestMethod === 'PATCH' &&
    mount === '/api/saas' &&
    memberMatch &&
    OBJECT_ID_PATTERN.test(memberMatch[1]) &&
    suspensionOnlyPayload
  );
}

module.exports = { isReadOnlyMaintenanceRequest };
