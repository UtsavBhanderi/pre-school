'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateOrganizationProfile,
  validateBranchProfile,
} = require('../utils/organizationSettings');

const currentOrganization = {
  name: 'Little Stars',
  timezone: 'Asia/Kolkata',
  locale: 'en-IN',
  currency: 'INR',
  contact: {
    email: 'school@example.com',
    phone: '+91 98765 43210',
    website: '',
    address: { line1: 'Main Road', line2: '', city: 'Surat', state: 'Gujarat', postalCode: '395001', country: 'India' },
  },
  settings: { academicYearStartMonth: 4, dateFormat: 'DD-MM-YYYY', defaultLanguage: 'en' },
};

test('organization profile normalizes safe contact information and preferences', () => {
  const result = validateOrganizationProfile({
    name: 'Little Stars Preschool',
    timezone: 'Asia/Kolkata',
    locale: 'gu-IN',
    contact: { email: ' INFO@EXAMPLE.COM ', phone: '+91 90000 11111', website: 'https://school.example', address: { city: 'Vadodara' } },
    settings: { academicYearStartMonth: 6, dateFormat: 'YYYY-MM-DD', defaultLanguage: 'gu' },
  }, currentOrganization);
  assert.equal(result.valid, true);
  assert.equal(result.value.name, 'Little Stars Preschool');
  assert.equal(result.value.contact.email, 'info@example.com');
  assert.equal(result.value.contact.address.city, 'Vadodara');
  assert.equal(result.value.settings.defaultLanguage, 'gu');
});

test('organization profile rejects unsupported timezone, locale, currency and preferences', () => {
  const result = validateOrganizationProfile({
    timezone: 'Mars/Olympus',
    locale: 'xx-INVALID',
    currency: 'NOT_A_CURRENCY',
    settings: { academicYearStartMonth: 0, dateFormat: 'DD/MM/YYYY', defaultLanguage: 'fr' },
  }, currentOrganization);
  assert.equal(result.valid, false);
  assert.ok(result.errors.timezone);
  assert.ok(result.errors.locale);
  assert.ok(result.errors.currency);
  assert.ok(result.errors.academicYearStartMonth);
  assert.ok(result.errors.dateFormat);
  assert.ok(result.errors.defaultLanguage);
});

test('profile refuses unexpected fields and non-HTTPS websites', () => {
  const organization = validateOrganizationProfile({ isPlatformAdmin: true }, currentOrganization);
  assert.equal(organization.valid, false);
  assert.ok(organization.errors.isPlatformAdmin);
  const branch = validateBranchProfile({ website: 'http://school.example', organizationId: 'other' });
  assert.equal(branch.valid, false);
  assert.ok(branch.errors.website);
  assert.ok(branch.errors.organizationId);
});

test('branch profile accepts partial contact updates and validates email and phone', () => {
  const result = validateBranchProfile({
    name: 'Main Campus',
    email: 'CAMPUS@EXAMPLE.COM',
    phone: '+91 98765 11111',
    timezone: 'Asia/Kolkata',
    address: { city: 'Surat', state: 'Gujarat' },
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.email, 'campus@example.com');
  assert.equal(result.value.address.city, 'Surat');
});

test('branch profile rejects malformed contact values and empty names', () => {
  const result = validateBranchProfile({ name: ' ', email: 'wrong', phone: 'abc' });
  assert.equal(result.valid, false);
  assert.ok(result.errors.name);
  assert.ok(result.errors.email);
  assert.ok(result.errors.phone);
});
