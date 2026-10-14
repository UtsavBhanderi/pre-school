'use strict';

const crypto = require('crypto');

const ORGANIZATION_SIGNUP_TTL_HOURS = 24;

function createOrganizationSignupToken() {
  const token = crypto.randomBytes(32).toString('base64url');
  return { token, tokenHash: hashOrganizationSignupToken(token) };
}

function hashOrganizationSignupToken(token) {
  if (typeof token !== 'string' || token.length < 32 || token.length > 200) return '';
  return crypto.createHash('sha256').update(token).digest('hex');
}

function organizationSignupExpiry(from = new Date()) {
  return new Date(from.getTime() + ORGANIZATION_SIGNUP_TTL_HOURS * 60 * 60 * 1000);
}

module.exports = {
  ORGANIZATION_SIGNUP_TTL_HOURS,
  createOrganizationSignupToken,
  hashOrganizationSignupToken,
  organizationSignupExpiry,
};
