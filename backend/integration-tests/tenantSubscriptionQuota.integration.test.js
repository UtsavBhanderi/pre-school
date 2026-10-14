'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('subscription trial state, staff/student quotas and concurrent branch creation are enforced by the API', {
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
  const OrganizationInvitation = require('../models/OrganizationInvitation');
  const Student = require('../models/Student');
  const TenantClass = require('../models/TenantClass');
  const Guardian = require('../models/Guardian');
  const ChildGuardian = require('../models/ChildGuardian');
  const TenantSequence = require('../models/TenantSequence');
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const userIds = [];
  const organizationIds = [];
  const branchIds = [];

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, { token, organizationId, branchId, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: {
        ...(token ? { 'x-auth-token': token } : {}),
        ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}),
        ...(branchId ? { 'x-branch-id': String(branchId) } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const responseText = await response.text();
    let data = null;
    try { data = responseText ? JSON.parse(responseText) : null; } catch { data = responseText; }
    return { status: response.status, data };
  }

  async function makeUser(label, role = 'teacher') {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'quota-integration-password-' + tag,
      role,
    });
    userIds.push(user._id);
    return user;
  }

  async function makeOrganization({ label, plan, status, expiresAt, branchCount = 1 }) {
    const owner = await makeUser(label + '-owner', 'admin');
    const organization = await Organization.create({
      name: 'Quota Test ' + label + ' ' + tag,
      slug: 'quota-' + label.toLowerCase() + '-' + tag,
      timezone: 'Asia/Kolkata',
      locale: 'en-IN',
      currency: 'INR',
      createdBy: owner._id,
      status: 'active',
      subscription: {
        plan,
        status,
        ...(expiresAt ? { trialEndsAt: expiresAt } : {}),
      },
    });
    organizationIds.push(organization._id);

    const branches = [];
    for (let index = 0; index < branchCount; index += 1) {
      const branch = await Branch.create({
        organizationId: organization._id,
        name: index === 0 ? 'Main Branch' : 'Branch ' + (index + 1),
        code: 'B' + index + tag.slice(0, 5).toUpperCase(),
        timezone: 'Asia/Kolkata',
        createdBy: owner._id,
        status: 'active',
      });
      branches.push(branch);
      branchIds.push(branch._id);
    }

    await OrganizationMembership.create({
      organizationId: organization._id,
      userId: owner._id,
      role: 'organization_owner',
      branchIds: branches.map((branch) => branch._id),
      accessAllBranches: true,
      status: 'active',
    });

    return { owner, organization, branches };
  }

  async function cleanup() {
    const organizationFilter = { organizationId: { $in: organizationIds } };
    await Promise.allSettled([
      OrganizationInvitation.deleteMany(organizationFilter),
      AuditEvent.deleteMany(organizationFilter),
      ChildGuardian.deleteMany(organizationFilter),
      Guardian.deleteMany(organizationFilter),
      Student.deleteMany(organizationFilter),
      TenantClass.deleteMany(organizationFilter),
      TenantSequence.deleteMany(organizationFilter),
      OrganizationMembership.deleteMany(organizationFilter),
      Branch.deleteMany({ _id: { $in: branchIds } }),
      Organization.deleteMany({ _id: { $in: organizationIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanup);

  await t.test('expired trial remains readable but rejects branch mutations', async () => {
    const { owner, organization, branches } = await makeOrganization({
      label: 'expired',
      plan: 'trial',
      status: 'trial',
      expiresAt: new Date(Date.now() - 60 * 1000),
    });
    const token = tokenFor(owner);

    const subscription = await api('/api/saas/subscription', {
      token, organizationId: organization._id,
    });
    assert.equal(subscription.status, 200);
    assert.equal(subscription.data.status, 'trial_expired');
    assert.equal(subscription.data.canWrite, false);
    assert.equal(subscription.data.usage.branches, 1);

    const mutation = await api('/api/saas/branches', {
      token,
      organizationId: organization._id,
      method: 'POST',
      body: { name: 'Blocked Branch', code: 'BLOCKED-' + tag.slice(0, 4).toUpperCase(), timezone: 'Asia/Kolkata' },
    });
    assert.equal(mutation.status, 402);
    assert.equal(mutation.data.code, 'SUBSCRIPTION_READ_ONLY');
    assert.equal(await Branch.countDocuments({ organizationId: organization._id }), branches.length);
  });

  await t.test('student cap blocks child admission before any family data is written', async () => {
    const { owner, organization, branches } = await makeOrganization({
      label: 'children',
      plan: 'trial',
      status: 'trial',
      expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    });
    const branch = branches[0];
    await TenantClass.create({
      organizationId: organization._id,
      branchId: branch._id,
      name: 'Play Group',
      code: 'PG-' + tag.slice(0, 5).toUpperCase(),
      capacity: 500,
      createdBy: owner._id,
    });

    const students = Array.from({ length: 100 }, (_, index) => ({
      firstName: 'Existing' + index,
      middleName: 'Capacity',
      lastName: 'Child',
      standard: 'Play Group',
      batchYear: '2026-2027',
      stuNo: 'QUOTA-' + tag + '-' + index,
      organizationId: organization._id,
      branchId: branch._id,
      createdBy: owner._id,
    }));
    await Student.insertMany(students);

    const token = tokenFor(owner);
    const admission = await api('/api/saas/operations/children', {
      token, organizationId: organization._id, branchId: branch._id, method: 'POST',
      body: {
        firstName: 'Blocked',
        lastName: 'Admission',
        className: 'Play Group',
        academicYear: '2026-2027',
        guardians: [{
          name: 'Parent Example',
          phone: '9876543210',
          relationship: 'mother',
          isPrimaryContact: true,
          isBillingContact: true,
        }],
      },
    });

    assert.equal(admission.status, 409);
    assert.equal(admission.data.code, 'PLAN_LIMIT_REACHED');
    assert.equal(admission.data.limit, 100);
    assert.equal(await Student.countDocuments({ organizationId: organization._id }), 100);
    assert.equal(await Guardian.countDocuments({ organizationId: organization._id }), 0);
    assert.equal(await ChildGuardian.countDocuments({ organizationId: organization._id }), 0);
  });

  await t.test('staff cap counts active staff and rejects a new invitation', async () => {
    const { owner, organization, branches } = await makeOrganization({
      label: 'staff',
      plan: 'trial',
      status: 'active',
    });
    for (let index = 0; index < 9; index += 1) {
      const staff = await makeUser('staff-' + index, 'teacher');
      await OrganizationMembership.create({
        organizationId: organization._id,
        userId: staff._id,
        role: 'teacher',
        branchIds: [branches[0]._id],
        accessAllBranches: false,
        status: 'active',
      });
    }

    const invitation = await api('/api/saas/invitations', {
      token: tokenFor(owner),
      organizationId: organization._id,
      method: 'POST',
      body: {
        fullName: 'New Staff Member',
        email: 'new-staff-' + tag + '@example.test',
        role: 'admissions',
        branchIds: [String(branches[0]._id)],
      },
    });

    assert.equal(invitation.status, 409);
    assert.equal(invitation.data.code, 'PLAN_LIMIT_REACHED');
    assert.equal(await OrganizationInvitation.countDocuments({ organizationId: organization._id }), 0);
  });

  await t.test('concurrent branch creations cannot exceed the organization cap', async () => {
    const { owner, organization, branches } = await makeOrganization({
      label: 'concurrent',
      plan: 'growth',
      status: 'active',
      branchCount: 4,
    });
    const token = tokenFor(owner);
    const createBranch = (suffix) => api('/api/saas/branches', {
      token,
      organizationId: organization._id,
      method: 'POST',
      body: {
        name: 'Concurrent ' + suffix,
        code: 'N' + suffix + '-' + tag.slice(0, 5).toUpperCase(),
        timezone: 'Asia/Kolkata',
      },
    });

    const results = await Promise.all([createBranch('A'), createBranch('B')]);
    assert.deepEqual(results.map((result) => result.status).sort((a, b) => a - b), [201, 409]);
    const denied = results.find((result) => result.status === 409);
    assert.equal(denied.data.code, 'PLAN_LIMIT_REACHED');
    assert.equal(await Branch.countDocuments({ organizationId: organization._id, status: { $ne: 'closed' } }), 5);
  });
});
