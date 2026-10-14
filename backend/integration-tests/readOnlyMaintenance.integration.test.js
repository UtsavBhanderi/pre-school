'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('read-only subscriptions permit only verified ownership handover and suspension-only access reduction', {
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
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const userIds = [];
  let organizationId = null;
  const ownerPassword = 'read-only-owner-password-' + tag;
  const successorPassword = 'read-only-successor-password-' + tag;
  const staffPassword = 'read-only-staff-password-' + tag;

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role, authVersion: user.authVersion || 0 } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, { token, organizationId: requestedOrganizationId, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: {
        ...(token ? { 'x-auth-token': token } : {}),
        ...(requestedOrganizationId ? { 'x-organization-id': String(requestedOrganizationId) } : {}),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function makeUser(label, password, role) {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password,
      role,
    });
    userIds.push(user._id);
    return user;
  }

  async function cleanup() {
    if (organizationId) {
      await Promise.allSettled([
        AuditEvent.deleteMany({ organizationId }),
        OrganizationMembership.deleteMany({ organizationId }),
        Branch.deleteMany({ organizationId }),
        Organization.deleteOne({ _id: organizationId }),
      ]);
    }
    await User.deleteMany({ _id: { $in: userIds } }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanup);

  const owner = await makeUser('readonly-owner', ownerPassword, 'admin');
  const successor = await makeUser('readonly-successor', successorPassword, 'teacher');
  const staff = await makeUser('readonly-staff', staffPassword, 'teacher');

  const organization = await Organization.create({
    name: 'Read-only Maintenance Test ' + tag,
    slug: 'readonly-' + tag,
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    currency: 'INR',
    createdBy: owner._id,
    status: 'active',
    subscription: {
      plan: 'trial',
      status: 'trial',
      trialEndsAt: new Date(Date.now() - 60 * 1000),
    },
  });
  organizationId = organization._id;

  const branch = await Branch.create({
    organizationId,
    name: 'Main Branch',
    code: 'RM-' + tag.slice(0, 5).toUpperCase(),
    timezone: 'Asia/Kolkata',
    status: 'active',
    createdBy: owner._id,
  });

  const [ownerMembership, successorMembership, staffMembership] = await OrganizationMembership.create([
    {
      organizationId,
      userId: owner._id,
      role: 'organization_owner',
      branchIds: [],
      accessAllBranches: true,
      status: 'active',
    },
    {
      organizationId,
      userId: successor._id,
      role: 'head_office_admin',
      branchIds: [branch._id],
      accessAllBranches: false,
      status: 'active',
    },
    {
      organizationId,
      userId: staff._id,
      role: 'teacher',
      branchIds: [branch._id],
      classNames: ['Class that was later closed'],
      accessAllBranches: false,
      status: 'active',
    },
  ]);

  const ownerToken = tokenFor(owner);
  const staffToken = tokenFor(staff);

  await t.test('ordinary school writes remain blocked after trial expiry', async () => {
    const response = await api('/api/saas/branches', {
      token: ownerToken,
      organizationId,
      method: 'POST',
      body: { name: 'Blocked Branch', code: 'BLOCK-' + tag.slice(0, 4).toUpperCase(), timezone: 'Asia/Kolkata' },
    });
    assert.equal(response.status, 402);
    assert.equal(response.data.code, 'SUBSCRIPTION_READ_ONLY');
    assert.equal(await Branch.countDocuments({ organizationId }), 1);
  });

  await t.test('the subscription exception cannot smuggle a role promotion inside a suspension request', async () => {
    const response = await api('/api/saas/members/' + staffMembership._id, {
      token: ownerToken,
      organizationId,
      method: 'PATCH',
      body: { status: 'suspended', role: 'head_office_admin', reason: 'Attempt to combine suspension and privilege change.' },
    });
    assert.equal(response.status, 402);
    assert.equal((await OrganizationMembership.findById(staffMembership._id)).status, 'active');
    assert.equal((await OrganizationMembership.findById(staffMembership._id)).role, 'teacher');
  });

  await t.test('suspension-only access reduction remains available and revokes the staff session', async () => {
    const response = await api('/api/saas/members/' + staffMembership._id, {
      token: ownerToken,
      organizationId,
      method: 'PATCH',
      body: { status: 'suspended', reason: 'Urgent safeguarding concern; suspend access immediately.' },
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.sessionsRevoked, true);
    assert.equal((await OrganizationMembership.findById(staffMembership._id)).status, 'suspended');
    assert.equal((await User.findById(staff._id)).authVersion, 1);
    assert.equal((await api('/api/auth/me', { token: staffToken })).status, 401);
    assert.equal(await AuditEvent.countDocuments({
      organizationId,
      action: 'membership.updated',
      resourceId: String(staffMembership._id),
      changedFields: 'userSessionsRevoked',
    }), 1);
  });

  await t.test('ownership can be transferred securely even if the expired trial is read-only', async () => {
    const transfer = await api('/api/saas/ownership/transfer-owner', {
      token: ownerToken,
      organizationId,
      method: 'POST',
      body: {
        targetMembershipId: String(successorMembership._id),
        confirmOrganizationSlug: organization.slug,
        confirmPassword: ownerPassword,
        reason: 'Owner handover is needed to keep school governance and access current.',
      },
    });
    assert.equal(transfer.status, 200);
    assert.equal((await OrganizationMembership.findById(ownerMembership._id)).role, 'head_office_admin');
    assert.equal((await OrganizationMembership.findById(successorMembership._id)).role, 'organization_owner');
    assert.equal((await User.findById(owner._id)).authVersion, 1);
    assert.equal((await User.findById(successor._id)).authVersion, 1);
    assert.ok(await AuditEvent.findOne({ organizationId, action: 'organization.owner_transferred' }));
  });
});
