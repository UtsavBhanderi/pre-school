'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('staff photo targets and uploads stay within the selected organization and branch', {
  skip: !integrationUri ? 'Set MONGO_INTEGRATION_URI to a disposable MongoDB replica set.' : false,
}, async (t) => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-only-secret-at-least-32-characters';
  process.env.PRIVATE_MEDIA_SECRET = 'integration-media-secret-at-least-32-characters';
  process.env.MONGO_URI = integrationUri;
  process.env.NODE_ENV = 'test';

  const { app } = require('../server');
  const User = require('../models/User');
  const Organization = require('../models/Organization');
  const Branch = require('../models/Branch');
  const OrganizationMembership = require('../models/OrganizationMembership');
  const TenantStaffProfile = require('../models/TenantStaffProfile');
  const TenantMediaAsset = require('../models/TenantMediaAsset');
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

  const tokenFor = (user) => jwt.sign(
    { user: { id: String(user._id), role: user.role } },
    process.env.JWT_SECRET,
    { expiresIn: '1h' },
  );

  function headers(token, organizationId, branchId) {
    return {
      ...(token ? { 'x-auth-token': token } : {}),
      ...(organizationId ? { 'x-organization-id': String(organizationId) } : {}),
      ...(branchId ? { 'x-branch-id': String(branchId) } : {}),
    };
  }

  async function api(url, { token, organizationId, branchId, method = 'GET', body } = {}) {
    const response = await fetch('http://127.0.0.1:' + server.address().port + url, {
      method,
      headers: {
        ...headers(token, organizationId, branchId),
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function uploadPng(url, { token, organizationId, branchId }) {
    const form = new FormData();
    form.append('file', new Blob([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('synthetic-test-image'),
    ], { type: 'image/png' }), 'staff-photo.png');
    const response = await fetch('http://127.0.0.1:' + server.address().port + url, {
      method: 'POST',
      headers: headers(token, organizationId, branchId),
      body: form,
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : null; } catch { data = text; }
    return { status: response.status, data };
  }

  async function cleanUp() {
    const organizationFilter = { organizationId: { $in: createdOrganizationIds } };
    await Promise.allSettled([
      TenantMediaAsset.deleteMany(organizationFilter),
      TenantStaffProfile.deleteMany(organizationFilter),
      AuditEvent.deleteMany(organizationFilter),
      OrganizationMembership.deleteMany(organizationFilter),
      Branch.deleteMany({ _id: { $in: createdBranchIds } }),
      Organization.deleteMany({ _id: { $in: createdOrganizationIds } }),
      User.deleteMany({ _id: { $in: createdUserIds } }),
    ]);
    for (const organizationId of createdOrganizationIds) {
      await fs.rm(path.resolve(__dirname, '..', 'uploads', 'tenant-media', String(organizationId)), { recursive: true, force: true }).catch(() => {});
    }
    await new Promise((resolve) => server.close(resolve));
    await mongoose.disconnect();
  }
  t.after(cleanUp);

  const owner = await User.create({
    username: 'staff-photo-owner-' + tag,
    email: 'staff-photo-owner-' + tag + '@example.test',
    password: 'integration-test-password-' + tag,
    role: 'admin',
  });
  createdUserIds.push(owner._id);

  const staffA = await User.create({
    username: 'staff-photo-a-' + tag,
    email: 'staff-photo-a-' + tag + '@example.test',
    password: 'integration-test-password-' + tag,
    role: 'teacher',
  });
  const staffB = await User.create({
    username: 'staff-photo-b-' + tag,
    email: 'staff-photo-b-' + tag + '@example.test',
    password: 'integration-test-password-' + tag,
    role: 'teacher',
  });
  createdUserIds.push(staffA._id, staffB._id);

  const organization = await Organization.create({
    name: 'Staff Photo Scope School ' + tag,
    slug: 'staff-photo-scope-' + tag,
    createdBy: owner._id,
  });
  createdOrganizationIds.push(organization._id);

  const branchA = await Branch.create({
    organizationId: organization._id,
    name: 'Staff Photo Branch A',
    code: 'SPA-' + tag.slice(0, 4).toUpperCase(),
    createdBy: owner._id,
  });
  const branchB = await Branch.create({
    organizationId: organization._id,
    name: 'Staff Photo Branch B',
    code: 'SPB-' + tag.slice(0, 4).toUpperCase(),
    createdBy: owner._id,
  });
  createdBranchIds.push(branchA._id, branchB._id);

  await OrganizationMembership.create([
    {
      organizationId: organization._id,
      userId: owner._id,
      role: 'organization_owner',
      branchIds: [branchA._id, branchB._id],
      accessAllBranches: true,
      status: 'active',
    },
    {
      organizationId: organization._id,
      userId: staffA._id,
      role: 'teacher',
      branchIds: [branchA._id],
      classNames: ['ENG JR.'],
      accessAllBranches: false,
      status: 'active',
    },
    {
      organizationId: organization._id,
      userId: staffB._id,
      role: 'teacher',
      branchIds: [branchB._id],
      classNames: ['ENG SR.'],
      accessAllBranches: false,
      status: 'active',
    },
  ]);

  await TenantStaffProfile.create([
    {
      organizationId: organization._id,
      branchId: branchA._id,
      userId: staffA._id,
      firstName: 'Branch',
      lastName: 'One Teacher',
      displayName: 'Branch One Teacher',
      email: staffA.email,
      createdBy: owner._id,
    },
    {
      organizationId: organization._id,
      branchId: branchB._id,
      userId: staffB._id,
      firstName: 'Branch',
      lastName: 'Two Teacher',
      displayName: 'Branch Two Teacher',
      email: staffB.email,
      createdBy: owner._id,
    },
  ]);

  const ownerToken = tokenFor(owner);
  const targetList = await api('/api/saas/media/staff-targets', {
    token: ownerToken,
    organizationId: organization._id,
    branchId: branchA._id,
  });
  assert.equal(targetList.status, 200, JSON.stringify(targetList.data));
  assert.deepEqual(targetList.data.staff.map((item) => item.userId), [String(staffA._id)]);
  assert.equal(targetList.data.staff[0].displayName, 'Branch One Teacher');

  const teacherCannotEnumerateStaffPhotoTargets = await api('/api/saas/media/staff-targets', {
    token: tokenFor(staffA),
    organizationId: organization._id,
    branchId: branchA._id,
  });
  assert.equal(teacherCannotEnumerateStaffPhotoTargets.status, 403);

  const upload = await uploadPng(
    '/api/saas/media/upload/staff_photo?staffUserId=' + String(staffA._id),
    { token: ownerToken, organizationId: organization._id, branchId: branchA._id },
  );
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  assert.equal(upload.data.asset.category, 'staff_photo');
  assert.equal(upload.data.asset.staffUserId, String(staffA._id));
  assert.ok(upload.data.asset.url);
  assert.equal(Object.prototype.hasOwnProperty.call(upload.data.asset, 'storageName'), false);

  const crossBranchUpload = await uploadPng(
    '/api/saas/media/upload/staff_photo?staffUserId=' + String(staffB._id),
    { token: ownerToken, organizationId: organization._id, branchId: branchA._id },
  );
  assert.equal(crossBranchUpload.status, 404, JSON.stringify(crossBranchUpload.data));

  const visibleAssets = await api('/api/saas/media?category=staff_photo', {
    token: ownerToken,
    organizationId: organization._id,
    branchId: branchA._id,
  });
  assert.equal(visibleAssets.status, 200, JSON.stringify(visibleAssets.data));
  assert.equal(visibleAssets.data.assets.length, 1);
  assert.equal(visibleAssets.data.assets[0].staffUserId, String(staffA._id));
});
