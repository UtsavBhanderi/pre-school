'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  validateLegacyStaffManifest,
  buildLegacyStaffMigrationPlan,
} = require('../utils/legacyStaffMigration');

const org = '665000000000000000000010';
const branchA = '665000000000000000000020';
const branchB = '665000000000000000000021';
const primaryBranch = branchA;
const ownerId = '665000000000000000000099';
const adminId = '665000000000000000000030';
const teacherUserId = '665000000000000000000031';
const teacherProfileId = '665000000000000000000032';

function rawManifest(overrides = {}) {
  return {
    version: 1,
    sourceSchoolLabel: 'Verified migration test school',
    organizationId: org,
    primaryBranchId: primaryBranch,
    confirmations: {
      sourceOwnershipVerified: true,
      staffIdentityVerified: true,
      backupRestoredInStaging: true,
      classAssignmentsReviewed: true,
    },
    staff: [
      {
        legacyUserId: adminId,
        expectedEmail: 'admin@example.test',
        expectedLegacyRole: 'admin',
        role: 'head_office_admin',
        branchIds: [branchA, branchB],
        classNames: [],
      },
      {
        legacyUserId: teacherUserId,
        expectedEmail: 'teacher@example.test',
        expectedLegacyRole: 'teacher',
        role: 'teacher',
        branchIds: [branchA],
        classNames: ['ENG JR.'],
        legacyTeacherId: teacherProfileId,
      },
    ],
    ...overrides,
  };
}

function input(overrides = {}) {
  const manifestResult = validateLegacyStaffManifest(rawManifest());
  assert.equal(manifestResult.valid, true, JSON.stringify(manifestResult.errors));
  return {
    manifest: manifestResult.value,
    organization: { _id: org, status: 'active', name: 'Test School' },
    branches: [
      { _id: branchA, organizationId: org, status: 'active', code: 'MAIN' },
      { _id: branchB, organizationId: org, status: 'active', code: 'SECOND' },
    ],
    users: [
      { _id: adminId, username: 'School Admin', email: 'admin@example.test', role: 'admin' },
      { _id: teacherUserId, username: 'Teacher Account', email: 'teacher@example.test', role: 'teacher' },
    ],
    memberships: [],
    teachers: [{
      _id: teacherProfileId,
      GR_No: 'T-100',
      firstName: 'Test',
      middleName: 'Teacher',
      lastName: 'One',
      Email: 'teacher@example.test',
      RegisterPhoneNumber: '9876543210',
      gender: 'Female',
      dob: '1995-04-12',
      address: 'Test Street',
    }],
    tenantClasses: [
      { _id: '665000000000000000000040', organizationId: org, branchId: branchA, name: 'ENG JR.', status: 'active' },
      { _id: '665000000000000000000041', organizationId: org, branchId: branchB, name: 'ENG JR.', status: 'active' },
    ],
    staffProfiles: [],
    approvedBy: { _id: ownerId },
    now: new Date('2026-10-13T10:00:00.000Z'),
    ...overrides,
  };
}

test('staff manifest requires explicit identity, role, branch, class and approval confirmations', () => {
  const invalid = rawManifest();
  invalid.confirmations.staffIdentityVerified = false;
  invalid.staff[0].expectedEmail = 'not-an-email';
  invalid.staff[1].branchIds = [];
  const result = validateLegacyStaffManifest(invalid);
  assert.equal(result.valid, false);
  assert.ok(result.errors['confirmations.staffIdentityVerified']);
  assert.ok(result.errors['staff.0.expectedEmail']);
  assert.ok(result.errors['staff.1.branchIds']);
});

test('legacy administrator cannot become owner and legacy student cannot become a parent through import', () => {
  const adminEscalation = rawManifest();
  adminEscalation.staff[0].role = 'organization_owner';
  const adminResult = validateLegacyStaffManifest(adminEscalation);
  assert.equal(adminResult.valid, false);
  assert.ok(adminResult.errors['staff.0.role']);

  const parentMigration = rawManifest();
  parentMigration.staff[0].expectedLegacyRole = 'student';
  parentMigration.staff[0].role = 'parent';
  const parentResult = validateLegacyStaffManifest(parentMigration);
  assert.equal(parentResult.valid, false);
  assert.ok(parentResult.errors['staff.0.expectedLegacyRole']);
  assert.ok(parentResult.errors['staff.0.role']);
});

