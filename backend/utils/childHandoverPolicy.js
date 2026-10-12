'use strict';

const HANDOVER_READ_ROLES = [
  'organization_owner', 'head_office_admin', 'branch_admin',
  'admissions', 'teacher', 'transport_staff', 'parent',
];
const HANDOVER_WRITE_ROLES = [
  'organization_owner', 'head_office_admin', 'branch_admin',
  'admissions', 'teacher', 'transport_staff',
];

function isActiveRole(membership, roles) {
  return Boolean(membership && membership.status === 'active' && roles.includes(membership.role));
}

function canReadHandover(membership) {
  return isActiveRole(membership, HANDOVER_READ_ROLES);
}

function canRecordHandover(membership) {
  return isActiveRole(membership, HANDOVER_WRITE_ROLES);
}

function cleanText(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validateCheckInInput(input = {}) {
  const childId = cleanText(input.childId, 32);
  const method = cleanText(input.method || 'family', 30);
  const guardianId = cleanText(input.guardianId, 32);
  const personName = cleanText(input.personName, 120);
  const staffNote = cleanText(input.staffNote, 500);
  const errors = {};

  if (!childId) errors.childId = 'Choose a child.';
  if (!['family', 'school_transport', 'other'].includes(method)) errors.method = 'Choose Family, School transport, or Other.';
  if (guardianId && !/^[a-f0-9]{24}$/i.test(guardianId)) errors.guardianId = 'Choose a valid family contact.';
  if (method === 'family' && !guardianId) errors.guardianId = 'Choose the family member who brought the child.';
  if (method !== 'family' && personName.length < 2) errors.personName = 'Enter the name of the person bringing the child.';
  return Object.keys(errors).length
    ? { valid: false, errors, message: Object.values(errors)[0] }
    : { valid: true, value: { childId, method, guardianId, personName, staffNote } };
}

function validateCheckOutInput(input = {}) {
  const childId = cleanText(input.childId, 32);
  const guardianId = cleanText(input.guardianId, 32);
  const personName = cleanText(input.personName, 120);
  const staffNote = cleanText(input.staffNote, 500);
  const idChecked = input.idChecked === true;
  const errors = {};

  if (!childId) errors.childId = 'Choose a child.';
  if (guardianId && !/^[a-f0-9]{24}$/i.test(guardianId)) errors.guardianId = 'Choose a valid family contact.';
  if (personName.length > 0 && personName.length < 2) errors.personName = 'Enter at least 2 characters for the pickup person name.';
  // A false ID-check must still reach the endpoint so the school can log a refused release.
  return Object.keys(errors).length
    ? { valid: false, errors, message: Object.values(errors)[0] }
    : { valid: true, value: { childId, guardianId, personName, staffNote, idChecked } };
}

function decideCheckIn(currentState) {
  if (currentState === 'on_premises') {
    return { allowed: false, refusalReason: 'ALREADY_ON_PREMISES', message: 'This child is already recorded as on the premises.' };
  }
  return { allowed: true, nextState: 'on_premises' };
}

function decideCheckOut({ currentState, linkedContact, idChecked }) {
  if (currentState !== 'on_premises') {
    return { allowed: false, refusalReason: 'CHILD_NOT_ON_PREMISES', message: 'The child is not currently recorded as on the premises. Contact the school administrator before release.' };
  }
  if (!linkedContact || linkedContact.authorizedPickup !== true) {
    return { allowed: false, refusalReason: 'UNAUTHORIZED_PICKUP', message: 'This person is not listed as an authorized pickup contact. The child has not been checked out.' };
  }
  if (idChecked !== true) {
    return { allowed: false, refusalReason: 'ID_NOT_VERIFIED', message: 'Identity verification is required before the child can be released.' };
  }
  return { allowed: true, nextState: 'outside' };
}

function parentSafeEvent(event) {
  const refused = event.outcome === 'refused';
  return {
    id: String(event._id),
    eventType: event.eventType,
    outcome: event.outcome,
    eventAt: event.eventAt,
    childId: String(event.childId?._id || event.childId),
    childName: event.childId?.fullName || '',
    className: event.childId?.standard || '',
    branch: event.branchId ? {
      id: String(event.branchId._id || event.branchId),
      name: event.branchId.name || '',
      code: event.branchId.code || '',
    } : null,
    summary: refused
      ? 'A pickup or arrival action was declined by school staff. Please contact the school office if you need details.'
      : event.eventType === 'check_in'
        ? 'Arrival recorded by school staff.'
        : 'Pickup recorded by school staff.',
    guardianName: !refused ? (event.guardianNameSnapshot || '') : '',
  };
}

module.exports = {
  HANDOVER_READ_ROLES,
  HANDOVER_WRITE_ROLES,
  canReadHandover,
  canRecordHandover,
  validateCheckInInput,
  validateCheckOutInput,
  decideCheckIn,
  decideCheckOut,
  parentSafeEvent,
};
