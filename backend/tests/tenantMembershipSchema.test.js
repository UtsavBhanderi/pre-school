'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const OrganizationMembership = require('../models/OrganizationMembership');

test('parent guardian IDs and teacher class assignments are first-class membership fields', () => {
  assert.ok(OrganizationMembership.schema.path('guardianIds'));
  assert.ok(OrganizationMembership.schema.path('classNames'));
  assert.ok(OrganizationMembership.schema.path('branchIds'));
  assert.ok(OrganizationMembership.schema.path('role'));
});

test('Mongoose keeps guardian and branch scope when building a parent membership', () => {
  const organizationId = new mongoose.Types.ObjectId();
  const userId = new mongoose.Types.ObjectId();
  const branchId = new mongoose.Types.ObjectId();
  const guardianId = new mongoose.Types.ObjectId();
  const membership = new OrganizationMembership({
    organizationId,
    userId,
    role: 'parent',
    branchIds: [branchId],
    guardianIds: [guardianId],
    status: 'active',
  });

  assert.equal(membership.validateSync(), undefined);
  assert.equal(String(membership.toObject().guardianIds[0]), String(guardianId));
  assert.equal(String(membership.toObject().branchIds[0]), String(branchId));
});

test('Mongoose keeps assigned class names on a teacher membership', () => {
  const membership = new OrganizationMembership({
    organizationId: new mongoose.Types.ObjectId(),
    userId: new mongoose.Types.ObjectId(),
    role: 'teacher',
    branchIds: [new mongoose.Types.ObjectId()],
    classNames: ['ENG JR.', 'GUJ SR.'],
    status: 'active',
  });

  assert.equal(membership.validateSync(), undefined);
  assert.deepEqual(membership.toObject().classNames, ['ENG JR.', 'GUJ SR.']);
});
