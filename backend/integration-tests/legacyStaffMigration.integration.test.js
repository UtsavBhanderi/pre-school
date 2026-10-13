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

test('legacy staff migration gates identity, branch and class scope without changing source credentials', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });

  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const TenantClass = require('../models/TenantClass');
  const Teacher = require('../models/Teacher');
  const TenantStaffProfile = require('../models/TenantStaffProfile');
  const LegacyMigrationRun = require('../models/LegacyMigrationRun');
  const AuditEvent = require('../models/AuditEvent');

  await Promise.all([
    User.init(), Organization.init(), Branch.init(), OrganizationMembership.init(),
    TenantClass.init(), Teacher.init(), TenantStaffProfile.init(),
    LegacyMigrationRun.init(), AuditEvent.init(),
  ]);

  const tag = crypto.randomBytes(5).toString('hex');
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'preschool-staff-migration-'));
  const manifestPath = path.join(tempRoot, 'staff-manifest.json');
  let owner;
  let legacyAdmin;
  let legacyTeacher;
  let organization;
  let branchA;
  let branchB;
  let teacherProfile;
  let classA;
  let classB;

  async function cleanup() {
    const orgFilter = organization ? { organizationId: organization._id } : { organizationId: { $exists: false } };
    await Promise.allSettled([
      TenantStaffProfile.deleteMany(orgFilter),
      LegacyMigrationRun.deleteMany(orgFilter),
      AuditEvent.deleteMany(orgFilter),
      OrganizationMembership.deleteMany(orgFilter),
      TenantClass.deleteMany({ _id: { $in: [classA?._id, classB?._id].filter(Boolean) } }),
      Teacher.deleteMany({ _id: teacherProfile?._id }),
      Branch.deleteMany({ _id: { $in: [branchA?._id, branchB?._id].filter(Boolean) } }),
      Organization.deleteMany({ _id: organization?._id }),
      User.deleteMany({ _id: { $in: [owner?._id, legacyAdmin?._id, legacyTeacher?._id].filter(Boolean) } }),
    ]);
    await mongoose.disconnect();
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  t.after(cleanup);

  owner = await User.create({
    username: 'staff-migration-owner-' + tag,
    email: 'staff-migration-owner-' + tag + '@example.test',
    password: 'test-owner-password-' + tag,
    role: 'admin',
  });
  legacyAdmin = await User.create({
    username: 'legacy-admin-' + tag,
    email: 'legacy-admin-' + tag + '@example.test',
    password: 'legacy-admin-password-' + tag,
    role: 'admin',
  });
  legacyTeacher = await User.create({
    username: 'legacy-teacher-' + tag,
    email: 'legacy-teacher-' + tag + '@example.test',
    password: 'legacy-teacher-password-' + tag,
    role: 'teacher',
  });

  organization = await Organization.create({
    name: 'Staff migration integration ' + tag,
    slug: 'staff-migration-' + tag,
    createdBy: owner._id,
  });
  branchA = await Branch.create({
    organizationId: organization._id,
    name: 'Main branch',
    code: 'MAIN-' + tag.slice(0, 5).toUpperCase(),
    createdBy: owner._id,
  });
  branchB = await Branch.create({
    organizationId: organization._id,
    name: 'Second branch',
    code: 'SECOND-' + tag.slice(0, 4).toUpperCase(),
    createdBy: owner._id,
  });

  await OrganizationMembership.create({
    organizationId: organization._id,
    userId: owner._id,
    role: 'organization_owner',
    branchIds: [branchA._id, branchB._id],
    accessAllBranches: true,
    status: 'active',
  });

  classA = await TenantClass.create({
    organizationId: organization._id,
    branchId: branchA._id,
    name: 'ENG JR.',
    code: 'ENG-JR',
    status: 'active',
    capacity: 30,
    createdBy: owner._id,
  });
  classB = await TenantClass.create({
    organizationId: organization._id,
    branchId: branchB._id,
    name: 'ENG JR.',
    code: 'ENG-JR',
    status: 'active',
    capacity: 30,
    createdBy: owner._id,
  });
  teacherProfile = await Teacher.create({
    firstName: 'Legacy',
    middleName: 'Teacher',
    lastName: 'Profile',
    GR_No: 'T-' + tag,
    Email: legacyTeacher.email,
    RegisterPhoneNumber: '9876543210',
    gender: 'Female',
    dob: '1995-04-12',
    address: 'Test street',
  });

  const sourceAdmin = await User.findById(legacyAdmin._id).select('_id email role password').lean();
  const sourceTeacher = await User.findById(legacyTeacher._id).select('_id email role password').lean();
  const teacherBefore = await Teacher.findById(teacherProfile._id).lean();

  const manifest = {
    version: 1,
    sourceSchoolLabel: 'Verified integration school ' + tag,
    organizationId: String(organization._id),
    primaryBranchId: String(branchA._id),
    confirmations: {
      sourceOwnershipVerified: true,
      staffIdentityVerified: true,
      backupRestoredInStaging: true,
      classAssignmentsReviewed: true,
    },
    staff: [
      {
        legacyUserId: String(legacyAdmin._id),
        expectedEmail: legacyAdmin.email,
        expectedLegacyRole: 'admin',
        role: 'head_office_admin',
        branchIds: [String(branchA._id), String(branchB._id)],
        classNames: [],
        approvalNote: 'owner-confirmed admin scope',
      },
      {
        legacyUserId: String(legacyTeacher._id),
        expectedEmail: legacyTeacher.email,
        expectedLegacyRole: 'teacher',
        role: 'teacher',
        branchIds: [String(branchA._id)],
        classNames: ['ENG JR.'],
        legacyTeacherId: String(teacherProfile._id),
      },
    ],
  };
  await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  function runMigration(extraArgs = [], envOverrides = {}) {
    return spawnSync(process.execPath, [
      'legacyStaffMigration.js',
      '--manifest', manifestPath,
      '--json',
      ...extraArgs,
    ], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        ...process.env,
        MONGO_URI: integrationUri,
        NODE_ENV: 'test',
        SAAS_MIGRATION_ENV: 'local',
        ALLOW_LEGACY_STAFF_MIGRATION: 'false',
        ...envOverrides,
      },
    });
  }

  const confirmationArgs = [
    '--apply',
    '--confirm-source-label', manifest.sourceSchoolLabel,
    '--confirm-organization', String(organization._id),
    '--confirm-primary-branch', String(branchA._id),
    '--approved-by', String(owner._id),
    '--change-ticket', 'STAFF-MIG-' + tag,
  ];

  await t.test('apply is blocked outside staging before data changes', async () => {
    const blocked = runMigration(confirmationArgs);
    assert.equal(blocked.status, 2, blocked.stderr + blocked.stdout);
    const result = JSON.parse(blocked.stdout);
    assert.equal(result.writesPerformed, false);
    assert.ok(result.errors.some((item) => item.code === 'STAGING_ENVIRONMENT_REQUIRED'));
    assert.ok(result.errors.some((item) => item.code === 'WRITE_GATE_NOT_ENABLED'));
    assert.equal(await OrganizationMembership.countDocuments({ organizationId: organization._id, userId: { $in: [legacyAdmin._id, legacyTeacher._id] } }), 0);
  });

  await t.test('dry-run plans scopes without printing member emails or changing source records', async () => {
    const dryRun = runMigration();
    assert.equal(dryRun.status, 0, dryRun.stderr + dryRun.stdout);
    const result = JSON.parse(dryRun.stdout);
    assert.equal(result.status, 'READY_FOR_MANUAL_REVIEW');
    assert.equal(result.writesPerformed, false);
    assert.equal(result.summary.membershipsToCreate, 2);
    assert.equal(result.summary.teacherProfilesToCreate, 1);
    assert.ok(!dryRun.stdout.includes(legacyAdmin.email));
    assert.ok(!dryRun.stdout.includes(legacyTeacher.email));
    assert.equal(await OrganizationMembership.countDocuments({ organizationId: organization._id, userId: { $in: [legacyAdmin._id, legacyTeacher._id] } }), 0);
  });

  const applied = runMigration(confirmationArgs, {
    NODE_ENV: 'staging',
    SAAS_MIGRATION_ENV: 'staging',
    ALLOW_LEGACY_STAFF_MIGRATION: 'true',
  });

  await t.test('approved apply adds only the explicitly assigned tenant memberships and teacher profile', async () => {
    assert.equal(applied.status, 0, applied.stderr + applied.stdout);
    const result = JSON.parse(applied.stdout);
    assert.equal(result.status, 'STAFF_MIGRATION_COMPLETED');
    assert.equal(result.writesPerformed, true);

    const adminMembership = await OrganizationMembership.findOne({
      organizationId: organization._id, userId: legacyAdmin._id,
    }).lean();
    assert.ok(adminMembership);
    assert.equal(adminMembership.role, 'head_office_admin');
    assert.equal(adminMembership.accessAllBranches, false);
    assert.deepEqual(adminMembership.branchIds.map(String).sort(), [String(branchA._id), String(branchB._id)].sort());

    const teacherMembership = await OrganizationMembership.findOne({
      organizationId: organization._id, userId: legacyTeacher._id,
    }).lean();
    assert.ok(teacherMembership);
    assert.equal(teacherMembership.role, 'teacher');
    assert.equal(teacherMembership.accessAllBranches, false);
    assert.deepEqual(teacherMembership.branchIds.map(String), [String(branchA._id)]);
    assert.deepEqual(teacherMembership.classNames, ['ENG JR.']);

    const newProfile = await TenantStaffProfile.findOne({
      organizationId: organization._id,
      branchId: branchA._id,
      userId: legacyTeacher._id,
      legacySourceTeacherId: teacherProfile._id,
    }).lean();
    assert.ok(newProfile);
    assert.equal(newProfile.employeeCode, teacherBefore.GR_No);
    assert.equal(newProfile.displayName, 'Legacy Teacher Profile');
    assert.equal(newProfile.email, legacyTeacher.email);
    assert.equal(newProfile.phone, teacherBefore.RegisterPhoneNumber);
    assert.equal(newProfile.importedFromLegacy, true);

    const teacherAfter = await Teacher.findById(teacherProfile._id).lean();
    assert.deepEqual(teacherAfter, teacherBefore);
    const adminAfter = await User.findById(legacyAdmin._id).select('_id email role password').lean();
    const teacherUserAfter = await User.findById(legacyTeacher._id).select('_id email role password').lean();
    assert.equal(adminAfter.password, sourceAdmin.password);
    assert.equal(teacherUserAfter.password, sourceTeacher.password);
    assert.equal(await LegacyMigrationRun.countDocuments({ fingerprint: result.fingerprint }), 1);
    assert.ok(await AuditEvent.findOne({ action: 'legacy.staff_migration.completed', resourceId: result.fingerprint }));
  });

  await t.test('replaying the same staff mapping is a no-op without duplicate rows', async () => {
    const rerun = runMigration(confirmationArgs, {
      NODE_ENV: 'staging',
      SAAS_MIGRATION_ENV: 'staging',
      ALLOW_LEGACY_STAFF_MIGRATION: 'true',
    });
    assert.equal(rerun.status, 0, rerun.stderr + rerun.stdout);
    const result = JSON.parse(rerun.stdout);
    assert.equal(result.status, 'NO_STAFF_CHANGES_REQUIRED');
    assert.equal(result.writesPerformed, false);
    assert.equal(await OrganizationMembership.countDocuments({ organizationId: organization._id, userId: { $in: [legacyAdmin._id, legacyTeacher._id] } }), 2);
    assert.equal(await TenantStaffProfile.countDocuments({ organizationId: organization._id, legacySourceTeacherId: teacherProfile._id }), 1);
  });
});
