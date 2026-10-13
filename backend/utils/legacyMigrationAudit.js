'use strict';

const { parseMoneyToPaise } = require('./tenantMoney');
const { parseDateOnly } = require('./dateOnly');
const { STANDARD_FEES } = require('../config/standardFees');

const MONEY_TOLERANCE_PAISE = 1;
const MAX_ISSUE_SAMPLES = 50;

function hasId(value) {
  return value !== undefined && value !== null && String(value).trim() !== '';
}

function classifyScope(records = []) {
  let fullyUnscoped = 0;
  let fullyScoped = 0;
  let partiallyScoped = 0;

  for (const record of records) {
    const hasOrganization = hasId(record?.organizationId);
    const hasBranch = hasId(record?.branchId);
    if (hasOrganization && hasBranch) fullyScoped += 1;
    else if (!hasOrganization && !hasBranch) fullyUnscoped += 1;
    else partiallyScoped += 1;
  }

  return {
    total: records.length,
    fullyUnscoped,
    fullyScoped,
    partiallyScoped,
  };
}

function parseLegacyPaymentDate(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;

  // Newer exports sometimes contain ISO dates; validate date-only ISO strictly.
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    const date = parseDateOnly(text);
    return date ? text : null;
  }

  // The legacy fees dashboard parses MM/DD/YYYY, so this accepts that exact
  // family of formats but will not silently reinterpret 03/04/2026 as DD/MM.
  const match = /^(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])\/(\d{4})$/.exec(text);
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  const year = Number(match[3]);
  const iso = String(year).padStart(4, '0') + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  return parseDateOnly(iso) ? iso : null;
}

function safeRecordRef(record) {
  const value = record?._id === undefined || record?._id === null ? '' : String(record._id);
  return value ? value.slice(0, 10) : null;
}

function indexStudentsByAdmissionNumber(students = []) {
  const index = new Map();
  for (const student of students) {
    const admissionNumber = String(student?.stuNo || '').trim();
    if (!admissionNumber) continue;
    const current = index.get(admissionNumber) || [];
    current.push(student);
    index.set(admissionNumber, current);
  }
  return index;
}

