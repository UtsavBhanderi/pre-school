'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizePhone,
  isValidParentPhone,
  normalizeParentIdentifier,
  isEmail,
  isValidParentPassword,
  phoneMatches,
  safeSchoolSlug,
} = require('../utils/parentAccess');

test('normalizes common Indian mobile number formats consistently', () => {
  assert.equal(normalizePhone('+91 98765 43210'), '9876543210');
  assert.equal(normalizePhone('098765-43210'), '9876543210');
  assert.equal(normalizePhone('9876543210'), '9876543210');
});

test('requires a ten digit mobile number after normalization', () => {
  assert.equal(isValidParentPhone('+91 98765 43210'), true);
  assert.equal(isValidParentPhone('98765'), false);
  assert.equal(isValidParentPhone('12345678901234'), false);
});

test('normalizes parent identifiers without loosening exact matching', () => {
  assert.equal(normalizeParentIdentifier('  GR-2026-0042 '), 'gr-2026-0042');
  assert.equal(normalizeParentIdentifier(' Parent@Example.com '), 'parent@example.com');
});

test('validates email and strong parent passwords', () => {
  assert.equal(isEmail('parent@example.com'), true);
  assert.equal(isEmail('invalid-email'), false);
  assert.equal(isValidParentPassword('StrongFamilyPass123'), true);
  assert.equal(isValidParentPassword('short'), false);
  assert.equal(isValidParentPassword('            '), false);
  assert.equal(isValidParentPassword('x'.repeat(129)), false);
});

test('compares submitted phone with all configured contact fields', () => {
  assert.equal(phoneMatches(['+91 98765 43210', '9123456789'], '09876543210'), true);
  assert.equal(phoneMatches(['9123456789'], '9876543210'), false);
});

test('accepts only safe lowercase school slugs', () => {
  assert.equal(safeSchoolSlug('blooming-buds'), true);
  assert.equal(safeSchoolSlug('BLOOMING BUDS'), false);
  assert.equal(safeSchoolSlug('../school'), false);
});
