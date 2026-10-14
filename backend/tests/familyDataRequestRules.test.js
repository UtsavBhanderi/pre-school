'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateFamilyDataRequestInput,
  validateRequestReviewInput,
} = require('../utils/familyDataRequestRules');

const validRequest = {
  childId: '65a6a1f14c7e30f212345678',
  requestType: 'correction',
  description: 'Please correct my child’s contact details.',
  contactPreference: 'portal',
};

test('family request validation accepts only supported request types and reply channels', () => {
  const result = validateFamilyDataRequestInput(validRequest);
  assert.equal(result.valid, true);
  assert.equal(result.value.requestType, 'correction');
  assert.equal(result.value.contactPreference, 'portal');
  assert.equal(validateFamilyDataRequestInput({ ...validRequest, contactPreference: 'whatsapp' }).valid, false);
  assert.equal(validateFamilyDataRequestInput({ ...validRequest, requestType: 'automatic_delete' }).valid, false);
});

test('family request validation rejects empty descriptions, missing child and unknown fields', () => {
  const result = validateFamilyDataRequestInput({
    childId: '',
    requestType: 'access_copy',
    description: 'too short',
    organizationId: 'another-organization',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors.childId);
  assert.ok(result.errors.organizationId);
});

test('review statuses require a family-facing message for action, completion or decline', () => {
  for (const status of ['action_required', 'completed', 'declined']) {
    const result = validateRequestReviewInput({ status, publicResponse: '  ' }, 'under_review');
    assert.equal(result.valid, false);
    assert.ok(result.errors.publicResponse);
  }
  const completed = validateRequestReviewInput({
    status: 'completed',
    publicResponse: 'We have reviewed and completed your request.',
    internalNotes: 'Confirmed details with the office.',
  }, 'under_review');
  assert.equal(completed.valid, true);
  assert.equal(completed.value.status, 'completed');
});

test('request status cannot be moved backwards from terminal statuses or changed to the same status', () => {
  assert.equal(validateRequestReviewInput({ status: 'submitted' }, 'submitted').valid, false);
  assert.equal(validateRequestReviewInput({ status: 'under_review' }, 'completed').valid, false);
  assert.equal(validateRequestReviewInput({ status: 'action_required' }, 'declined').valid, false);
  assert.equal(validateRequestReviewInput({ status: 'under_review' }, 'action_required').valid, true);
});

test('review validation rejects fields that could rewrite the original request or tenant scope', () => {
  const result = validateRequestReviewInput({
    status: 'under_review',
    childId: 'some-other-child',
    requesterUserId: 'someone-else',
    publicResponse: '',
    internalNotes: 'Only internal staff can read this.',
  }, 'submitted');
  assert.equal(result.valid, false);
  assert.ok(result.errors.childId);
  assert.ok(result.errors.requesterUserId);
});