function findDuplicateValues(records = [], valueReader = (record) => record?.stuNo) {
  const counts = new Map();
  for (const record of records) {
    const value = String(valueReader(record) || '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return [...counts.values()].filter((count) => count > 1).length;
}

function auditLegacyFeeRecord(fee, studentsByAdmissionNumber) {
  const issues = [];
  const admissionNumber = String(fee?.stuNo || '').trim();
  const matches = admissionNumber ? (studentsByAdmissionNumber.get(admissionNumber) || []) : [];

  if (!admissionNumber || matches.length === 0) issues.push('fee_child_not_found');
  else if (matches.length > 1) issues.push('fee_child_ambiguous');

  const standardFeesPaise = parseMoneyToPaise(fee?.totalStandardFees ?? 0);
  const totalPaidPaise = parseMoneyToPaise(fee?.totalFeesPaid ?? 0);
  const discountPaise = parseMoneyToPaise(fee?.discount ?? 0);
  const remainingPaise = parseMoneyToPaise(fee?.totalFeesRemaining ?? 0);

  if ([standardFeesPaise, totalPaidPaise, discountPaise, remainingPaise].some((value) => value === null)) {
    issues.push('fee_invalid_money_value');
  }

  let detailTotalPaise = 0;
  const details = Array.isArray(fee?.paymentDetails) ? fee.paymentDetails : [];
  for (const detail of details) {
    const amountPaise = parseMoneyToPaise(detail?.amount ?? 0);
    if (amountPaise === null) {
      issues.push('fee_invalid_payment_amount');
      continue;
    }
    detailTotalPaise += amountPaise;
    if (!Number.isSafeInteger(detailTotalPaise)) {
      issues.push('fee_payment_history_overflow');
      break;
    }
    if (amountPaise > 0 && !parseLegacyPaymentDate(detail?.date)) {
      issues.push('fee_invalid_payment_date');
    }
  }

  if (totalPaidPaise !== null && Math.abs(detailTotalPaise - totalPaidPaise) > MONEY_TOLERANCE_PAISE) {
    issues.push('fee_payment_history_mismatch');
  }

  if (standardFeesPaise !== null && discountPaise !== null && discountPaise > standardFeesPaise) {
    issues.push('fee_discount_exceeds_standard_fee');
  }

  if (standardFeesPaise !== null && totalPaidPaise !== null && discountPaise !== null) {
    const amountDuePaise = Math.max(0, standardFeesPaise - discountPaise);
    if (totalPaidPaise > amountDuePaise + MONEY_TOLERANCE_PAISE) {
      issues.push('fee_paid_exceeds_amount_due');
    }
    if (remainingPaise !== null) {
      const calculatedRemainingPaise = Math.max(0, standardFeesPaise - totalPaidPaise - discountPaise);
      if (Math.abs(calculatedRemainingPaise - remainingPaise) > MONEY_TOLERANCE_PAISE) {
        issues.push('fee_remaining_mismatch');
      }
    }
  }

  if (matches.length === 1) {
    const child = matches[0];
    if (fee.standard && child.standard && String(fee.standard).trim() !== String(child.standard).trim()) {
      issues.push('fee_class_mismatch');
    }
    if (fee.batchYear && child.batchYear && String(fee.batchYear).trim() !== String(child.batchYear).trim()) {
      issues.push('fee_academic_year_mismatch');
    }
  }

  return [...new Set(issues)];
}

function buildLegacyMigrationAudit(input = {}) {
  const students = Array.isArray(input.students) ? input.students : [];
  const attendance = Array.isArray(input.attendance) ? input.attendance : [];
  const fees = Array.isArray(input.fees) ? input.fees : [];
  const teachers = Array.isArray(input.teachers) ? input.teachers : [];
  const users = Array.isArray(input.users) ? input.users : [];
  const studentIndex = indexStudentsByAdmissionNumber(students);
  const issues = [];
  const issueCounts = Object.create(null);

  function addIssue(code, record) {
    issueCounts[code] = (issueCounts[code] || 0) + 1;
    if (issues.length < MAX_ISSUE_SAMPLES) {
      issues.push({ code, recordRef: safeRecordRef(record) });
    }
  }

  const duplicateAdmissionNumbers = findDuplicateValues(students);
  if (duplicateAdmissionNumbers) addIssue('student_duplicate_admission_numbers', null);

  for (const student of students) {
    if (!String(student?.stuNo || '').trim()) addIssue('student_missing_admission_number', student);
    if (!String(student?.standard || '').trim()) addIssue('student_missing_class', student);
    else if (!Object.prototype.hasOwnProperty.call(STANDARD_FEES, String(student.standard).trim())) {
      addIssue('student_class_not_in_legacy_fee_schedule', student);
    }
    if (!hasId(student?.organizationId) || !hasId(student?.branchId)) {
      addIssue('student_requires_explicit_organization_branch_mapping', student);
    }
  }

  const studentById = new Map(students.map((student) => [String(student?._id), student]));
  for (const record of attendance) {
    const children = Array.isArray(record?.studentDetails) ? record.studentDetails : [];
    if (!children.length) addIssue('attendance_empty_record', record);
    const seen = new Set();
    const observedClasses = new Set();

    for (const entry of children) {
      const childId = String(entry?.studentId?._id || entry?.studentId || '');
      if (!childId || !studentById.has(childId)) {
        addIssue('attendance_child_reference_not_found', record);
        continue;
      }
      if (seen.has(childId)) addIssue('attendance_duplicate_child_entry', record);
      seen.add(childId);
      const child = studentById.get(childId);
      if (child?.standard) observedClasses.add(String(child.standard).trim());
      if (record.standard && child?.standard && String(record.standard).trim() !== String(child.standard).trim()) {
        addIssue('attendance_record_class_mismatch', record);
      }
      if (!['present', 'absent'].includes(String(entry?.status || '').toLowerCase())) {
        addIssue('attendance_invalid_status', record);
      }
    }

    if (observedClasses.size > 1) addIssue('attendance_contains_multiple_classes', record);
    if (!hasId(record?.organizationId) || !hasId(record?.branchId)) {
      addIssue('attendance_requires_explicit_organization_branch_mapping', record);
    }
  }

  let feeRecordIssueCount = 0;
  for (const fee of fees) {
    const feeIssues = auditLegacyFeeRecord(fee, studentIndex);
    if (feeIssues.length) feeRecordIssueCount += 1;
    for (const issue of feeIssues) addIssue(issue, fee);
    if (!hasId(fee?.organizationId) || !hasId(fee?.branchId)) {
      addIssue('fee_requires_explicit_organization_branch_mapping', fee);
    }
  }

  for (const teacher of teachers) {
    if (!String(teacher?.GR_No || '').trim()) addIssue('teacher_missing_legacy_identifier', teacher);
    if (!hasId(teacher?.organizationId) || !hasId(teacher?.branchId)) {
      addIssue('teacher_requires_explicit_organization_branch_mapping', teacher);
    }
  }

  const countsByRole = {};
  for (const user of users) {
    const role = String(user?.role || 'unknown');
    countsByRole[role] = (countsByRole[role] || 0) + 1;
  }

  const dataScope = {
    students: classifyScope(students),
    attendance: classifyScope(attendance),
    fees: classifyScope(fees),
    teachers: classifyScope(teachers),
    tenantClasses: classifyScope(input.tenantClasses || []),
    tenantInvoices: classifyScope(input.tenantInvoices || []),
    tenantTransactions: classifyScope(input.tenantTransactions || []),
    guardians: classifyScope(input.guardians || []),
    childGuardianLinks: classifyScope(input.childGuardianLinks || []),
    reportCards: classifyScope(input.reportCards || []),
    calendarEvents: classifyScope(input.calendarEvents || []),
    pdfResources: classifyScope(input.pdfResources || []),
    galleryPhotos: classifyScope(input.galleryPhotos || []),
    videos: classifyScope(input.videos || []),
  };

  const totalBlockerIssues = Object.values(issueCounts).reduce((sum, count) => sum + count, 0);
  return {
    auditVersion: 1,
    readOnly: true,
    writeOperationsPerformed: false,
    migrationPerformed: false,
    status: 'PREFLIGHT_ONLY',
    summary: {
      studentRecords: students.length,
      attendanceRecords: attendance.length,
      legacyFeeRecords: fees.length,
      teacherProfiles: teachers.length,
      usersByLegacyRole: countsByRole,
      duplicateStudentAdmissionNumberGroups: duplicateAdmissionNumbers,
      feeRecordsWithOneOrMoreIssues: feeRecordIssueCount,
      blockerIssueCount: totalBlockerIssues,
      issueSampleLimit: MAX_ISSUE_SAMPLES,
    },
    dataScope,
    issuesByCode: issueCounts,
    issueSamples: issues,
    decision: {
      automaticMigrationAllowed: false,
      reason: 'This audit does not assign ownership or change records. Explicit organization/branch mapping, financial reconciliation, identity verification, and backup/restore sign-off remain required.',
      requiredNextSteps: [
        'Take a consistent encrypted backup and verify a restore in staging.',
        'Provide an explicit legacy-school-to-organization-and-branch mapping; never infer tenant ownership from names or email domains.',
        'Resolve every duplicate admission identifier, broken attendance reference, and financial mismatch.',
        'Verify staff accounts and guardian-to-child relationships with the school before granting portal access.',
        'Migrate photos and attachments into private tenant-aware storage, then test that unauthorized users cannot download them.',
        'Run tenant-isolation integration tests after migration and reconcile source versus destination totals.',
      ],
    },
  };
}

module.exports = {
  MONEY_TOLERANCE_PAISE,
  MAX_ISSUE_SAMPLES,
  classifyScope,
  parseLegacyPaymentDate,
  indexStudentsByAdmissionNumber,
  findDuplicateValues,
  auditLegacyFeeRecord,
  buildLegacyMigrationAudit,
};
