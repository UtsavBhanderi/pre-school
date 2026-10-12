'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  slugifyOrganizationName,
  validateOrganizationRegistration,
} = require('../utils/tenantRegistration');

const validInput = {
  organizationName: 'Little Stars Preschool',
  branchName: 'Main Branch',
  branchCode: 'MAIN',
  username: 'School Owner',
  email: 'OWNER@EXAMPLE.COM',
  password: 'correct-horse-battery',
  timezone: 'Asia/Kolkata',
};

test('organization slugs are normalized without unsafe characters', () => {
  assert.equal(slugifyOrganizationName('  Little Stars & Co.  '), 'little-stars-co');
  assert.equal(slugifyOrganizationName('ગુજરાતી શાળા'), 'preschool');
});

test('registration validation normalizes email and branch code', () => {
  const result = validateOrganizationRegistration(validInput);
  assert.equal(result.valid, true);
  assert.equal(result.value.email, 'owner@example.com');
  assert.equal(result.value.branchCode, 'MAIN');
  assert.equal(result.value.timezone, 'Asia/Kolkata');
  assert.equal(result.value.organizationSlugBase, 'little-stars-preschool');
});

test('registration rejects short passwords and malformed email', () => {
  const result = validateOrganizationRegistration({
    ...validInput,
    password: 'short',
    email: 'not-an-email',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.password);
  assert.ok(result.errors.email);
});

test('registration rejects unsafe branch codes, invalid timezone and overly long names', () => {
  const result = validateOrganizationRegistration({
    ...validInput,
    branchCode: '../other-tenant',
    timezone: 'Mars/Olympus',
    organizationName: 'A'.repeat(121),
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.branchCode);
  assert.ok(result.errors.timezone);
  assert.ok(result.errors.organizationName);
});

test('registration requires every core organization and owner field', () => {
  const result = validateOrganizationRegistration({});
  assert.equal(result.valid, false);
  for (const field of ['organizationName', 'branchName', 'username', 'email', 'password', 'branchCode']) {
    assert.ok(result.errors[field], 'expected validation error for ' + field);
  }
});
