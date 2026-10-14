'use strict';

const { parseDateOnly } = require('./dateOnly');

const TOP_LEVEL_FIELDS = new Set([
  'allergies',
  'medications',
  'dietaryRestrictions',
  'specialCareInstructions',
  'emergencyInstructions',
  'physicianName',
  'physicianPhone',
  'medicalNotes',
]);
const SEVERITIES = new Set(['unknown', 'mild', 'moderate', 'severe']);

function clean(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function booleanValue(value, fallback = false) {
  return typeof value === 'boolean' ? value : fallback;
}

function validateChildHealthInput(input = {}) {
  const errors = {};
  const value = {};

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { valid: false, errors: { body: 'Health details must be provided as an object.' } };
  }

  for (const field of Object.keys(input)) {
    if (!TOP_LEVEL_FIELDS.has(field)) errors[field] = 'This health-profile field cannot be changed here.';
  }

  const listFields = [
    ['allergies', 20],
    ['medications', 20],
    ['dietaryRestrictions', 20],
  ];
  for (const [field, maxItems] of listFields) {
    if (input[field] !== undefined && !Array.isArray(input[field])) {
      errors[field] = 'Enter this information as a list.';
    } else if (Array.isArray(input[field]) && input[field].length > maxItems) {
      errors[field] = 'You can enter at most ' + maxItems + ' items.';
    }
  }

  const allergyInput = Array.isArray(input.allergies) ? input.allergies : [];
  const allergies = [];
  allergyInput.forEach((item, index) => {
    const name = clean(item?.name, 120);
    const reaction = clean(item?.reaction, 500);
    const severity = clean(item?.severity, 20) || 'unknown';
    const emergencyAction = clean(item?.emergencyAction, 500);
    if (!name && !reaction && !emergencyAction) return;
    if (name.length < 2) errors['allergies.' + index + '.name'] = 'Enter the allergen name.';
    if (!SEVERITIES.has(severity)) errors['allergies.' + index + '.severity'] = 'Choose a valid severity.';
    if (name.length >= 2 && SEVERITIES.has(severity)) allergies.push({ name, reaction, severity, emergencyAction });
  });

  const medicationInput = Array.isArray(input.medications) ? input.medications : [];
  const medications = [];
  medicationInput.forEach((item, index) => {
    const name = clean(item?.name, 120);
    const dosage = clean(item?.dosage, 100);
    const instructions = clean(item?.instructions, 500);
    const startDateText = clean(item?.startDate, 10);
    const endDateText = clean(item?.endDate, 10);
    const administerAtSchool = booleanValue(item?.administerAtSchool);
    const parentAuthorizationRecorded = booleanValue(item?.parentAuthorizationRecorded);
    const authorizationNotes = clean(item?.authorizationNotes, 500);
    if (!name && !dosage && !instructions && !startDateText && !endDateText && !administerAtSchool && !parentAuthorizationRecorded && !authorizationNotes) return;

    if (name.length < 2) errors['medications.' + index + '.name'] = 'Enter the medicine name.';
    const startDate = startDateText ? parseDateOnly(startDateText) : null;
    const endDate = endDateText ? parseDateOnly(endDateText) : null;
    if (startDateText && !startDate) errors['medications.' + index + '.startDate'] = 'Enter a valid medication start date.';
    if (endDateText && !endDate) errors['medications.' + index + '.endDate'] = 'Enter a valid medication end date.';
    if (startDate && endDate && endDate < startDate) errors['medications.' + index + '.endDate'] = 'The end date cannot be before the start date.';
    if (item?.administerAtSchool !== undefined && typeof item.administerAtSchool !== 'boolean') {
      errors['medications.' + index + '.administerAtSchool'] = 'Choose Yes or No.';
    }
    if (item?.parentAuthorizationRecorded !== undefined && typeof item.parentAuthorizationRecorded !== 'boolean') {
      errors['medications.' + index + '.parentAuthorizationRecorded'] = 'Choose Yes or No.';
    }
    if (administerAtSchool) {
      if (!parentAuthorizationRecorded) {
        errors['medications.' + index + '.parentAuthorizationRecorded'] = 'Record parent or guardian authorization before a medicine can be given at school.';
      }
      if (!dosage) errors['medications.' + index + '.dosage'] = 'Enter the prescribed dosage before school staff administer this medicine.';
      if (!instructions) errors['medications.' + index + '.instructions'] = 'Enter the administration instructions before school staff administer this medicine.';
    }
    if (name.length >= 2 && (!startDateText || startDate) && (!endDateText || endDate) && (!startDate || !endDate || endDate >= startDate)) {
      medications.push({
        name,
        dosage,
        instructions,
        startDate,
        endDate,
        administerAtSchool,
        parentAuthorizationRecorded,
        authorizationNotes,
      });
    }
  });

  const restrictionInput = Array.isArray(input.dietaryRestrictions) ? input.dietaryRestrictions : [];
  const dietaryRestrictions = [];
  restrictionInput.forEach((item, index) => {
    const name = clean(item?.name, 120);
    const details = clean(item?.details, 500);
    if (!name && !details) return;
    if (name.length < 2) errors['dietaryRestrictions.' + index + '.name'] = 'Enter the dietary restriction.';
    if (name.length >= 2) dietaryRestrictions.push({ name, details });
  });

  const physicianName = clean(input.physicianName, 120);
  const physicianPhone = clean(input.physicianPhone, 30);
  if (physicianPhone && !/^\+?[0-9 ()-]{7,30}$/.test(physicianPhone)) {
    errors.physicianPhone = 'Enter a valid doctor phone number.';
  }

  value.allergies = allergies;
  value.medications = medications;
  value.dietaryRestrictions = dietaryRestrictions;
  value.specialCareInstructions = clean(input.specialCareInstructions, 1500);
  value.emergencyInstructions = clean(input.emergencyInstructions, 1500);
  value.physicianName = physicianName;
  value.physicianPhone = physicianPhone;
  value.medicalNotes = clean(input.medicalNotes, 2000);

  if (Object.keys(errors).length) return { valid: false, errors };
  return { valid: true, value };
}

function buildClassroomHealthSummary(record) {
  if (!record) {
    return {
      hasAlerts: false,
      allergies: [],
      dietaryRestrictions: [],
      specialCareInstructions: '',
      emergencyInstructions: '',
      lastUpdatedAt: null,
    };
  }
  const allergies = (record.allergies || []).map((item) => ({
    name: item.name,
    reaction: item.reaction || '',
    severity: item.severity || 'unknown',
    emergencyAction: item.emergencyAction || '',
  }));
  const dietaryRestrictions = (record.dietaryRestrictions || []).map((item) => ({
    name: item.name,
    details: item.details || '',
  }));
  const specialCareInstructions = record.specialCareInstructions || '';
  const emergencyInstructions = record.emergencyInstructions || '';
  const schoolMedicationRequired = (record.medications || []).some((item) =>
    item.administerAtSchool === true && item.parentAuthorizationRecorded === true
  );
  return {
    hasAlerts: allergies.length > 0 || dietaryRestrictions.length > 0 ||
      Boolean(specialCareInstructions || emergencyInstructions || schoolMedicationRequired),
    allergies,
    dietaryRestrictions,
    specialCareInstructions,
    emergencyInstructions,
    schoolMedicationRequired,
    lastUpdatedAt: record.updatedAt || null,
  };
}

module.exports = { validateChildHealthInput, buildClassroomHealthSummary };
