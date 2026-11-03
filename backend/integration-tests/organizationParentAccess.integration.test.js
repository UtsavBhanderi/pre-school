'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

const configuredUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('single-school parent self-service links the correct tenant guardian and denies invitations', {
  skip: !configuredUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  const parsedUri = new URL(configuredUri);
  parsedUri.pathname = '/preschool_parent_org_' + crypto.randomBytes(6).toString('hex');
  const isolatedUri = parsedUri.toString();

  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = isolatedUri;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_URL = 'https://family-school.example.test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const Student = require('../models/Student');
  const Guardian = require('../models/Guardian');
  const ChildGuardian = require('../models/ChildGuardian');
  const OrganizationMembership = require('../models/OrganizationMembership');

  await mongoose.connect(isolatedUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(5).toString('hex');
  const createdUserIds = [];
  const createdOrganizationIds = [];
  const createdBranchIds = [];
  const createdStudentIds = [];
  const createdGuardianIds = [];
  const createdMembershipIds = [];

  const tokenFor = (user) => require('jsonwebtoken').sign(
    { user: { id: String(user._id), role: user.role, authVersion: Number.isInteger(user.authVersion) ? user.authVersion : 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(pathname, { token, organizationId, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + pathname, {
      method,
      headers: {
        ...(token ? { 'x-auth-token': token } : {}),
        ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  t.after(async () => {
    await Promise.allSettled([
      OrganizationMembership.deleteMany({ organizationId: { $in: createdOrganizationIds } }),
      ChildGuardian.deleteMany({ organizationId: { $in: createdOrganizationIds } }),
      Guardian.deleteMany({ _id: { $in: createdGuardianIds } }),
      Student.deleteMany({ _id: { $in: createdStudentIds } }),
      Branch.deleteMany({ _id: { $in: createdBranchIds } }),
      Organization.deleteMany({ _id: { $in: createdOrganizationIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
      mongoose.connection.dropDatabase(),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  const owner = await User.create({
    username: 'School Owner ' + tag,
    email: 'owner-' + tag + '@example.test',
    password: 'owner-test-password-123',
    role: 'admin',
  });
  createdUserIds.push(owner._id);

  const organization = await Organization.create({
    name: 'Single Family School ' + tag,
    slug: 'single-family-' + tag,
    createdBy: owner._id,
  });
  createdOrganizationIds.push(organization._id);

  const branch = await Branch.create({
    organizationId: organization._id,
    name: 'Main Branch',
    code: 'MAIN-' + tag.slice(0, 5).toUpperCase(),
    createdBy: owner._id,
  });
  createdBranchIds.push(branch._id);

  const ownerMembership = await OrganizationMembership.create({
    organizationId: organization._id,
    userId: owner._id,
    role: 'organization_owner',
    branchIds: [branch._id],
    accessAllBranches: true,
    status: 'active',
  });
  createdMembershipIds.push(ownerMembership._id);

  const guardianEmail = 'tenant-family-' + tag + '@example.test';
  const phone = '9876543210';
  const student = await Student.create({
    organizationId: organization._id,
    branchId: branch._id,
    createdBy: owner._id,
    stuNo: 'TENANT-' + tag,
    firstName: 'Ira',
    middleName: 'Family',
    lastName: 'Child',
    standard: 'Nursery',
    batchYear: '2026-2027',
    parentEmail: guardianEmail,
    FatherName: 'Tenant Parent',
    FatherMobileNumber: 9876543210,
  });
  createdStudentIds.push(student._id);

  const guardian = await Guardian.create({
    organizationId: organization._id,
    fullName: 'Tenant Parent',
    email: guardianEmail,
    phone,
    createdBy: owner._id,
  });
  createdGuardianIds.push(guardian._id);

  await ChildGuardian.create({
    organizationId: organization._id,
    branchId: branch._id,
    childId: student._id,
    guardianId: guardian._id,
    relationship: 'father',
    isPrimaryContact: true,
    isBillingContact: true,
    authorizedPickup: true,
    createdBy: owner._id,
  });

  await t.test('wrong registered mobile number is rejected without creating a user', async () => {
    const denied = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: organization.slug,
        identifier: student.stuNo,
        phone: '9123456789',
        fullName: 'Tenant Parent',
        email: guardianEmail,
        password: 'StrongTenantParentPassword123',
      },
    });
    assert.equal(denied.status, 404);
    assert.equal(await User.countDocuments({ email: guardianEmail }), 0);
  });

  let activated;
  await t.test('GR number plus guardian mobile creates an organization parent membership', async () => {
    activated = await api('/api/parent-access/activate', {
      method: 'POST',
      body: {
        schoolSlug: organization.slug,
        identifier: student.stuNo,
        phone: '+91 98765 43210',
        fullName: 'Tenant Parent',
        email: guardianEmail,
        password: 'StrongTenantParentPassword123',
      },
    });
    assert.equal(activated.status, 201);
    assert.ok(activated.data.token);
    createdUserIds.push(new mongoose.Types.ObjectId(activated.data.user.id));

    const membership = await OrganizationMembership.findOne({
      organizationId: organization._id,
      userId: activated.data.user.id,
      role: 'parent',
      status: 'active',
    }).lean();
    assert.ok(membership);
    assert.deepEqual(membership.guardianIds.map(String), [String(guardian._id)]);
    assert.deepEqual(membership.branchIds.map(String), [String(branch._id)]);
  });

  await t.test('parent normal sign-in keeps the tenant scope and can read only linked children', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: guardianEmail, password: 'StrongTenantParentPassword123' },
    });
    assert.equal(login.status, 200);

    const me = await api('/api/auth/me', { token: login.data.token });
    assert.equal(me.status, 200);
    assert.equal(me.data.user.memberships.length, 1);
    assert.equal(me.data.user.memberships[0].role, 'parent');

    const children = await api('/api/saas/parent/children', {
      token: login.data.token,
      organizationId: organization._id,
    });
    assert.equal(children.status, 200);
    assert.equal(children.data.total, 1);
    assert.equal(children.data.children[0].admissionNumber, student.stuNo);
  });

  await t.test('school staff can no longer create parent invitations', async () => {
    const denied = await api('/api/saas/invitations', {
      token: tokenFor(owner),
      organizationId: organization._id,
      method: 'POST',
      body: {
        email: 'second-parent-' + tag + '@example.test',
        fullName: 'Second Parent',
        role: 'parent',
        guardianIds: [String(guardian._id)],
      },
    });
    assert.equal(denied.status, 410);
    assert.equal(denied.data.code, 'PARENT_SELF_SERVICE');
  });
});
