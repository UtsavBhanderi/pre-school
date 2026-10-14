'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');
const { createOrganizationSignupToken, organizationSignupExpiry } = require('../utils/organizationSignupTokens');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('organization onboarding verifies email before creating an owner, branch and trial', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';
  process.env.ENABLE_SAAS_REGISTRATION = 'true';
  process.env.SAAS_TENANT_DATA_READY = 'true';
  process.env.SMTP_HOST = 'smtp.integration.test';
  process.env.SMTP_PORT = '587';
  process.env.EMAIL_USER = 'integration@example.test';
  process.env.EMAIL_PASS = 'integration-only-password';
  process.env.FRONTEND_URL = 'http://localhost:5173';

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const PendingOrganizationSignup = require('../models/PendingOrganizationSignup');
  const AuditEvent = require('../models/AuditEvent');

  await mongoose.connect(integrationUri, { serverSelectionTimeoutMS: 10000 });
  const server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });

  const tag = crypto.randomBytes(6).toString('hex');
  const email = 'verified-owner-' + tag + '@example.test';
  const { token, tokenHash } = createOrganizationSignupToken();
  let pending;
  let user;
  let organization;
  let branch;

  async function api(path, { method = 'GET', body, authToken } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + path, {
      method,
      headers: {
        ...(authToken ? { 'x-auth-token': authToken } : {}),
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
    if (pending?._id) await PendingOrganizationSignup.deleteOne({ _id: pending._id }).catch(() => {});
    if (organization?._id) {
      await Promise.allSettled([
        OrganizationMembership.deleteMany({ organizationId: organization._id }),
        AuditEvent.deleteMany({ organizationId: organization._id }),
        Branch.deleteMany({ organizationId: organization._id }),
        Organization.deleteOne({ _id: organization._id }),
      ]);
    }
    if (user?._id) await User.deleteOne({ _id: user._id }).catch(() => {});
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  pending = await PendingOrganizationSignup.create({
    organizationName: 'Verified Preschool ' + tag,
    organizationSlugBase: 'verified-preschool-' + tag,
    branchName: 'Main Branch',
    branchCode: 'MAIN',
    username: 'Verified Owner ' + tag,
    email,
    timezone: 'Asia/Kolkata',
    tokenHash,
    expiresAt: organizationSignupExpiry(),
    status: 'pending',
  });

  const status = await api('/api/organizations/registration-status');
  assert.equal(status.status, 200);
  assert.equal(status.data.enabled, true);

  const inspect = await api('/api/organizations/signup/inspect', {
    method: 'POST',
    body: { token },
  });
  assert.equal(inspect.status, 200);
  assert.equal(inspect.data.signup.email, email);
  assert.ok(!JSON.stringify(inspect.data).includes(token));

  const complete = await api('/api/organizations/signup/complete', {
    method: 'POST',
    body: { token, password: 'verified-signup-password-' + tag },
  });
  assert.equal(complete.status, 201);
  assert.ok(complete.data.token);
  assert.equal(complete.data.organization.name, 'Verified Preschool ' + tag);
  assert.equal(complete.data.branch.code, 'MAIN');
  assert.ok(new Date(complete.data.organization.trialEndsAt).getTime() > Date.now());

  user = await User.findOne({ email });
  organization = await Organization.findById(complete.data.organization.id);
  branch = await Branch.findById(complete.data.branch.id);
  assert.ok(user);
  assert.ok(organization);
  assert.ok(branch);
  assert.equal(organization.subscription.status, 'trial');
  assert.ok(organization.subscription.trialEndsAt instanceof Date);
  assert.equal(String(branch.organizationId), String(organization._id));

  const membership = await OrganizationMembership.findOne({
    organizationId: organization._id,
    userId: user._id,
  }).lean();
  assert.ok(membership);
  assert.equal(membership.role, 'organization_owner');
  assert.equal(membership.accessAllBranches, true);
  assert.deepEqual(membership.branchIds.map(String), [String(branch._id)]);

  const storedSignup = await PendingOrganizationSignup.findById(pending._id).select('+tokenHash').lean();
  assert.equal(storedSignup.status, 'completed');

  const reused = await api('/api/organizations/signup/complete', {
    method: 'POST',
    body: { token, password: 'another-password-' + tag },
  });
  assert.equal(reused.status, 410);

  const direct = await api('/api/organizations/register', {
    method: 'POST',
    body: {
      organizationName: 'Unverified Direct Register',
      branchName: 'Main',
      username: 'Not Verified',
      email: 'direct-' + tag + '@example.test',
      password: 'direct-password-' + tag,
    },
  });
  assert.equal(direct.status, 410);
});
