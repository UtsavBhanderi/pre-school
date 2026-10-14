'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('team-access changes preserve owner, branch and suspension safeguards', {
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
  const createdMembershipIds = [];

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

  async function makeUser(label, legacyRole = 'teacher') {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'integration-test-password-' + tag,
      role: legacyRole,
    });
    createdUserIds.push(user._id);
    return user;
  }

  async function makeMembership({ organizationId, user, role, branchIds, accessAllBranches = false, classNames = [] }) {
    const membership = await OrganizationMembership.create({
      organizationId,
      userId: user._id,
      role,
      branchIds,
      classNames,
      accessAllBranches,
      status: 'active',
    });
    createdMembershipIds.push(membership._id);
    return membership;
  }

  async function cleanUp() {
    await Promise.allSettled([
      AuditEvent.deleteMany({ organizationId: { $in: createdOrganizationIds } }),
      OrganizationMembership.deleteMany({ _id: { $in: createdMembershipIds } }),
      OrganizationMembership.deleteMany({ organizationId: { $in: createdOrganizationIds } }),
      TenantClass.deleteMany({ organizationId: { $in: createdOrganizationIds } }),
      Branch.deleteMany({ _id: { $in: createdBranchIds } }),
      Organization.deleteMany({ _id: { $in: createdOrganizationIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanUp);

  const owner = await makeUser('owner', 'admin');
  const outsideOwner = await makeUser('outside-owner', 'admin');
  const headOffice = await makeUser('head-office', 'admin');
  const secondHeadOffice = await makeUser('second-head-office', 'admin');
  const branchAdmin = await makeUser('branch-admin', 'teacher');
  const staffA = await makeUser('staff-a', 'teacher');
  const staffA2 = await makeUser('staff-a2', 'teacher');
  const accountant = await makeUser('accountant', 'admin');

  const organization = await Organization.create({
    name: 'Membership Safety School ' + tag,
    slug: 'membership-safety-' + tag,
    createdBy: owner._id,
  });
  const otherOrganization = await Organization.create({
    name: 'Other Membership School ' + tag,
    slug: 'other-membership-' + tag,
    createdBy: outsideOwner._id,
  });
  createdOrganizationIds.push(organization._id, otherOrganization._id);

  const branch = await Branch.create({
    organizationId: organization._id, name: 'Assigned Branch',
    code: 'AS-' + tag.slice(0, 5).toUpperCase(), createdBy: owner._id,
  });
  const otherBranch = await Branch.create({
    organizationId: organization._id, name: 'Unassigned Branch',
    code: 'UN-' + tag.slice(0, 5).toUpperCase(), createdBy: owner._id,
  });
  const outsideBranch = await Branch.create({
    organizationId: otherOrganization._id, name: 'Outside Organization Branch',
    code: 'EX-' + tag.slice(0, 5).toUpperCase(), createdBy: outsideOwner._id,
  });
  createdBranchIds.push(branch._id, otherBranch._id, outsideBranch._id);

  const ownerMembership = await makeMembership({
    organizationId: organization._id, user: owner, role: 'organization_owner',
    branchIds: [branch._id, otherBranch._id], accessAllBranches: true,
  });
  const outsideOwnerMembership = await makeMembership({
    organizationId: otherOrganization._id, user: outsideOwner, role: 'organization_owner',
    branchIds: [outsideBranch._id], accessAllBranches: true,
  });
  const headOfficeMembership = await makeMembership({
    organizationId: organization._id, user: headOffice, role: 'head_office_admin',
    branchIds: [], accessAllBranches: true,
  });
  const secondHeadOfficeMembership = await makeMembership({
    organizationId: organization._id, user: secondHeadOffice, role: 'head_office_admin',
    branchIds: [], accessAllBranches: true,
  });
  const branchAdminMembership = await makeMembership({
    organizationId: organization._id, user: branchAdmin, role: 'branch_admin',
    branchIds: [branch._id], accessAllBranches: false,
  });
  const staffMembership = await makeMembership({
    organizationId: organization._id, user: staffA, role: 'teacher',
    branchIds: [branch._id], accessAllBranches: false, classNames: ['ENG JR.'],
  });
  const otherBranchStaffMembership = await makeMembership({
    organizationId: organization._id, user: staffA2, role: 'teacher',
    branchIds: [otherBranch._id], accessAllBranches: false, classNames: ['ENG JR.'],
  });
  const accountantMembership = await makeMembership({
    organizationId: organization._id, user: accountant, role: 'accountant',
    branchIds: [branch._id], accessAllBranches: false,
  });

  await TenantClass.create([
    { organizationId: organization._id, branchId: branch._id, name: 'ENG JR.', code: 'ENG-JR', createdBy: owner._id },
    { organizationId: organization._id, branchId: otherBranch._id, name: 'ENG JR.', code: 'ENG-JR', createdBy: owner._id },
  ]);

  const ownerToken = tokenFor(owner);
  const headOfficeToken = tokenFor(headOffice);
  const secondHeadOfficeToken = tokenFor(secondHeadOffice);
  const branchAdminToken = tokenFor(branchAdmin);
  const staffToken = tokenFor(staffA);

  const editMember = (token, membershipId, organizationId, body) => api(
    '/api/saas/members/' + membershipId,
    { token, organizationId, method: 'PATCH', body },
  );

  await t.test('access changes require a reason and reject unknown membership IDs in this organization', async () => {
    const missingReason = await editMember(ownerToken, staffMembership._id, organization._id, { status: 'suspended' });
    assert.equal(missingReason.status, 400);

    const wrongTenantMember = await editMember(ownerToken, outsideOwnerMembership._id, organization._id, {
      status: 'suspended', reason: 'Wrong organization test',
    });
    assert.equal(wrongTenantMember.status, 404);
  });

  await t.test('self-access and owner access cannot be changed through the regular edit screen', async () => {
    const selfChange = await editMember(ownerToken, ownerMembership._id, organization._id, {
      status: 'suspended', reason: 'Self suspension test',
    });
    assert.equal(selfChange.status, 409);

    const ownerChange = await editMember(headOfficeToken, ownerMembership._id, organization._id, {
      status: 'suspended', reason: 'Protect owner access',
    });
    assert.equal(ownerChange.status, 409);
  });

  await t.test('head-office administrators cannot edit another head-office administrator', async () => {
    const response = await editMember(headOfficeToken, secondHeadOfficeMembership._id, organization._id, {
      status: 'suspended', reason: 'Check head office separation',
    });
    assert.equal(response.status, 403);
  });

  await t.test('branch administrators cannot change staff outside their branch scope', async () => {
    const outsideBranchEdit = await editMember(branchAdminToken, otherBranchStaffMembership._id, organization._id, {
      status: 'suspended', reason: 'Attempt other branch edit',
    });
    assert.equal(outsideBranchEdit.status, 403);

    const branchExpansion = await editMember(branchAdminToken, staffMembership._id, organization._id, {
      branchIds: [String(branch._id), String(otherBranch._id)],
      reason: 'Attempt to expand branch scope',
    });
    assert.equal(branchExpansion.status, 403);
  });

  await t.test('branch administrators cannot promote teachers into finance roles', async () => {
    const response = await editMember(branchAdminToken, staffMembership._id, organization._id, {
      role: 'accountant', reason: 'Attempt finance role promotion',
    });
    assert.equal(response.status, 403);
  });

  await t.test('branch administrators cannot edit all-branch or finance memberships', async () => {
    const wideAccess = await makeMembership({
      organizationId: organization._id, user: await makeUser('wide-staff', 'admin'),
      role: 'head_office_admin', branchIds: [], accessAllBranches: true,
    });
    const wideResponse = await editMember(branchAdminToken, wideAccess._id, organization._id, {
      status: 'suspended', reason: 'Attempt to edit all branch access',
    });
    assert.equal(wideResponse.status, 403);

    const financeResponse = await editMember(branchAdminToken, accountantMembership._id, organization._id, {
      status: 'suspended', reason: 'Attempt to edit finance membership',
    });
    assert.equal(financeResponse.status, 403);
  });

  await t.test('an owner can suspend staff, writes an audit event, and the account immediately loses tenant access', async () => {
    const response = await editMember(ownerToken, staffMembership._id, organization._id, {
      status: 'suspended', reason: 'Employment ended; access removed',
    });
    assert.equal(response.status, 200);
    assert.equal(response.data.status, 'suspended');
    assert.equal(response.data.sessionsRevoked, true);

    const persisted = await OrganizationMembership.findById(staffMembership._id).lean();
    assert.equal(persisted.status, 'suspended');

    const audit = await AuditEvent.findOne({
      organizationId: organization._id,
      resourceType: 'organization_membership',
      resourceId: String(staffMembership._id),
      action: 'membership.updated',
    }).lean();
    assert.ok(audit);
    assert.equal(audit.reason, 'Employment ended; access removed');
    assert.ok(audit.changedFields.includes('status'));
    assert.ok(audit.changedFields.includes('userSessionsRevoked'));

    const requestWithSuspendedToken = await api('/api/saas/operations/summary', {
      token: staffToken, organizationId: organization._id, branchId: branch._id,
    });
    assert.equal(requestWithSuspendedToken.status, 401);
  });
});
