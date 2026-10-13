'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');

const integrationUri = String(process.env.MONGO_INTEGRATION_URI || '').trim();

test('tenant media uploads and short-lived links enforce branch access and live parent photo consent', {
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
  const Student = require('../models/Student');
  const Guardian = require('../models/Guardian');
  const ChildGuardian = require('../models/ChildGuardian');
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
  let parentMembershipId = null;
  let childId = null;
  let guardianId = null;
  let assetId = null;

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
    // A small PNG signature fixture is sufficient for the server's content
    // type gate; production uploads are stored with a server-generated name.
    form.append('file', new Blob([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('synthetic-test-image'),
    ], { type: 'image/png' }), 'family-photo.png');
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
      ChildGuardian.deleteMany(organizationFilter),
      Guardian.deleteMany(organizationFilter),
      Student.deleteMany(organizationFilter),
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
    username: 'media-owner-' + tag,
    email: 'media-owner-' + tag + '@example.test',
    password: 'integration-test-password-' + tag,
    role: 'admin',
  });
  createdUserIds.push(owner._id);

  const parent = await User.create({
    username: 'media-parent-' + tag,
    email: 'media-parent-' + tag + '@example.test',
    password: 'integration-test-password-' + tag,
    role: 'student',
  });
  createdUserIds.push(parent._id);

  const organization = await Organization.create({
    name: 'Media Privacy School ' + tag,
    slug: 'media-privacy-' + tag,
    createdBy: owner._id,
  });
  createdOrganizationIds.push(organization._id);

  const branch = await Branch.create({
    organizationId: organization._id,
    name: 'Media Branch',
    code: 'MD-' + tag.slice(0, 5).toUpperCase(),
    createdBy: owner._id,
  });
  createdBranchIds.push(branch._id);

  await OrganizationMembership.create({
    organizationId: organization._id,
    userId: owner._id,
    role: 'organization_owner',
    branchIds: [branch._id],
    accessAllBranches: true,
    status: 'active',
  });

  const membership = await OrganizationMembership.create({
    organizationId: organization._id,
    userId: parent._id,
    role: 'parent',
    branchIds: [branch._id],
    guardianIds: [],
    accessAllBranches: false,
    status: 'active',
  });
  parentMembershipId = membership._id;

  const child = await Student.create({
    organizationId: organization._id,
    branchId: branch._id,
    createdBy: owner._id,
    firstName: 'Media',
    middleName: 'Privacy',
    lastName: 'Child',
    standard: 'ENG JR.',
    batchYear: '2026-2027',
    dob: '2022-05-14',
    stuNo: 'MEDIA-' + tag,
  });
  childId = child._id;

  const guardian = await Guardian.create({
    organizationId: organization._id,
    fullName: 'Verified Parent ' + tag,
    email: parent.email,
    phone: '9876543210',
    createdBy: owner._id,
  });
  guardianId = guardian._id;

  await ChildGuardian.create({
    organizationId: organization._id,
    branchId: branch._id,
    childId: child._id,
    guardianId: guardian._id,
    relationship: 'mother',
    isPrimaryContact: true,
    authorizedPickup: true,
    consent: {
      photoUse: 'granted',
      schoolCommunication: 'unknown',
      consentRecordedAt: new Date(),
      consentRecordedBy: owner._id,
    },
    createdBy: owner._id,
  });

  await OrganizationMembership.updateOne(
    { _id: parentMembershipId },
    { $set: { guardianIds: [guardianId] } },
  );

  const ownerToken = tokenFor(owner);
  const parentToken = tokenFor(parent);
  const upload = await uploadPng(
    '/api/saas/media/upload/child_photo?childId=' + String(childId) + '&parentVisible=true',
    { token: ownerToken, organizationId: organization._id, branchId: branch._id },
  );

  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  assert.equal(upload.data.asset.category, 'child_photo');
  assert.equal(upload.data.asset.childId, String(childId));
  assert.equal(upload.data.asset.audience, 'parent_with_photo_consent');
  assert.ok(upload.data.asset.url);
  assert.equal(Object.prototype.hasOwnProperty.call(upload.data.asset, 'storageName'), false);
  assetId = upload.data.asset.id;

  const galleryUpload = await uploadPng(
    '/api/saas/media/upload/gallery_image',
    { token: ownerToken, organizationId: organization._id, branchId: branch._id },
  );
  assert.equal(galleryUpload.status, 201, JSON.stringify(galleryUpload.data));
  assert.equal(galleryUpload.data.asset.category, 'gallery_image');
  assert.equal(galleryUpload.data.asset.audience, 'staff_only');
  const ownerGallery = await api('/api/saas/media?category=gallery_image', {
    token: ownerToken,
    organizationId: organization._id,
    branchId: branch._id,
  });
  assert.equal(ownerGallery.status, 200, JSON.stringify(ownerGallery.data));
  assert.equal(ownerGallery.data.total, 1);
  assert.equal(ownerGallery.data.assets[0].id, galleryUpload.data.asset.id);

  const ownerAccess = await fetch(upload.data.asset.url);
  assert.equal(ownerAccess.status, 200);
  assert.match(ownerAccess.headers.get('content-type') || '', /image\/png/);
  assert.equal(ownerAccess.headers.get('cache-control'), 'private, no-store, max-age=0');
  assert.equal(ownerAccess.headers.get('x-content-type-options'), 'nosniff');

  const parentAssets = await api('/api/saas/media?category=child_photo', {
    token: parentToken,
    organizationId: organization._id,
    branchId: branch._id,
  });
  assert.equal(parentAssets.status, 200, JSON.stringify(parentAssets.data));
  assert.equal(parentAssets.data.total, 1);
  assert.equal(parentAssets.data.assets[0].id, assetId);
  assert.ok(parentAssets.data.assets.every((asset) => asset.category === 'child_photo'));
  assert.ok(!parentAssets.data.assets.some((asset) => asset.id === galleryUpload.data.asset.id));

  const parentMediaLink = parentAssets.data.assets[0].url;
  const parentFile = await fetch(parentMediaLink);
  assert.equal(parentFile.status, 200);

  await ChildGuardian.updateOne(
    { organizationId: organization._id, branchId: branch._id, childId, guardianId },
    { $set: { 'consent.photoUse': 'withdrawn' } },
  );
  const revokedConsentFile = await fetch(parentMediaLink);
  assert.equal(revokedConsentFile.status, 403);
  const afterConsentWithdrawal = await api('/api/saas/media?category=child_photo', {
    token: parentToken,
    organizationId: organization._id,
    branchId: branch._id,
  });
  assert.equal(afterConsentWithdrawal.status, 200);
  assert.equal(afterConsentWithdrawal.data.total, 0);

  const parentUpload = await uploadPng(
    '/api/saas/media/upload/child_photo?childId=' + String(childId),
    { token: parentToken, organizationId: organization._id, branchId: branch._id },
  );
  assert.equal(parentUpload.status, 403);

  await OrganizationMembership.updateOne({ _id: parentMembershipId }, { $set: { status: 'suspended' } });
  const suspendedParentAccess = await fetch(parentMediaLink);
  assert.equal(suspendedParentAccess.status, 403);

  const archived = await api('/api/saas/media/' + assetId + '/archive', {
    token: ownerToken,
    organizationId: organization._id,
    branchId: branch._id,
    method: 'PATCH',
    body: { reason: 'Privacy integration test cleanup.' },
  });
  assert.equal(archived.status, 200, JSON.stringify(archived.data));
  const ownerLinkAfterArchive = await fetch(upload.data.asset.url);
  assert.equal(ownerLinkAfterArchive.status, 404);
});
