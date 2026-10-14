'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  ORGANIZATION_SIGNUP_TTL_HOURS,
  createOrganizationSignupToken,
  hashOrganizationSignupToken,
  organizationSignupExpiry,
} = require('../utils/organizationSignupTokens');
const { validateOrganizationSignupRequest } = require('../utils/organizationSignupValidation');

test('organization verification token is random and only a hash is stored', () => {
  const one = createOrganizationSignupToken();
  const two = createOrganizationSignupToken();
  assert.ok(one.token.length >= 40);
  assert.notEqual(one.token, two.token);
  assert.equal(one.tokenHash, hashOrganizationSignupToken(one.token));
  assert.equal(one.tokenHash.length, 64);
  assert.notEqual(one.token, one.tokenHash);
});

test('organization verification links expire after 24 hours', () => {
  assert.equal(ORGANIZATION_SIGNUP_TTL_HOURS, 24);
  assert.equal(
    organizationSignupExpiry(new Date('2026-10-14T00:00:00.000Z')).toISOString(),
    '2026-10-15T00:00:00.000Z',
  );
});

test('signup validation normalizes email and default branch code', () => {
  const result = validateOrganizationSignupRequest({
    organizationName: 'Little Stars Preschool',
    branchName: 'Main Branch',
    username: 'School Owner',
    email: 'OWNER@EXAMPLE.COM',
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.email, 'owner@example.com');
  assert.equal(result.value.branchCode, 'MAIN');
  assert.equal(result.value.organizationSlugBase, 'little-stars-preschool');
  assert.equal(Object.hasOwn(result.value, 'password'), false);
});

test('signup validation rejects invalid organization, owner, branch and timezone fields', () => {
  const result = validateOrganizationSignupRequest({
    organizationName: 'A',
    branchName: 'B',
    username: '',
    email: 'invalid',
    branchCode: '../escape',
    timezone: 'Mars/Olympus',
  });
  assert.equal(result.valid, false);
  for (const field of ['organizationName', 'branchName', 'username', 'email', 'branchCode', 'timezone']) {
    assert.ok(result.errors[field], 'expected error for ' + field);
  }
});
