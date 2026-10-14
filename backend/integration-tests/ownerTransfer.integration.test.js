'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('owner transfer verifies the owner, transfers role transactionally, audits the change and revokes old sessions', {
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
  let branchId = null;
  const membershipIds = [];
  const ownerPassword = 'owner-transfer-password-' + tag;
  const successorPassword = 'head-office-password-' + tag;

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

  const owner = await makeUser('old-owner', ownerPassword, 'admin');
  const successor = await makeUser('new-owner', successorPassword, 'teacher');
  const regularStaff = await makeUser('regular-staff', 'regular-staff-password-' + tag, 'teacher');

  const organization = await Organization.create({
    name: 'Transfer Test Preschool ' + tag,
    slug: 'transfer-' + tag,
    timezone: 'Asia/Kolkata',
    locale: 'en-IN',
    currency: 'INR',
    createdBy: owner._id,
    status: 'active',
    subscription: { plan: 'growth', status: 'active' },
  });
  organizationId = organization._id;

  const branch = await Branch.create({
    organizationId,
    name: 'Main Branch',
    code: 'MAIN-' + tag.slice(0, 5).toUpperCase(),
    timezone: 'Asia/Kolkata',
    status: 'active',
    createdBy: owner._id,
  });
  branchId = branch._id;

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
      branchIds: [branchId],
      accessAllBranches: false,
      status: 'active',
    },
    {
      organizationId,
      userId: regularStaff._id,
      role: 'teacher',
      branchIds: [branchId],
      classNames: ['Play Group'],
      accessAllBranches: false,
      status: 'active',
    },
  ]);
  membershipIds.push(ownerMembership._id, successorMembership._id, staffMembership._id);

  const ownerToken = tokenFor(owner);
  const successorOldToken = tokenFor(successor);
  const transferBody = {
    targetMembershipId: String(successorMembership._id),
    confirmOrganizationSlug: organization.slug,
    confirmPassword: ownerPassword,
    reason: 'The current owner is handing over school operations to the approved successor.',
  };

  await t.test('non-owners cannot transfer ownership', async () => {
    const denied = await api('/api/saas/ownership/transfer-owner', {
      token: successorOldToken,
      organizationId,
      method: 'POST',
      body: transferBody,
    });
    assert.equal(denied.status, 403);
    assert.equal((await OrganizationMembership.findById(ownerMembership._id)).role, 'organization_owner');
    assert.equal((await OrganizationMembership.findById(successorMembership._id)).role, 'head_office_admin');
  });

  await t.test('wrong password is rejected without changing either role or session version', async () => {
    const denied = await api('/api/saas/ownership/transfer-owner', {
      token: ownerToken,
      organizationId,
      method: 'POST',
      body: { ...transferBody, confirmPassword: 'incorrect-password' },
    });
    assert.equal(denied.status, 401);
    assert.equal((await OrganizationMembership.findById(ownerMembership._id)).role, 'organization_owner');
    assert.equal((await OrganizationMembership.findById(successorMembership._id)).role, 'head_office_admin');
    assert.equal((await User.findById(owner._id)).authVersion, 0);
    assert.equal((await User.findById(successor._id)).authVersion, 0);
  });

  await t.test('organization slug confirmation is required', async () => {
    const denied = await api('/api/saas/ownership/transfer-owner', {
      token: ownerToken,
      organizationId,
      method: 'POST',
      body: { ...transferBody, confirmOrganizationSlug: 'different-school' },
    });
    assert.equal(denied.status, 400);
    assert.equal((await OrganizationMembership.findById(ownerMembership._id)).role, 'organization_owner');
    assert.equal(await AuditEvent.countDocuments({ organizationId, action: 'organization.owner_transferred' }), 0);
  });

  await t.test('successful transfer changes roles, grants the successor all branches, audits and invalidates both old tokens', async () => {
    const response = await api('/api/saas/ownership/transfer-owner', {
      token: ownerToken,
      organizationId,
      method: 'POST',
      body: transferBody,
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.requiresSignIn, true);

    const savedOwnerMembership = await OrganizationMembership.findById(ownerMembership._id).lean();
    const savedSuccessorMembership = await OrganizationMembership.findById(successorMembership._id).lean();
    assert.equal(savedOwnerMembership.role, 'head_office_admin');
    assert.equal(savedOwnerMembership.accessAllBranches, true);
    assert.deepEqual(savedOwnerMembership.branchIds, []);
    assert.equal(savedSuccessorMembership.role, 'organization_owner');
    assert.equal(savedSuccessorMembership.accessAllBranches, true);
    assert.deepEqual(savedSuccessorMembership.branchIds, []);

    const savedOwner = await User.findById(owner._id).lean();
    const savedSuccessor = await User.findById(successor._id).lean();
    assert.equal(savedOwner.authVersion, 1);
    assert.equal(savedSuccessor.authVersion, 1);

    assert.equal((await api('/api/auth/me', { token: ownerToken })).status, 401);
    assert.equal((await api('/api/auth/me', { token: successorOldToken })).status, 401);

    const audit = await AuditEvent.findOne({ organizationId, action: 'organization.owner_transferred' }).lean();
    assert.ok(audit);
    assert.equal(String(audit.actorUserId), String(owner._id));
    assert.match(audit.summary, /old-owner/);
    assert.match(audit.summary, /new-owner/);
    assert.match(audit.reason, /handing over school operations/i);
    assert.ok(audit.changedFields.includes('previousOwnerSessionsRevoked'));
    assert.ok(audit.changedFields.includes('newOwnerSessionsRevoked'));

    const login = await api('/api/auth/login', {
      method: 'POST',
      body: { email: successor.email, password: successorPassword },
    });
    assert.equal(login.status, 200);
    const profile = await api('/api/auth/me', { token: login.data.token });
    assert.equal(profile.status, 200);
    assert.equal(
      profile.data.user.memberships.find((item) => item.organization.id === String(organizationId)).role,
      'organization_owner',
    );
  });
});
