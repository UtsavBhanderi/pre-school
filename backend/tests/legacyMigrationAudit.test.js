'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  classifyScope,
  parseLegacyPaymentDate,
  indexStudentsByAdmissionNumber,
  auditLegacyFeeRecord,
  buildLegacyMigrationAudit,
} = require('../utils/legacyMigrationAudit');

const student = (overrides = {}) => ({
  _id: '665000000000000000000001',
  stuNo: 'GR-001',
  standard: 'ENG JR.',
  batchYear: '2026-2027',
  ...overrides,
});

const fee = (overrides = {}) => ({
  _id: '665000000000000000000002',
  stuNo: 'GR-001',
  standard: 'ENG JR.',
  batchYear: '2026-2027',
  totalStandardFees: 1000,
  totalFeesPaid: 300,
  discount: 100,
  totalFeesRemaining: 600,
  paymentDetails: [
    { amount: 100, date: '10/01/2026' },
    { amount: 200, date: '2026-10-02' },
  ],
  ...overrides,
});

test('scope classifier separates legacy, tenant-scoped and partially scoped records', () => {
  const result = classifyScope([
    {},
    { organizationId: 'org-a' },
    { branchId: 'branch-a' },
    { organizationId: 'org-a', branchId: 'branch-a' },
  ]);
  assert.deepEqual(result, { total: 4, fullyUnscoped: 1, fullyScoped: 1, partiallyScoped: 2 });
});

test('legacy payment dates are parsed without month/day ambiguity', () => {
  assert.equal(parseLegacyPaymentDate('10/1/2026'), '2026-10-01');
  assert.equal(parseLegacyPaymentDate('2026-10-02'), '2026-10-02');
  assert.equal(parseLegacyPaymentDate('02/30/2026'), null);
  assert.equal(parseLegacyPaymentDate('31/12/2026'), null);
  assert.equal(parseLegacyPaymentDate('2026-02-30'), null);
  assert.equal(parseLegacyPaymentDate(''), null);
});

test('a fee record that agrees with its student and payment history has no issues', () => {
  const index = indexStudentsByAdmissionNumber([student()]);
  assert.deepEqual(auditLegacyFeeRecord(fee(), index), []);
});

test('fee audit detects orphaned/ambiguous students and financial inconsistencies', () => {
  const students = [student(), student({ _id: '665000000000000000000003' })];
  const index = indexStudentsByAdmissionNumber(students);
  const issues = auditLegacyFeeRecord(fee({
    totalFeesPaid: 900,
    totalFeesRemaining: 123,
    discount: 1200,
    paymentDetails: [
      { amount: -5, date: 'not-a-date' },
      { amount: 10, date: '02/30/2026' },
    ],
  }), index);
  assert.ok(issues.includes('fee_child_ambiguous'));
  assert.ok(issues.includes('fee_invalid_payment_amount'));
  assert.ok(issues.includes('fee_invalid_payment_date'));
  assert.ok(issues.includes('fee_payment_history_mismatch'));
  assert.ok(issues.includes('fee_discount_exceeds_standard_fee'));
  assert.ok(issues.includes('fee_paid_exceeds_amount_due'));
  assert.ok(issues.includes('fee_remaining_mismatch'));

  const orphanIssues = auditLegacyFeeRecord(fee({ stuNo: 'missing' }), index);
  assert.ok(orphanIssues.includes('fee_child_not_found'));
});

test('migration audit reports child-reference and scope blockers without exposing personal data', () => {
  const report = buildLegacyMigrationAudit({
    students: [
      student({ firstName: 'Private Child', phoneNumber: '9999999999' }),
      student({ _id: '665000000000000000000003', stuNo: 'GR-001', firstName: 'Another Child' }),
    ],
    attendance: [{
      _id: '665000000000000000000004',
      date: new Date('2026-10-01T00:00:00.000Z'),
      standard: 'ENG JR.',
      studentDetails: [
        { studentId: '665000000000000000000001', status: 'present' },
        { studentId: 'not-a-real-child', status: 'absent' },
      ],
    }],
    fees: [fee()],
    teachers: [{ _id: '665000000000000000000005', GR_No: '', Email: 'private@example.test' }],
    users: [{ role: 'teacher' }, { role: 'admin' }, { role: 'student' }],
  });

  assert.equal(report.readOnly, true);
  assert.equal(report.writeOperationsPerformed, false);
  assert.equal(report.migrationPerformed, false);
  assert.equal(report.status, 'PREFLIGHT_ONLY');
  assert.ok(report.issuesByCode.student_duplicate_admission_numbers >= 1);
  assert.ok(report.issuesByCode.attendance_child_reference_not_found >= 1);
  assert.ok(report.issuesByCode.student_requires_explicit_organization_branch_mapping >= 1);
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes('Private Child'));
  assert.ok(!serialized.includes('9999999999'));
  assert.ok(!serialized.includes('private@example.test'));
});

test('audit issues have a bounded, PII-safe sample list', () => {
  const students = Array.from({ length: 80 }, (_, index) => student({
    _id: String(index).padStart(24, '0'),
    stuNo: '',
  }));
  const report = buildLegacyMigrationAudit({ students });
  assert.ok(report.issueSamples.length <= 50);
  assert.equal(report.summary.studentRecords, 80);
  assert.equal(report.decision.automaticMigrationAllowed, false);
});
