'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const mongoose = require('mongoose');

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

  // Replace only the email delivery edge in this isolated test process. The
  // real /signup route, pending token storage and verification API still run.
  const signupEmail = require('../utils/organizationSignupEmail');
  const originalSend = signupEmail.sendOrganizationVerificationEmail;
  let deliveredUrl = '';
  let deliveredCount = 0;
  signupEmail.sendOrganizationVerificationEmail = async ({ verificationUrl }) => {
    deliveredUrl = verificationUrl;
    deliveredCount += 1;
    return { sent: true };
  };

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
  const existingEmail = 'already-registered-' + tag + '@example.test';
  let pending;
  let user;
  let existingUser;
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

  const signupBody = {
    organizationName: 'Verified Preschool ' + tag,
    branchName: 'Main Branch',
    branchCode: 'MAIN',
    username: 'Verified Owner ' + tag,
    email,
    timezone: 'Asia/Kolkata',
  };

  t.after(async () => {
    signupEmail.sendOrganizationVerificationEmail = originalSend;
    await Promise.allSettled([
      PendingOrganizationSignup.deleteMany({ email: { $in: [email, existingEmail] } }),
      ...(organization?._id ? [
        OrganizationMembership.deleteMany({ organizationId: organization._id }),
        AuditEvent.deleteMany({ organizationId: organization._id }),
        Branch.deleteMany({ organizationId: organization._id }),
        Organization.deleteOne({ _id: organization._id }),
      ] : []),
      ...(user?._id ? [User.deleteOne({ _id: user._id })] : []),
      ...(existingUser?._id ? [User.deleteOne({ _id: existingUser._id })] : []),
    ]);
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  });

  const status = await api('/api/organizations/registration-status');
  assert.equal(status.status, 200);
  assert.equal(status.data.enabled, true);

  const started = await api('/api/organizations/signup', {
    method: 'POST',
    body: signupBody,
  });
  assert.equal(started.status, 200);
  assert.match(started.data.message, /verification link shortly/i);
  assert.equal(deliveredCount, 1);
  assert.ok(deliveredUrl);
  assert.ok(!JSON.stringify(started.data).includes(deliveredUrl));

  // A verification request must not provision any account, organization or branch.
  assert.equal(await User.countDocuments({ email }), 0);
  assert.equal(await Organization.countDocuments({ name: signupBody.organizationName }), 0);
  assert.equal(await Branch.countDocuments({ code: 'MAIN' }), 0);

  pending = await PendingOrganizationSignup.findOne({ email }).select('+tokenHash').lean();
  assert.ok(pending);
  assert.equal(pending.status, 'pending');
  assert.equal(pending.tokenHash.length, 64);
  assert.notEqual(pending.tokenHash, deliveredUrl);
  assert.ok(!JSON.stringify(pending).includes(deliveredUrl));

  // Repeated requests cannot rotate or resend an unexpired token indefinitely.
  const repeated = await api('/api/organizations/signup', { method: 'POST', body: signupBody });
  assert.equal(repeated.status, 200);
  assert.equal(repeated.data.message, started.data.message);
  assert.equal(deliveredCount, 1);

  // Existing-account and new-account responses are deliberately indistinguishable.
  existingUser = await User.create({
    username: 'Existing account ' + tag,
    email: existingEmail,
    password: 'existing-account-password-' + tag,
    role: 'admin',
  });
  const existingAccountRequest = await api('/api/organizations/signup', {
    method: 'POST',
    body: { ...signupBody, email: existingEmail },
  });
  assert.equal(existingAccountRequest.status, 200);
  assert.equal(existingAccountRequest.data.message, started.data.message);
  assert.equal(await PendingOrganizationSignup.countDocuments({ email: existingEmail }), 0);
  assert.equal(deliveredCount, 1);

  const sent = new URL(deliveredUrl);
  assert.equal(sent.pathname, '/verify-organization');
  assert.equal(sent.search, '');
  const fragment = new URLSearchParams(sent.hash.slice(1));
  const token = fragment.get('token');
  assert.ok(token);
  assert.ok(token.length >= 40);

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
  assert.equal(complete.data.organization.name, signupBody.organizationName);
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
