'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  canReadHandover,
  canRecordHandover,
  validateCheckInInput,
  validateCheckOutInput,
  decideCheckIn,
  decideCheckOut,
  parentSafeEvent,
  containsLikelyIdNumber,
} = require('../utils/childHandoverPolicy');

test('only active staff memberships can record arrival and pickup', () => {
  assert.equal(canReadHandover({ status: 'active', role: 'parent' }), true);
  assert.equal(canRecordHandover({ status: 'active', role: 'teacher' }), true);
  assert.equal(canRecordHandover({ status: 'active', role: 'transport_staff' }), true);
  assert.equal(canRecordHandover({ status: 'active', role: 'parent' }), false);
  assert.equal(canRecordHandover({ status: 'suspended', role: 'teacher' }), false);
});

test('check-in input requires a linked guardian for family drop-off', () => {
  assert.equal(validateCheckInInput({ childId: 'child-id', method: 'family' }).valid, false);
  assert.equal(validateCheckInInput({ childId: 'child-id', method: 'family', guardianId: '507f1f77bcf86cd799439011' }).valid, true);
  assert.equal(validateCheckInInput({ childId: 'child-id', method: 'school_transport', personName: 'Driver Raj' }).valid, true);
});

test('unverified pickup attempts can be logged but cannot complete release', () => {
  assert.equal(validateCheckOutInput({ childId: 'child-id', guardianId: '507f1f77bcf86cd799439011', idChecked: false }).valid, true);
  assert.equal(validateCheckOutInput({ childId: 'child-id', guardianId: '507f1f77bcf86cd799439011', idChecked: true }).valid, true);
  assert.equal(decideCheckOut({ currentState: 'on_premises', linkedContact: { authorizedPickup: true }, idChecked: false }).allowed, false);
});

test('child cannot be checked in twice or released when not on premises', () => {
  assert.equal(decideCheckIn('outside').allowed, true);
  assert.equal(decideCheckIn('on_premises').refusalReason, 'ALREADY_ON_PREMISES');
  assert.equal(decideCheckOut({ currentState: 'outside', linkedContact: { authorizedPickup: true }, idChecked: true }).refusalReason, 'CHILD_NOT_ON_PREMISES');
});

test('pickup only succeeds for linked, authorized contact after identity check', () => {
  assert.equal(decideCheckOut({ currentState: 'on_premises', linkedContact: null, idChecked: true }).refusalReason, 'UNAUTHORIZED_PICKUP');
  assert.equal(decideCheckOut({ currentState: 'on_premises', linkedContact: { authorizedPickup: false }, idChecked: true }).allowed, false);
  assert.equal(decideCheckOut({ currentState: 'on_premises', linkedContact: { authorizedPickup: true }, idChecked: false }).refusalReason, 'ID_NOT_VERIFIED');
  assert.equal(decideCheckOut({ currentState: 'on_premises', linkedContact: { authorizedPickup: true }, idChecked: true }).nextState, 'outside');
});

test('handover inputs block common long numeric and government-ID-shaped values', () => {
  assert.equal(containsLikelyIdNumber('Aadhaar 1234 5678 9012'), true);
  assert.equal(containsLikelyIdNumber('PAN ABCDE1234F'), true);
  assert.equal(containsLikelyIdNumber('Phone 9876543210'), true);
  assert.equal(containsLikelyIdNumber('Guardian is punctual'), false);
});

test('parent-safe history never includes staff notes or unverified person names', () => {
  const safe = parentSafeEvent({
    _id: 'event-id',
    eventType: 'check_out',
    outcome: 'refused',
    eventAt: new Date('2026-10-12T10:00:00Z'),
    childId: { _id: 'child-id', fullName: 'Little Child', standard: 'Nursery' },
    branchId: { _id: 'branch-id', name: 'Main', code: 'MAIN' },
    personName: 'Unknown person',
    guardianNameSnapshot: 'Saved guardian',
    staffNote: 'Internal security note',
  });
  assert.equal(safe.guardianName, '');
  assert.equal(safe.summary.includes('Unknown person'), false);
  assert.equal(safe.staffNote, undefined);
  assert.equal(safe.summary.includes('Internal security note'), false);
});
