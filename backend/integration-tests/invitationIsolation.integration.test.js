'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const { hashInvitationToken } = require('../utils/invitationTokens');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('invitation flow enforces tenant and branch scope and one-time acceptance', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';
  process.env.FRONTEND_ORIGIN = 'http://localhost:5173';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.EMAIL_USER;
  delete process.env.EMAIL_PASS;

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const OrganizationInvitation = require('../models/OrganizationInvitation');
  const TenantClass = require('../models/TenantClass');
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const createdUserIds = [];
  const createdOrganizationIds = [];
  const createdBranchIds = [];
  const createdInviteeEmails = [];

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  async function api(path, { token, organizationId, branchId, method = 'GET', body } = {}) {
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

  async function makeUser(label) {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'integration-test-password-' + tag,
      role: 'admin',
    });
    createdUserIds.push(user._id);
    return user;
  }

  async function cleanUp() {
    const organizationFilter = { organizationId: { $in: createdOrganizationIds } };
    await Promise.allSettled([
      OrganizationInvitation.deleteMany(organizationFilter),
      OrganizationMembership.deleteMany(organizationFilter),
      TenantClass.deleteMany(organizationFilter),
      AuditEvent.deleteMany(organizationFilter),
      Branch.deleteMany({ _id: { $in: createdBranchIds } }),
      Organization.deleteMany({ _id: { $in: createdOrganizationIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
      User.deleteMany({ email: { $in: createdInviteeEmails } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanUp);

  const ownerA = await makeUser('inv-owner-a');
  const ownerB = await makeUser('inv-owner-b');
  const branchAdminA = await makeUser('inv-branch-admin');

  const organizationA = await Organization.create({
    name: 'Invite School A ' + tag,
    slug: 'invite-school-a-' + tag,
    createdBy: ownerA._id,
  });
  const organizationB = await Organization.create({
    name: 'Invite School B ' + tag,
    slug: 'invite-school-b-' + tag,
    createdBy: ownerB._id,
  });
  createdOrganizationIds.push(organizationA._id, organizationB._id);

  const branchA = await Branch.create({
    organizationId: organizationA._id,
    name: 'Main Branch',
    code: 'MA-' + tag.slice(0, 5).toUpperCase(),
    createdBy: ownerA._id,
  });
  const branchA2 = await Branch.create({
    organizationId: organizationA._id,
    name: 'Other Branch',
    code: 'OT-' + tag.slice(0, 5).toUpperCase(),
    createdBy: ownerA._id,
  });
  const branchB = await Branch.create({
    organizationId: organizationB._id,
    name: 'Other School Branch',
    code: 'SB-' + tag.slice(0, 5).toUpperCase(),
    createdBy: ownerB._id,
  });
  createdBranchIds.push(branchA._id, branchA2._id, branchB._id);

  await OrganizationMembership.create([
    {
      organizationId: organizationA._id, userId: ownerA._id, role: 'organization_owner',
      branchIds: [branchA._id, branchA2._id], accessAllBranches: true, status: 'active',
    },
    {
      organizationId: organizationB._id, userId: ownerB._id, role: 'organization_owner',
      branchIds: [branchB._id], accessAllBranches: true, status: 'active',
    },
    {
      organizationId: organizationA._id, userId: branchAdminA._id, role: 'branch_admin',
      branchIds: [branchA._id], accessAllBranches: false, status: 'active',
    },
  ]);

  await TenantClass.create([
    { organizationId: organizationA._id, branchId: branchA._id, name: 'ENG JR.', code: 'ENG-JR', createdBy: ownerA._id },
    { organizationId: organizationA._id, branchId: branchA2._id, name: 'ENG JR.', code: 'ENG-JR', createdBy: ownerA._id },
    { organizationId: organizationB._id, branchId: branchB._id, name: 'ENG JR.', code: 'ENG-JR', createdBy: ownerB._id },
  ]);

  const ownerTokenA = tokenFor(ownerA);
  const ownerTokenB = tokenFor(ownerB);
  const branchAdminToken = tokenFor(branchAdminA);
  const emailA = 'teacher-a-' + tag + '@example.test';
  const emailB = 'teacher-b-' + tag + '@example.test';
  const emailRevoked = 'teacher-revoked-' + tag + '@example.test';
  createdInviteeEmails.push(emailA, emailB, emailRevoked);

  const inviteTeacher = (token, organizationId, branchId, email, label = 'Integration Teacher') =>
    api('/api/saas/invitations', {
      token,
      organizationId,
      method: 'POST',
      body: { email, fullName: label + ' ' + tag, role: 'teacher', branchIds: [String(branchId)], classNames: ['ENG JR.'] },
    });

  function tokenFromInvitationUrl(value) {
    const url = new URL(value);
    assert.equal(url.search, '', 'invitation secret must not be in a query string');
    const token = new URLSearchParams(url.hash.slice(1)).get('token');
    assert.ok(token && token.length >= 32);
    return token;
  }

  const inviteA = await inviteTeacher(ownerTokenA, organizationA._id, branchA._id, emailA);
  assert.equal(inviteA.status, 201);
  assert.ok(inviteA.data.invitationUrl, 'SMTP-disabled test environment should return a manual-delivery URL');
  const tokenA = tokenFromInvitationUrl(inviteA.data.invitationUrl);

  const inviteB = await inviteTeacher(ownerTokenB, organizationB._id, branchB._id, emailB);
  assert.equal(inviteB.status, 201);
  assert.ok(inviteB.data.invitationUrl);

  await t.test('organization-scoped listing never discloses other tenants or token hashes', async () => {
    const listA = await api('/api/saas/invitations', {
      token: ownerTokenA, organizationId: organizationA._id,
    });
    assert.equal(listA.status, 200);
    assert.ok(listA.data.some((item) => item.id === inviteA.data.invitation.id));
    assert.ok(!listA.data.some((item) => item.id === inviteB.data.invitation.id));
    assert.ok(listA.data.every((item) => !Object.hasOwn(item, 'tokenHash')));
    assert.ok(listA.data.every((item) => !Object.hasOwn(item, 'invitationUrl')));

    const crossTenant = await api('/api/saas/invitations', {
      token: ownerTokenA, organizationId: organizationB._id,
    });
    assert.equal(crossTenant.status, 403);

    const branchList = await api('/api/saas/invitations', {
      token: branchAdminToken, organizationId: organizationA._id,
    });
    assert.equal(branchList.status, 200);
    assert.ok(branchList.data.some((item) => item.id === inviteA.data.invitation.id));
    assert.ok(!branchList.data.some((item) => item.id === inviteB.data.invitation.id));
  });

  await t.test('branch admins cannot create invitations for an unassigned branch', async () => {
    const denied = await inviteTeacher(
      branchAdminToken, organizationA._id, branchA2._id,
      'branch-escape-' + tag + '@example.test', 'Unauthorized Branch Teacher',
    );
    assert.equal(denied.status, 403);
    assert.equal(denied.data.invitationUrl, undefined);
  });

  await t.test('teacher invitations require active configured classes', async () => {
    const denied = await api('/api/saas/invitations', {
      token: ownerTokenA,
      organizationId: organizationA._id,
      method: 'POST',
      body: {
        email: 'unconfigured-class-' + tag + '@example.test',
        fullName: 'Invalid Class Teacher',
        role: 'teacher',
        branchIds: [String(branchA._id)],
        classNames: ['NOT CONFIGURED'],
      },
    });
    assert.equal(denied.status, 400);
    assert.equal(denied.data.invitationUrl, undefined);
  });

  await t.test('a one-time invitation can be inspected and accepted once', async () => {
    const inspection = await api('/api/invitations/inspect', {
      method: 'POST', body: { token: tokenA },
    });
    assert.equal(inspection.status, 200);
    assert.equal(inspection.data.invitation.email, emailA);
    assert.ok(!JSON.stringify(inspection.data).includes(tokenA));

    const acceptance = await api('/api/invitations/accept', {
      method: 'POST', body: { token: tokenA, password: 'new-account-secure-password-2026' },
    });
    assert.equal(acceptance.status, 201);
    assert.equal(acceptance.data.user.email, emailA);

    const saved = await OrganizationInvitation.findById(inviteA.data.invitation.id).select('+tokenHash').lean();
    assert.equal(saved.status, 'accepted');
    assert.equal(saved.tokenHash, hashInvitationToken(tokenA));
    assert.notEqual(saved.tokenHash, tokenA);

    const membership = await OrganizationMembership.findOne({
      organizationId: organizationA._id,
      userId: acceptance.data.user.id,
    }).lean();
    assert.ok(membership);
    assert.equal(membership.role, 'teacher');
    assert.deepEqual(membership.branchIds.map(String), [String(branchA._id)]);
    assert.deepEqual(membership.classNames, ['ENG JR.']);

    const reused = await api('/api/invitations/accept', {
      method: 'POST', body: { token: tokenA, password: 'new-account-secure-password-2026' },
    });
    assert.equal(reused.status, 410);
  });

  await t.test('revoking an invitation makes its token unusable', async () => {
    const created = await inviteTeacher(ownerTokenA, organizationA._id, branchA2._id, emailRevoked);
    assert.equal(created.status, 201);
    const secret = tokenFromInvitationUrl(created.data.invitationUrl);

    const revoked = await api('/api/saas/invitations/' + created.data.invitation.id + '/revoke', {
      token: ownerTokenA,
      organizationId: organizationA._id,
      method: 'PATCH',
    });
    assert.equal(revoked.status, 200);

    const inspect = await api('/api/invitations/inspect', { method: 'POST', body: { token: secret } });
    assert.equal(inspect.status, 410);
  });
});
