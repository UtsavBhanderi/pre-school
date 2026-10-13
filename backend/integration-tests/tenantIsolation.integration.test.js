'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('tenant APIs isolate organizations, branches, families and concurrent fee payments', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const Student = require('../models/Student');
  const Guardian = require('../models/Guardian');
  const ChildGuardian = require('../models/ChildGuardian');
  const FeeInvoice = require('../models/FeeInvoice');
  const FeeTransaction = require('../models/FeeTransaction');
  const TenantSequence = require('../models/TenantSequence');
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  let seeded = {};
  const createdUserIds = [];
  const createdOrganizationIds = [];
  const createdBranchIds = [];
  const createdStudentIds = [];
  const createdGuardianIds = [];
  const createdInvoiceIds = [];

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, {
    token,
    organizationId,
    branchId,
    method = 'GET',
    body,
  } = {}) {
    const headers = {
      ...(token ? { 'x-auth-token': token } : {}),
      ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}),
      ...(branchId ? { 'x-branch-id': String(branchId) } : {}),
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
    };
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function makeUser(role = 'admin', label = 'user') {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'integration-test-password-' + tag,
      role,
    });
    createdUserIds.push(user._id);
    return user;
  }

  async function makeChild({ organizationId, branchId, createdBy, name, admission }) {
    const child = await Student.create({
      firstName: name,
      middleName: 'Integration',
      lastName: 'Child',
      standard: 'ENG JR.',
      batchYear: '2026-2027',
      dob: '2022-05-14',
      stuNo: admission + '-' + tag,
      organizationId,
      branchId,
      createdBy,
    });
    createdStudentIds.push(child._id);
    return child;
  }

  async function makeInvoice({ organizationId, branchId, childId, createdBy, invoiceNumber }) {
    const invoice = await FeeInvoice.create({
      organizationId,
      branchId,
      childId,
      invoiceNumber: invoiceNumber + '-' + tag,
      academicYear: '2026-2027',
      lineItems: [{ description: 'Tuition fee', quantity: 1, unitAmountPaise: 10000, lineTotalPaise: 10000 }],
      subtotalPaise: 10000,
      discountPaise: 0,
      totalAmountPaise: 10000,
      createdBy,
    });
    createdInvoiceIds.push(invoice._id);
    return invoice;
  }

  async function cleanUp() {
    const organizationFilter = { organizationId: { $in: createdOrganizationIds } };
    await Promise.allSettled([
      FeeTransaction.deleteMany(organizationFilter),
      FeeInvoice.deleteMany(organizationFilter),
      ChildGuardian.deleteMany(organizationFilter),
      Guardian.deleteMany(organizationFilter),
      Attendance.deleteMany(organizationFilter),
      Student.deleteMany(organizationFilter),
      TenantSequence.deleteMany(organizationFilter),
      AuditEvent.deleteMany(organizationFilter),
      OrganizationMembership.deleteMany(organizationFilter),
      Branch.deleteMany({ _id: { $in: createdBranchIds } }),
      Organization.deleteMany({ _id: { $in: createdOrganizationIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }

  const Attendance = require('../models/Attendance');
  t.after(cleanUp);

  const ownerA = await makeUser('admin', 'owner-a');
  const ownerB = await makeUser('admin', 'owner-b');
  const branchStaff = await makeUser('teacher', 'limited-staff');
  const parentUser = await makeUser('student', 'parent-a');

  const organizationA = await Organization.create({
    name: 'Integration School A ' + tag,
    slug: 'integration-school-a-' + tag,
    createdBy: ownerA._id,
  });
  const organizationB = await Organization.create({
    name: 'Integration School B ' + tag,
    slug: 'integration-school-b-' + tag,
    createdBy: ownerB._id,
  });
  createdOrganizationIds.push(organizationA._id, organizationB._id);

  const branchA = await Branch.create({
    organizationId: organizationA._id,
    name: 'Main A',
    code: 'MAIN-A',
    createdBy: ownerA._id,
  });
  const branchA2 = await Branch.create({
    organizationId: organizationA._id,
    name: 'Second A',
    code: 'SECOND-A',
    createdBy: ownerA._id,
  });
  const branchB = await Branch.create({
    organizationId: organizationB._id,
    name: 'Main B',
    code: 'MAIN-B',
    createdBy: ownerB._id,
  });
  createdBranchIds.push(branchA._id, branchA2._id, branchB._id);

  await OrganizationMembership.create([
    {
      organizationId: organizationA._id,
      userId: ownerA._id,
      role: 'organization_owner',
      branchIds: [branchA._id, branchA2._id],
      accessAllBranches: true,
      status: 'active',
    },
    {
      organizationId: organizationB._id,
      userId: ownerB._id,
      role: 'organization_owner',
      branchIds: [branchB._id],
      accessAllBranches: true,
      status: 'active',
    },
    {
      organizationId: organizationA._id,
      userId: branchStaff._id,
      role: 'admissions',
      branchIds: [branchA._id],
      accessAllBranches: false,
      status: 'active',
    },
  ]);

  const guardian = await Guardian.create({
    organizationId: organizationA._id,
    fullName: 'Parent A ' + tag,
    email: parentUser.email,
    phone: '9876543210',
    createdBy: ownerA._id,
  });
  createdGuardianIds.push(guardian._id);

  await OrganizationMembership.create({
    organizationId: organizationA._id,
    userId: parentUser._id,
    role: 'parent',
    branchIds: [branchA._id],
    guardianIds: [guardian._id],
    accessAllBranches: false,
    status: 'active',
  });

  const childA = await makeChild({
    organizationId: organizationA._id, branchId: branchA._id,
    createdBy: ownerA._id, name: 'AliceA', admission: 'A',
  });
  const childA2 = await makeChild({
    organizationId: organizationA._id, branchId: branchA._id,
    createdBy: ownerA._id, name: 'NotLinked', admission: 'A2',
  });
  const childAOtherBranch = await makeChild({
    organizationId: organizationA._id, branchId: branchA2._id,
    createdBy: ownerA._id, name: 'OtherBranch', admission: 'AB',
  });
  const childB = await makeChild({
    organizationId: organizationB._id, branchId: branchB._id,
    createdBy: ownerB._id, name: 'SecretSchoolB', admission: 'B',
  });

  await ChildGuardian.create({
    organizationId: organizationA._id,
    branchId: branchA._id,
    childId: childA._id,
    guardianId: guardian._id,
    relationship: 'mother',
    isPrimaryContact: true,
    isBillingContact: true,
    createdBy: ownerA._id,
  });

  const invoiceA = await makeInvoice({
    organizationId: organizationA._id, branchId: branchA._id,
    childId: childA._id, createdBy: ownerA._id, invoiceNumber: 'INV-A',
  });
  const invoiceA2 = await makeInvoice({
    organizationId: organizationA._id, branchId: branchA._id,
    childId: childA2._id, createdBy: ownerA._id, invoiceNumber: 'INV-A2',
  });
  const invoiceB = await makeInvoice({
    organizationId: organizationB._id, branchId: branchB._id,
    childId: childB._id, createdBy: ownerB._id, invoiceNumber: 'INV-B',
  });

  seeded = {
    organizationA, organizationB, branchA, branchA2, branchB,
    ownerA, ownerB, branchStaff, parentUser, childA, childA2,
    childAOtherBranch, childB, invoiceA, invoiceA2, invoiceB,
  };

  await t.test('a tenant list and search never return another organization’s child', async () => {
    const list = await api('/api/saas/operations/children?q=SecretSchoolB', {
      token: tokenFor(ownerA), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(list.status, 200);
    assert.equal(list.data.total, 0);
    assert.deepEqual(list.data.children, []);

    const crossTenantRecord = await api('/api/saas/operations/children/' + childB._id, {
      token: tokenFor(ownerA), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(crossTenantRecord.status, 404);

    const feeList = await api('/api/saas/operations/fees/invoices', {
      token: tokenFor(ownerA), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(feeList.status, 200);
    const ids = feeList.data.invoices.map((invoice) => invoice.id);
    assert.ok(ids.includes(String(invoiceA._id)));
    assert.ok(ids.includes(String(invoiceA2._id)));
    assert.ok(!ids.includes(String(invoiceB._id)));
  });

  await t.test('branch-limited staff cannot cross their assigned branch boundary', async () => {
    const request = await api('/api/saas/operations/children', {
      token: tokenFor(branchStaff), organizationId: organizationA._id, branchId: branchA2._id,
    });
    assert.equal(request.status, 403);

    const ownBranch = await api('/api/saas/operations/children', {
      token: tokenFor(branchStaff), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(ownBranch.status, 200);
    assert.ok(ownBranch.data.children.some((child) => child.id === String(childA._id)));
    assert.ok(!ownBranch.data.children.some((child) => child.id === String(childAOtherBranch._id)));
  });

  await t.test('the parent portal returns only explicitly linked children and billable invoices', async () => {
    const childList = await api('/api/saas/parent/children', {
      token: tokenFor(parentUser), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(childList.status, 200);
    assert.deepEqual(childList.data.children.map((child) => child.id), [String(childA._id)]);

    const otherChild = await api('/api/saas/parent/children/' + childA2._id, {
      token: tokenFor(parentUser), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(otherChild.status, 404);

    const fees = await api('/api/saas/parent/fees', {
      token: tokenFor(parentUser), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(fees.status, 200);
    assert.deepEqual(fees.data.invoices.map((invoice) => invoice.id), [String(invoiceA._id)]);
  });

  await t.test('legacy unscoped APIs fail closed for accounts with tenant membership', async () => {
    const response = await api('/api/students', {
      token: tokenFor(ownerA), organizationId: organizationA._id, branchId: branchA._id,
    });
    assert.equal(response.status, 403);
    assert.equal(response.data.code, 'TENANT_MODULE_NOT_MIGRATED');
  });

  await t.test('parallel payments cannot collect more than the invoice total', async () => {
    const headers = {
      token: tokenFor(ownerA),
      organizationId: organizationA._id,
      branchId: branchA._id,
      method: 'POST',
      body: { amount: '60.00', method: 'cash', reference: 'integration-test' },
    };
    const results = await Promise.all([
      api('/api/saas/operations/fees/invoices/' + invoiceA._id + '/transactions', headers),
      api('/api/saas/operations/fees/invoices/' + invoiceA._id + '/transactions', headers),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    const ledger = await FeeTransaction.find({
      organizationId: organizationA._id,
      branchId: branchA._id,
      invoiceId: invoiceA._id,
    }).lean();
    assert.equal(ledger.length, 1);
    assert.equal(ledger.reduce((sum, transaction) => sum + transaction.amountPaise, 0), 6000);
  });
});
