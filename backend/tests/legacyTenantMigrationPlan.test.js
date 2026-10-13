'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MIGRATION_COLLECTIONS } = require('../utils/legacyMigrationManifest');
const { buildLegacyTenantMigrationPlan } = require('../utils/legacyTenantMigrationPlan');

const organizationId = '665000000000000000000010';
const branchId = '665000000000000000000020';
const approvedById = '665000000000000000000099';
const studentId = '665000000000000000000030';
const attendanceId = '665000000000000000000031';
const feeId = '665000000000000000000032';

function manifest(overrides = {}) {
  return {
    version: 1,
    sourceSchoolLabel: 'Verified test preschool',
    organizationId,
    branchId,
    collections: Object.fromEntries(MIGRATION_COLLECTIONS.map((name) => [
      name,
      ['students', 'attendance', 'fees'].includes(name) ? 'legacy_unscoped' : 'skip',
    ])),
    confirmations: {
      sourceOwnershipVerified: true,
      backupRestoredInStaging: true,
      feeLedgerReviewed: true,
    },
    ...overrides,
  };
}

function migrationInput(overrides = {}) {
  const schoolOrganization = { _id: organizationId, status: 'active', name: 'Verified test preschool', timezone: 'Asia/Kolkata' };
  const branch = { _id: branchId, organizationId, status: 'active', code: 'MAIN', timezone: 'Asia/Kolkata' };
  const owner = { _id: approvedById };
  const student = {
    _id: studentId,
    stuNo: 'GR-001',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
    organizationId: null,
    branchId: null,
  };
  const attendance = {
    _id: attendanceId,
    date: new Date('2026-10-01T00:00:00.000Z'),
    standard: 'ENG JR.',
    studentDetails: [{ studentId, status: 'present', reason: '' }],
    organizationId: null,
    branchId: null,
  };
  const fee = {
    _id: feeId,
    stuNo: 'GR-001',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
    totalStandardFees: 1000,
    totalFeesPaid: 250,
    totalFeesRemaining: 750,
    discount: 0,
    paymentDetails: [{ amount: 250, date: '10/01/2026', time: '09:45 AM' }],
    organizationId: null,
    branchId: null,
  };
  return {
    manifest: manifest(),
    organization: schoolOrganization,
    branch,
    approvedBy: owner,
    students: [student],
    attendance: [attendance],
    fees: [fee],
    tenantClasses: [{ _id: '665000000000000000000040', organizationId, branchId, name: 'ENG JR.', status: 'active' }],
    existingAttendance: [],
    existingInvoices: [],
    now: new Date('2026-10-13T10:00:00.000Z'),
    ...overrides,
  };
}

test('plans tenant ownership updates and fee invoices without mutating source objects', () => {
  const input = migrationInput();
  const before = JSON.stringify(input.students);
  const plan = buildLegacyTenantMigrationPlan(input);

  assert.equal(plan.valid, true);
  assert.equal(plan.summary.selectedStudents, 1);
  assert.equal(plan.summary.selectedAttendanceRecords, 1);
  assert.equal(plan.summary.selectedLegacyFeeRecords, 1);
  assert.equal(plan.summary.feeInvoicesToCreate, 1);
  assert.equal(plan.summary.paymentTransactionsToCreate, 1);
  assert.equal(plan.invoicesToCreate[0].subtotalPaise, 100000);
  assert.equal(plan.invoicesToCreate[0].discountPaise, 0);
  assert.equal(plan.invoicesToCreate[0].totalAmountPaise, 100000);
  assert.equal(plan.transactionsToCreate[0].amountPaise, 25000);
  assert.equal(plan.transactionsToCreate[0].legacyImported, true);
  assert.equal(plan.transactionsToCreate[0].legacyOriginalDate, '10/01/2026');
  assert.equal(plan.transactionsToCreate[0].legacyOriginalTime, '09:45 AM');
  assert.equal(plan.studentUpdates[0].set.organizationId, organizationId);
  assert.equal(plan.attendanceUpdates[0].set.standard, 'ENG JR.');
  assert.ok(/^[a-f0-9]{64}$/.test(plan.fingerprint));
  assert.equal(JSON.stringify(input.students), before);
});

test('rejects migration when source scope is only partially populated', () => {
  const input = migrationInput();
  input.students[0].organizationId = organizationId;
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'students_contains_partially_scoped_records'));
});

test('rejects child attendance that references a child outside the selected cohort', () => {
  const input = migrationInput();
  input.attendance[0].studentDetails[0].studentId = '665000000000000000000088';
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'attendance_child_outside_selected_student_cohort'));
});

test('rejects attendance collisions with an existing target-branch class/day record', () => {
  const input = migrationInput();
  input.existingAttendance = [{
    _id: '665000000000000000000077',
    organizationId,
    branchId,
    date: new Date('2026-10-01T16:00:00.000Z'),
    standard: 'ENG JR.',
  }];
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'target_attendance_date_class_already_exists'));
});

test('rejects financial records that do not reconcile to their payment history', () => {
  const input = migrationInput();
  input.fees[0].totalFeesPaid = 200;
  input.fees[0].totalFeesRemaining = 800;
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'fee_payment_history_does_not_match_total_paid'));
});

test('rejects a fee record if a tenant invoice already exists for its child', () => {
  const input = migrationInput();
  input.existingInvoices = [{ organizationId, branchId, childId: studentId, academicYear: '2025-2026' }];
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'target_child_already_has_fee_invoice'));
});

test('rejects when the approved operation limit would be exceeded', () => {
  const input = migrationInput({ maxOperations: 4 });
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'migration_operation_limit_exceeded'));
});

test('an already-migrated source produces a no-op plan instead of a duplicate import', () => {
  const input = migrationInput({
    students: [{ ...migrationInput().students[0], organizationId, branchId }],
    attendance: [{ ...migrationInput().attendance[0], organizationId, branchId }],
    fees: [{ ...migrationInput().fees[0], organizationId, branchId }],
  });
  const plan = buildLegacyTenantMigrationPlan(input);
  assert.equal(plan.valid, true);
  assert.equal(plan.noOp, true);
  assert.equal(plan.summary.selectedStudents, 0);
  assert.equal(plan.summary.feeInvoicesToCreate, 0);
});
