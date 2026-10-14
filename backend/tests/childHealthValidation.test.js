'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  validateChildHealthInput,
  buildClassroomHealthSummary,
} = require('../utils/childHealthValidation');

test('health validation normalizes allergies, medication and dietary restrictions', () => {
  const result = validateChildHealthInput({
    allergies: [{
      name: 'Peanuts',
      reaction: 'Swelling and hives',
      severity: 'severe',
      emergencyAction: 'Follow the school emergency plan and contact guardian.',
    }],
    medications: [{
      name: 'Inhaler',
      dosage: 'As prescribed',
      instructions: 'Use only as directed by guardian and care plan',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      administerAtSchool: true,
      parentAuthorizationRecorded: true,
      authorizationNotes: 'Written permission filed',
    }],
    dietaryRestrictions: [{ name: 'Dairy', details: 'Avoid dairy products at school.' }],
    specialCareInstructions: 'Keep emergency contact information available.',
    emergencyInstructions: 'Call emergency services and the listed guardian.',
    physicianName: 'Dr Example',
    physicianPhone: '+91 98765 43210',
    medicalNotes: 'Parent-provided information; verify changes with the guardian.',
  });
  assert.equal(result.valid, true);
  assert.equal(result.value.allergies[0].severity, 'severe');
  assert.equal(result.value.medications[0].parentAuthorizationRecorded, true);
  assert.ok(result.value.medications[0].startDate instanceof Date);
  assert.equal(result.value.dietaryRestrictions[0].name, 'Dairy');
  assert.equal(result.value.physicianPhone, '+91 98765 43210');
});

test('school-administered medication requires recorded guardian authorization, dosage and instructions', () => {
  const result = validateChildHealthInput({
    medications: [{
      name: 'Medicine',
      administerAtSchool: true,
      parentAuthorizationRecorded: false,
    }],
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['medications.0.parentAuthorizationRecorded']);
  assert.ok(result.errors['medications.0.dosage']);
  assert.ok(result.errors['medications.0.instructions']);
});

test('validation rejects invalid dates, reversed date ranges, unsafe severity and unexpected fields', () => {
  const result = validateChildHealthInput({
    allergies: [{ name: 'Milk', severity: 'extreme' }],
    medications: [{
      name: 'Medicine',
      startDate: '2026-12-01',
      endDate: '2026-11-01',
    }],
    physicianPhone: 'phone me maybe',
    organizationId: 'other-tenant',
  });
  assert.equal(result.valid, false);
  assert.ok(result.errors['allergies.0.severity']);
  assert.ok(result.errors['medications.0.endDate']);
  assert.ok(result.errors.physicianPhone);
  assert.ok(result.errors.organizationId);
});

test('empty placeholder rows are ignored and item-count limits are enforced', () => {
  const result = validateChildHealthInput({
    allergies: [{ name: '' }],
    medications: [{ name: '' }],
    dietaryRestrictions: [{ name: '' }],
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.value.allergies, []);
  assert.deepEqual(result.value.medications, []);
  assert.deepEqual(result.value.dietaryRestrictions, []);

  const tooMany = validateChildHealthInput({ allergies: Array.from({ length: 21 }, (_, i) => ({ name: 'Allergen ' + i })) });
  assert.equal(tooMany.valid, false);
  assert.ok(tooMany.errors.allergies);
});

test('classroom summary returns safety details but omits private medical notes, medicines and doctor contact', () => {
  const summary = buildClassroomHealthSummary({
    allergies: [{ name: 'Peanuts', reaction: 'Hives', severity: 'severe', emergencyAction: 'Follow emergency plan' }],
    dietaryRestrictions: [{ name: 'Dairy', details: 'Avoid dairy' }],
    medications: [{ name: 'Sensitive Medicine', dosage: 'Private dosage' }],
    specialCareInstructions: 'Use the approved plan.',
    emergencyInstructions: 'Call guardian and emergency services.',
    medicalNotes: 'Private clinical note.',
    physicianName: 'Private Doctor',
    physicianPhone: '+91 90000 00000',
    updatedAt: new Date('2026-10-14T00:00:00.000Z'),
  });
  assert.equal(summary.hasAlerts, true);
  assert.equal(summary.allergies[0].name, 'Peanuts');
  assert.equal(summary.dietaryRestrictions[0].name, 'Dairy');
  assert.equal(summary.specialCareInstructions, 'Use the approved plan.');
  assert.equal(Object.hasOwn(summary, 'medications'), false);
  assert.equal(Object.hasOwn(summary, 'medicalNotes'), false);
  assert.equal(Object.hasOwn(summary, 'physicianPhone'), false);
});

test('a missing health record produces a safe empty classroom summary', () => {
  assert.deepEqual(buildClassroomHealthSummary(null), {
    hasAlerts: false,
    allergies: [],
    dietaryRestrictions: [],
    specialCareInstructions: '',
    emergencyInstructions: '',
    lastUpdatedAt: null,
  });
});
