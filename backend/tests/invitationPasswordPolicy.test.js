'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isValidExistingAccountPassword,
  isValidNewAccountPassword,
} = require('../utils/invitationPasswordPolicy');

test('existing accounts may use their current password even when it is shorter than the new-account minimum', () => {
  assert.equal(isValidExistingAccountPassword('Abcd1234'), true);
  assert.equal(isValidNewAccountPassword('Abcd1234'), false);
});

test('new accounts require at least 12 non-blank characters', () => {
  assert.equal(isValidNewAccountPassword('ValidPass123'), false);
  assert.equal(isValidNewAccountPassword('ValidPass1234'), true);
  assert.equal(isValidNewAccountPassword('            '), false);
});

test('passwords outside the supported length range are rejected', () => {
  assert.equal(isValidExistingAccountPassword('short'), false);
  assert.equal(isValidExistingAccountPassword('x'.repeat(129)), false);
  assert.equal(isValidNewAccountPassword('x'.repeat(129)), false);
});
