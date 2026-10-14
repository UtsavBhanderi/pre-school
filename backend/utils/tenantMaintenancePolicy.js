'use strict';

const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;

function isReadOnlyMaintenanceRequest({ method, originalUrl, body }) {
  const requestMethod = String(method || '').toUpperCase();
  // Match the complete canonical path, not Express router-relative properties.
  // Query strings and alternate/trailing paths deliberately fail closed.
  const requestPath = typeof originalUrl === 'string' ? originalUrl : '';
  const payload = body && typeof body === 'object' && !Array.isArray(body) ? body : {};

  // The route itself still requires password verification, exact organization
  // slug, an eligible successor and a transactionally written audit event.
  if (
    requestMethod === 'POST' &&
    requestPath === '/api/saas/ownership/transfer-owner'
  ) {
    return true;
  }

  // Only a dedicated suspension-only request can bypass subscription read-only
  // mode. It must not smuggle role, branch, class or access-scope changes.
  const memberMatch = requestPath.match(/^\/api\/saas\/members\/([a-f\d]{24})$/i);
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
    memberMatch &&
    OBJECT_ID_PATTERN.test(memberMatch[1]) &&
    suspensionOnlyPayload
  );
}

module.exports = { isReadOnlyMaintenanceRequest };
