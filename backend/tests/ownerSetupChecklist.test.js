'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { buildOwnerSetupChecklist } = require('../utils/ownerSetupChecklist');

const organization = {
  _id: 'org-a',
  name: 'Little Stars Preschool',
  contact: {
    email: 'office@example.test',
    phone: '+91 90000 11111',
    address: { city: 'Surat' },
  },
};

const branch = {
  _id: 'branch-a',
  name: 'Main Branch',
  code: 'MAIN',
  phone: '+91 90000 22222',
  address: { city: 'Surat' },
};

test('a new owner sees the real required setup steps as incomplete', () => {
  const checklist = buildOwnerSetupChecklist({
    organization,
    branches: [branch],
    counts: {},
    now: new Date('2026-10-14T07:00:00.000Z'),
  });
  assert.equal(checklist.organization.id, 'org-a');
  assert.equal(checklist.branchScope.name, 'All permitted branches');
  assert.equal(checklist.progress.completedRequired, 0);
  assert.equal(checklist.progress.totalRequired, 5);
  assert.equal(checklist.progress.percent, 0);
  assert.equal(checklist.progress.isReady, false);
  assert.equal(checklist.steps.find((step) => step.id === 'organization-profile').completed, true);
  assert.equal(checklist.steps.find((step) => step.id === 'classes').completed, false);
  assert.equal(checklist.steps.find((step) => step.id === 'parent-portal').required, false);
});

test('required checklist progress changes only when actual records exist', () => {
  const checklist = buildOwnerSetupChecklist({
    organization,
    branches: [branch],
    counts: {
      activeClasses: 2,
      childCount: 14,
      attendanceCount: 30,
      invoiceCount: 12,
      paymentCount: 8,
      staffCount: 3,
      parentCount: 10,
    },
  });
  assert.equal(checklist.progress.completedRequired, 5);
  assert.equal(checklist.progress.totalRequired, 5);
  assert.equal(checklist.progress.percent, 100);
  assert.equal(checklist.progress.isReady, true);
  assert.equal(checklist.steps.every((step) => step.completed), true);
  assert.equal(checklist.steps.find((step) => step.id === 'children').count, 14);
  assert.equal(checklist.steps.find((step) => step.id === 'payment').count, 8);
});

test('optional tasks do not block essential setup completion', () => {
  const checklist = buildOwnerSetupChecklist({
    organization,
    branches: [branch],
    counts: { activeClasses: 1, childCount: 1, attendanceCount: 1, invoiceCount: 1 },
  });
  assert.equal(checklist.progress.isReady, true);
  assert.equal(checklist.steps.find((step) => step.id === 'team').completed, false);
  assert.equal(checklist.steps.find((step) => step.id === 'parent-portal').completed, false);
});

test('missing school contacts and branch details remain visible as unfinished guidance', () => {
  const checklist = buildOwnerSetupChecklist({
    organization: { _id: 'org-b', name: 'New School', contact: {} },
    branches: [{ _id: 'branch-b', name: 'Main', code: 'MAIN', phone: '', address: {} }],
    counts: { activeClasses: 0, childCount: 0, attendanceCount: 0, invoiceCount: 0 },
  });
  assert.equal(checklist.steps.find((step) => step.id === 'organization-profile').completed, false);
  assert.equal(checklist.steps.find((step) => step.id === 'branch-profile').completed, false);
  assert.equal(checklist.branchScope.name, 'All permitted branches');
});

test('branch selected setup guidance identifies its actual scope', () => {
  const checklist = buildOwnerSetupChecklist({
    organization,
    branches: [branch],
    branch,
    counts: {},
  });
  assert.deepEqual(checklist.branchScope, { id: 'branch-a', name: 'Main Branch' });
});
