'use strict';

// Only fields belonging to the legacy single-school profile forms may be
// written through these routes. System identifiers, tenancy metadata, marks,
// account credentials and upload paths are intentionally excluded.
const STUDENT_PROFILE_FIELDS = Object.freeze([
  'firstName', 'middleName', 'lastName', 'gender', 'dob', 'bloodGroup',
  'religion', 'cast', 'nationality', 'schoolName', 'schoolBoard',
  'motherTongue', 'address', 'phoneNumber', 'standard', 'batchYear',
  'studentProblem', 'studentAadharNo', 'MotherName', 'FatherName',
  'FatherAge', 'FatherEducationQualification', 'FatherOccupation',
  'FatherDesignation', 'FatherAnnualIncome', 'FatherMobileNumber',
  'FatherPhoneNumber', 'EmergencyPhoneNumber', 'parentEmail',
  'previousSchoolName', 'previousStandardMarks', 'previousSchoolBoard',
  'siblingName', 'siblingAge', 'siblingSchoolName', 'siblingStandard',
]);

const TEACHER_PROFILE_FIELDS = Object.freeze([
  'firstName', 'middleName', 'lastName', 'gender', 'dob', 'bloodGroup',
  'religion', 'cast', 'motherTongue', 'address', 'RegisterPhoneNumber',
  'standard', 'GR_No', 'batchYear', 'Problem', 'MotherMobileNumber',
  'FatherMobileNumber', 'EmergencyPhoneNumber', 'Email', 'Village',
  'Taluka', 'District', 'drivingLicence', 'vehical', 'married',
]);

function pickProfileFields(input, allowedFields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {};
  const output = {};
  for (const field of allowedFields) {
    if (!Object.prototype.hasOwnProperty.call(input, field)) continue;
    const value = input[field];
    output[field] = typeof value === 'string' ? value.trim() : value;
  }
  return output;
}

module.exports = {
  STUDENT_PROFILE_FIELDS,
  TEACHER_PROFILE_FIELDS,
  pickProfileFields,
};
