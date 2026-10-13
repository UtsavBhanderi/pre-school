'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('legacy migration is gated, transactional, reconciles fees and is safe to rerun', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const Student = require('../models/Student');
  const Attendance = require('../models/Attendance');
  const Fee = require('../models/Fee');
  const TenantClass = require('../models/TenantClass');
  const FeeInvoice = require('../models/FeeInvoice');
  const FeeTransaction = require('../models/FeeTransaction');
  const AuditEvent = require('../models/AuditEvent');
  const LegacyMigrationRun = require('../models/LegacyMigrationRun');

  // This test is specifically for a restored staging shape. Ensure the known
  // collections and unique indexes exist before the guarded runner checks them.
  await Promise.all([
    User.init(), Organization.init(), Branch.init(), OrganizationMembership.init(),
    Student.init(), Attendance.init(), Fee.init(), TenantClass.init(),
    FeeInvoice.init(), FeeTransaction.init(), AuditEvent.init(), LegacyMigrationRun.init(),
  ]);

  const tag = crypto.randomBytes(5).toString('hex');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'preschool-migration-'));
  const manifestPath = path.join(tempRoot, 'manifest.json');
  const ids = { users: [], organizations: [], branches: [], students: [], attendance: [], fees: [], tenantClasses: [] };
  let runFingerprint = null;
  let sourceLabel = 'Verified migration integration ' + tag;
  let organization;
  let branch;
  let owner;
  let child;
  let attendanceRecord;
  let feeRecord;

  function runMigration(extraArgs = [], envOverrides = {}) {
    const args = [
      'legacyTenantMigration.js',
      '--manifest', manifestPath,
      '--json',
      ...extraArgs,
    ];
    return spawnSync(process.execPath, args, {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        MONGO_URI: integrationUri,
        NODE_ENV: 'test',
        SAAS_MIGRATION_ENV: 'local',
        ALLOW_LEGACY_TENANT_MIGRATION: 'false',
        ...envOverrides,
      },
    });
  }

  async function cleanup() {
    const safeOrganizationFilter = organization
      ? { organizationId: organization._id }
      : { organizationId: { $in: ids.organizations } };
    await Promise.allSettled([
      FeeTransaction.deleteMany(safeOrganizationFilter),
      FeeInvoice.deleteMany(safeOrganizationFilter),
      LegacyMigrationRun.deleteMany(safeOrganizationFilter),
      AuditEvent.deleteMany(safeOrganizationFilter),
      Fee.deleteMany({ _id: { $in: ids.fees } }),
      Attendance.deleteMany({ _id: { $in: ids.attendance } }),
      Student.deleteMany({ _id: { $in: ids.students } }),
      TenantClass.deleteMany({ _id: { $in: ids.tenantClasses } }),
      OrganizationMembership.deleteMany({ organizationId: organization?._id }),
      Branch.deleteMany({ _id: { $in: ids.branches } }),
      Organization.deleteMany({ _id: { $in: ids.organizations } }),
      User.deleteMany({ _id: { $in: ids.users } }),
    ]);
    await mongoose.disconnect();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  t.after(cleanup);

  owner = await User.create({
    username: 'migration-owner-' + tag,
    email: 'migration-owner-' + tag + '@example.test',
    password: 'integration-migration-password-' + tag,
    role: 'admin',
  });
  ids.users.push(owner._id);
  organization = await Organization.create({
    name: 'Legacy migration test ' + tag,
    slug: 'legacy-migration-test-' + tag,
    createdBy: owner._id,
  });
  ids.organizations.push(organization._id);
  branch = await Branch.create({
    organizationId: organization._id,
    name: 'Main test branch',
    code: 'MAIN-' + tag.slice(0, 5).toUpperCase(),
    createdBy: owner._id,
  });
  ids.branches.push(branch._id);
  await OrganizationMembership.create({
    organizationId: organization._id,
    userId: owner._id,
    role: 'organization_owner',
    branchIds: [branch._id],
    accessAllBranches: true,
    status: 'active',
  });
  await TenantClass.create({
    organizationId: organization._id,
    branchId: branch._id,
    name: 'ENG JR.',
    code: 'ENG-JR',
    status: 'active',
    capacity: 30,
    createdBy: owner._id,
  }).then((record) => ids.tenantClasses.push(record._id));

  child = {
    _id: new mongoose.Types.ObjectId(),
    firstName: 'Migration',
    middleName: 'Test',
    lastName: 'Child',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
    stuNo: 'MIG-' + tag,
    dob: '2022-05-14',
  };
  // Raw inserts intentionally bypass Student post-save fee initialization so
  // the test starts with a faithful unscoped legacy state.
  await Student.collection.insertOne(child);
  ids.students.push(child._id);

  attendanceRecord = {
    _id: new mongoose.Types.ObjectId(),
    date: new Date('2026-10-01T00:00:00.000Z'),
    standard: 'ENG JR.',
    studentDetails: [{ studentId: child._id, status: 'present', reason: '' }],
  };
  await Attendance.collection.insertOne(attendanceRecord);
  ids.attendance.push(attendanceRecord._id);

  feeRecord = {
    _id: new mongoose.Types.ObjectId(),
    stuNo: child.stuNo,
    studentName: 'Migration Test Child',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
    totalStandardFees: 1000,
    totalFeesPaid: 250,
    totalFeesRemaining: 750,
    discount: 0,
    paymentDetails: [{ amount: 250, date: '10/01/2026', time: '09:45 AM' }],
  };
  await Fee.collection.insertOne(feeRecord);
  ids.fees.push(feeRecord._id);

  const { MIGRATION_COLLECTIONS } = require('../utils/legacyMigrationManifest');
  const manifest = {
    version: 1,
    sourceSchoolLabel: sourceLabel,
    organizationId: String(organization._id),
    branchId: String(branch._id),
    collections: Object.fromEntries(MIGRATION_COLLECTIONS.map((name) => [
      name,
      ['students', 'attendance', 'fees'].includes(name) ? 'legacy_unscoped' : 'skip',
    ])),
    confirmations: {
      sourceOwnershipVerified: true,
      backupRestoredInStaging: true,
      feeLedgerReviewed: true,
    },
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  await t.test('apply is blocked outside staging before it connects or writes', async () => {
    const blocked = runMigration([
      '--apply',
      '--confirm-source-label', sourceLabel,
      '--confirm-organization', String(organization._id),
      '--confirm-branch', String(branch._id),
      '--approved-by', String(owner._id),
      '--change-ticket', 'IT-MIG-' + tag,
    ]);
    assert.equal(blocked.status, 2, blocked.stderr + blocked.stdout);
    const result = JSON.parse(blocked.stdout);
    assert.equal(result.writesPerformed, false);
    assert.ok(result.errors.some((error) => error.code === 'STAGING_ENVIRONMENT_REQUIRED'));
    assert.ok(result.errors.some((error) => error.code === 'WRITE_GATE_NOT_ENABLED'));
    assert.equal(await Student.countDocuments({ _id: child._id, organizationId: { $exists: true } }), 0);
  });

  await t.test('dry run reports the plan but leaves all source records unchanged', async () => {
    const dryRun = runMigration([]);
    assert.equal(dryRun.status, 0, dryRun.stderr + dryRun.stdout);
    const report = JSON.parse(dryRun.stdout);
    assert.equal(report.status, 'READY_FOR_MANUAL_REVIEW');
    assert.equal(report.writesPerformed, false);
    assert.equal(report.summary.selectedStudents, 1);
    assert.equal(report.summary.selectedAttendanceRecords, 1);
    assert.equal(report.summary.selectedLegacyFeeRecords, 1);
    assert.equal(report.summary.feeInvoicesToCreate, 1);
    assert.equal(await Student.countDocuments({ _id: child._id, organizationId: { $exists: true } }), 0);
    assert.equal(await FeeInvoice.countDocuments({ legacySourceFeeId: feeRecord._id }), 0);
  });

  const approvedRun = runMigration([
    '--apply',
    '--confirm-source-label', sourceLabel,
    '--confirm-organization', String(organization._id),
    '--confirm-branch', String(branch._id),
    '--approved-by', String(owner._id),
    '--change-ticket', 'IT-MIG-' + tag,
  ], {
    NODE_ENV: 'staging',
    SAAS_MIGRATION_ENV: 'staging',
    ALLOW_LEGACY_TENANT_MIGRATION: 'true',
  });

  await t.test('approved apply scopes the selected records and preserves the fee ledger', async () => {
    assert.equal(approvedRun.status, 0, approvedRun.stderr + approvedRun.stdout);
    const result = JSON.parse(approvedRun.stdout);
    assert.equal(result.status, 'MIGRATION_COMPLETED');
    assert.equal(result.writesPerformed, true);
    runFingerprint = result.fingerprint;

    const migratedChild = await Student.findById(child._id).lean();
    assert.equal(String(migratedChild.organizationId), String(organization._id));
    assert.equal(String(migratedChild.branchId), String(branch._id));

    const migratedAttendance = await Attendance.findById(attendanceRecord._id).lean();
    assert.equal(String(migratedAttendance.organizationId), String(organization._id));
    assert.equal(String(migratedAttendance.branchId), String(branch._id));
    assert.equal(migratedAttendance.standard, 'ENG JR.');

    const migratedFee = await Fee.findById(feeRecord._id).lean();
    assert.equal(String(migratedFee.organizationId), String(organization._id));
    assert.equal(String(migratedFee.branchId), String(branch._id));

    const invoice = await FeeInvoice.findOne({ legacySourceFeeId: feeRecord._id }).lean();
    assert.ok(invoice);
    assert.equal(invoice.totalAmountPaise, 100000);
    assert.equal(invoice.subtotalPaise, 100000);

    const transactions = await FeeTransaction.find({ legacySourceFeeId: feeRecord._id }).lean();
    assert.equal(transactions.length, 1);
    assert.equal(transactions[0].amountPaise, 25000);
    assert.equal(transactions[0].legacyOriginalDate, '10/01/2026');
    assert.equal(transactions[0].legacyOriginalTime, '09:45 AM');
    assert.equal(transactions[0].legacyImported, true);

    const runRecord = await LegacyMigrationRun.findOne({ fingerprint: result.fingerprint }).lean();
    assert.equal(runRecord.status, 'completed');
    assert.equal(runRecord.summary.paymentTransactionsCreated, 1);
    const audit = await AuditEvent.findOne({ action: 'legacy.migration.completed', resourceId: result.fingerprint }).lean();
    assert.ok(audit);
    assert.equal(String(audit.organizationId), String(organization._id));
  });

  await t.test('rerunning the same manifest does not duplicate invoices or payments', async () => {
    const rerun = runMigration([
      '--apply',
      '--confirm-source-label', sourceLabel,
      '--confirm-organization', String(organization._id),
      '--confirm-branch', String(branch._id),
      '--approved-by', String(owner._id),
      '--change-ticket', 'IT-MIG-' + tag,
    ], {
      NODE_ENV: 'staging',
      SAAS_MIGRATION_ENV: 'staging',
      ALLOW_LEGACY_TENANT_MIGRATION: 'true',
    });
    assert.equal(rerun.status, 0, rerun.stderr + rerun.stdout);
    const result = JSON.parse(rerun.stdout);
    assert.equal(result.status, 'NO_UNSCOPED_RECORDS_TO_MIGRATE');
    assert.equal(result.writesPerformed, false);
    assert.equal(await FeeInvoice.countDocuments({ legacySourceFeeId: feeRecord._id }), 1);
    assert.equal(await FeeTransaction.countDocuments({ legacySourceFeeId: feeRecord._id }), 1);
    if (runFingerprint) assert.equal(await LegacyMigrationRun.countDocuments({ fingerprint: runFingerprint }), 1);
  });
});
