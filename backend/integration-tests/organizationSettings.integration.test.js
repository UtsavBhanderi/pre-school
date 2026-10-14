'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('organization and branch settings are role-gated, tenant-scoped and audited', {
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
  const FeeInvoice = require('../models/FeeInvoice');
  const FeeTransaction = require('../models/FeeTransaction');
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
  const membershipIds = [];
  const invoiceIds = [];

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
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function makeUser(label, legacyRole) {
    const user = await User.create({
      username: label + '-' + tag,
      email: label + '-' + tag + '@example.test',
      password: 'settings-test-password-' + tag,
      role: legacyRole || 'teacher',
    });
    userIds.push(user._id);
    return user;
  }

  async function makeMembership(user, organizationId, branchId, role) {
    const membership = await OrganizationMembership.create({
      organizationId,
      userId: user._id,
      role,
      branchIds: branchId ? [branchId] : [],
      accessAllBranches: role === 'organization_owner' || role === 'head_office_admin',
      status: 'active',
    });
    membershipIds.push(membership._id);
    return membership;
  }

  async function cleanup() {
    const organizationFilter = { organizationId: { $in: organizationIds } };
    await Promise.allSettled([
      FeeTransaction.deleteMany(organizationFilter),
      FeeInvoice.deleteMany(organizationFilter),
      AuditEvent.deleteMany(organizationFilter),
      OrganizationMembership.deleteMany(organizationFilter),
      Branch.deleteMany({ _id: { $in: branchIds } }),
      Organization.deleteMany({ _id: { $in: organizationIds } }),
      User.deleteMany({ _id: { $in: userIds } }),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanup);

  const owner = await makeUser('owner', 'admin');
  const otherOwner = await makeUser('other-owner', 'admin');
  const teacher = await makeUser('teacher', 'teacher');
  const organization = await Organization.create({
    name: 'Settings School ' + tag,
    slug: 'settings-school-' + tag,
    createdBy: owner._id,
  });
  const otherOrganization = await Organization.create({
    name: 'Other Settings School ' + tag,
    slug: 'other-settings-school-' + tag,
    createdBy: otherOwner._id,
  });
  organizationIds.push(organization._id, otherOrganization._id);

  const branch = await Branch.create({
    organizationId: organization._id,
    name: 'Main Branch',
    code: 'MAIN-' + tag.slice(0, 5).toUpperCase(),
    createdBy: owner._id,
  });
  const otherBranch = await Branch.create({
    organizationId: otherOrganization._id,
    name: 'Outside Branch',
    code: 'OUT-' + tag.slice(0, 5).toUpperCase(),
    createdBy: otherOwner._id,
  });
  branchIds.push(branch._id, otherBranch._id);
  await makeMembership(owner, organization._id, branch._id, 'organization_owner');
  await makeMembership(otherOwner, otherOrganization._id, otherBranch._id, 'organization_owner');
  await makeMembership(teacher, organization._id, branch._id, 'teacher');

  const ownerToken = tokenFor(owner);
  const otherOwnerToken = tokenFor(otherOwner);
  const teacherToken = tokenFor(teacher);

  const initial = await api('/api/saas/settings/organization', {
    token: ownerToken,
    organizationId: organization._id,
  });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.name, organization.name);
  assert.equal(initial.data.settings.academicYearStartMonth, 4);

  const saved = await api('/api/saas/settings/organization', {
    token: ownerToken,
    organizationId: organization._id,
    method: 'PUT',
    body: {
      name: 'Updated School ' + tag,
      timezone: 'Asia/Kolkata',
      locale: 'gu-IN',
      currency: 'USD',
      contact: {
        email: 'info@example.test',
        phone: '+91 90000 11111',
        website: 'https://school.example.test',
        address: { city: 'Surat', state: 'Gujarat', postalCode: '395001', country: 'India' },
      },
      settings: { academicYearStartMonth: 6, dateFormat: 'YYYY-MM-DD', defaultLanguage: 'gu' },
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.data));
  assert.equal(saved.data.organization.name, 'Updated School ' + tag);
  assert.equal(saved.data.organization.currency, 'USD');
  assert.equal(saved.data.organization.contact.email, 'info@example.test');
  assert.equal(saved.data.organization.contact.address.city, 'Surat');
  assert.equal(saved.data.organization.settings.academicYearStartMonth, 6);
  assert.equal(saved.data.organization.settings.defaultLanguage, 'gu');

  const invalid = await api('/api/saas/settings/organization', {
    token: ownerToken,
    organizationId: organization._id,
    method: 'PUT',
    body: { timezone: 'Mars/Olympus' },
  });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.errors.timezone);

  const deniedRole = await api('/api/saas/settings/organization', {
    token: teacherToken,
    organizationId: organization._id,
    method: 'PUT',
    body: { name: 'Teacher Cannot Rename This' },
  });
  assert.equal(deniedRole.status, 403);

  const crossTenant = await api('/api/saas/settings/organization', {
    token: ownerToken,
    organizationId: otherOrganization._id,
  });
  assert.equal(crossTenant.status, 403);

  const branchSaved = await api('/api/saas/settings/branches/' + branch._id, {
    token: ownerToken,
    organizationId: organization._id,
    branchId: branch._id,
    method: 'PUT',
    body: {
      name: 'Main Campus',
      email: 'campus@example.test',
      phone: '+91 90000 22222',
      website: 'https://campus.example.test',
      address: { city: 'Vadodara', state: 'Gujarat' },
    },
  });
  assert.equal(branchSaved.status, 200, JSON.stringify(branchSaved.data));
  assert.equal(branchSaved.data.branch.name, 'Main Campus');
  assert.equal(branchSaved.data.branch.code, branch.code);
  assert.equal(branchSaved.data.branch.address.city, 'Vadodara');

  const audit = await AuditEvent.find({ organizationId: organization._id }).lean();
  assert.ok(audit.some((event) => event.action === 'organization.settings_updated'));
  assert.ok(audit.some((event) => event.action === 'branch.profile_updated' && String(event.branchId) === String(branch._id)));

  const invoice = await FeeInvoice.create({
    organizationId: organization._id,
    branchId: branch._id,
    childId: new mongoose.Types.ObjectId(),
    invoiceNumber: 'INV-LOCK-' + tag,
    academicYear: '2026-2027',
    lineItems: [{ description: 'Tuition fee', quantity: 1, unitAmountPaise: 100000, lineTotalPaise: 100000 }],
    subtotalPaise: 100000,
    discountPaise: 0,
    totalAmountPaise: 100000,
    createdBy: owner._id,
  });
  invoiceIds.push(invoice._id);

  const lockedCurrency = await api('/api/saas/settings/organization', {
    token: ownerToken,
    organizationId: organization._id,
    method: 'PUT',
    body: { currency: 'GBP' },
  });
  assert.equal(lockedCurrency.status, 409);
  assert.equal(lockedCurrency.data.code, 'CURRENCY_LOCKED_BY_FINANCIAL_HISTORY');
});
