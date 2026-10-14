'use strict';

const { REQUEST_TYPES, REQUEST_STATUSES } = require('../models/FamilyDataRequest');

const CONTACT_PREFERENCES = ['portal', 'email', 'phone'];
const STATUS_TRANSITIONS = {
  submitted: ['under_review', 'action_required', 'completed', 'declined'],
  under_review: ['action_required', 'completed', 'declined'],
  action_required: ['under_review', 'completed', 'declined'],
  completed: [],
  declined: [],
};

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateFamilyDataRequestInput(input = {}) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { body: 'Request details must be an object.' } };
  }

  const allowedFields = new Set(['childId', 'requestType', 'description', 'contactPreference']);
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) errors[key] = 'This request field cannot be changed here.';
  }

  const childId = cleanText(input.childId, 32);
  if (!childId) errors.childId = 'Choose the child this request concerns.';
  const requestType = cleanText(input.requestType, 40);
  if (!REQUEST_TYPES.includes(requestType)) errors.requestType = 'Choose a valid family data request type.';
  const description = cleanText(input.description, 1200);
  if (description.length < 8) errors.description = 'Briefly explain what you need (at least 8 characters).';
  const contactPreference = input.contactPreference === undefined ? 'portal' : cleanText(input.contactPreference, 20);
  if (!CONTACT_PREFERENCES.includes(contactPreference)) errors.contactPreference = 'Choose a valid reply method.';

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, value: { childId, requestType, description, contactPreference } };
}

function validateRequestReviewInput(input = {}, currentStatus) {
  const errors = {};
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { body: 'Review details must be an object.' } };
  }
  const allowedFields = new Set(['status', 'publicResponse', 'internalNotes']);
  for (const key of Object.keys(input)) {
    if (!allowedFields.has(key)) errors[key] = 'This review field cannot be changed here.';
  }

  const status = cleanText(input.status, 30);
  const publicResponse = cleanText(input.publicResponse, 600);
  const internalNotes = cleanText(input.internalNotes, 2000);
  if (!REQUEST_STATUSES.includes(status)) {
    errors.status = 'Choose a valid request status.';
  } else if (status === currentStatus) {
    errors.status = 'Choose a different status to record a review update.';
  } else if (!STATUS_TRANSITIONS[currentStatus]?.includes(status)) {
    errors.status = 'This request can no longer move to that status.';
  }

  if (['action_required', 'completed', 'declined'].includes(status) && publicResponse.length < 8) {
    errors.publicResponse = 'Add a clear message for the family before using this status.';
  }

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, value: { status, publicResponse, internalNotes } };
}

module.exports = {
  CONTACT_PREFERENCES,
  STATUS_TRANSITIONS,
  validateFamilyDataRequestInput,
  validateRequestReviewInput,
};