test('teacher profile linkage and class assignments are explicit and branch-scoped', () => {
  const plan = buildLegacyStaffMigrationPlan(input());
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.summary.membershipsToCreate, 2);
  assert.equal(plan.summary.teacherProfilesToCreate, 1);
  const teacherMembership = plan.membershipsToCreate.find((item) => String(item.userId) === teacherUserId);
  assert.equal(teacherMembership.role, 'teacher');
  assert.deepEqual(teacherMembership.branchIds.map(String), [branchA]);
  assert.deepEqual(teacherMembership.classNames, ['ENG JR.']);
  assert.equal(teacherMembership.accessAllBranches, false);

  const profile = plan.profilesToCreate[0];
  assert.equal(String(profile.userId), teacherUserId);
  assert.equal(String(profile.branchId), branchA);
  assert.equal(profile.employeeCode, 'T-100');
  assert.equal(profile.displayName, 'Test Teacher One');
  assert.equal(profile.email, 'teacher@example.test');
  assert.equal(profile.importedFromLegacy, true);
  assert.equal(profile.studentPhoto, undefined);
});

test('rejects mapping when verified email or legacy account role does not match source records', () => {
  const testInput = input();
  testInput.users[0].email = 'someone-else@example.test';
  testInput.users[1].role = 'admin';
  const plan = buildLegacyStaffMigrationPlan(testInput);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'legacy_user_email_confirmation_mismatch'));
  assert.ok(plan.errors.some((error) => error.code === 'legacy_user_role_confirmation_mismatch'));
});

test('rejects a teacher class assignment missing from any branch assigned to that teacher', () => {
  const testInput = input();
  testInput.manifest.staff[1].branchIds = [branchA, branchB];
  testInput.memberships = [];
  testInput.tenantClasses = testInput.tenantClasses.filter((item) => String(item.branchId) !== branchB);
  const plan = buildLegacyStaffMigrationPlan(testInput);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'teacher_class_not_configured_at_assigned_branch'));
});

test('conflicting memberships and teacher-profile email mismatches block migration', () => {
  const testInput = input();
  testInput.memberships = [{
    _id: new mongoose.Types.ObjectId(),
    organizationId: org,
    userId: adminId,
    role: 'branch_admin',
    branchIds: [branchA],
    classNames: [],
    accessAllBranches: false,
    status: 'active',
  }];
  testInput.teachers[0].Email = 'different-profile@example.test';
  const plan = buildLegacyStaffMigrationPlan(testInput);
  assert.equal(plan.valid, false);
  assert.ok(plan.errors.some((error) => error.code === 'target_membership_conflicts_with_explicit_legacy_mapping'));
  assert.ok(plan.errors.some((error) => error.code === 'teacher_profile_email_differs_from_verified_user'));
});

test('matching memberships and imported profiles become a safe no-op plan', () => {
  const testInput = input();
  testInput.memberships = [
    {
      _id: new mongoose.Types.ObjectId(),
      organizationId: org,
      userId: adminId,
      role: 'head_office_admin',
      branchIds: [branchA, branchB],
      classNames: [],
      accessAllBranches: false,
      status: 'active',
    },
    {
      _id: new mongoose.Types.ObjectId(),
      organizationId: org,
      userId: teacherUserId,
      role: 'teacher',
      branchIds: [branchA],
      classNames: ['ENG JR.'],
      accessAllBranches: false,
      status: 'active',
    },
  ];
  testInput.staffProfiles = [{
    _id: new mongoose.Types.ObjectId(),
    organizationId: org,
    branchId: branchA,
    userId: teacherUserId,
    legacySourceTeacherId: teacherProfileId,
  }];
  const plan = buildLegacyStaffMigrationPlan(testInput);
  assert.equal(plan.valid, true, JSON.stringify(plan.errors));
  assert.equal(plan.noOp, true);
  assert.equal(plan.membershipsToCreate.length, 0);
  assert.equal(plan.profilesToCreate.length, 0);
});
