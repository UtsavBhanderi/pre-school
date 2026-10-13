'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const {
  TENANT_MEDIA_TOKEN_TTL_SECONDS,
  signTenantMediaToken,
  verifyTenantMediaToken,
} = require('../utils/tenantPrivateMedia');
const {
  activeMemberOfBranch,
  canUploadMedia,
  canReadMedia,
} = require('../utils/tenantMediaPolicy');

const secret = 'separate-tenant-media-secret-used-only-for-tests';
const id = () => new mongoose.Types.ObjectId().toString();
const userId = id();
const assetId = id();
const organizationId = id();
const branchId = id();

test('tenant media links are purpose-specific and expire quickly', () => {
  const token = signTenantMediaToken({ userId, assetId, organizationId, branchId, secret });
  assert.equal(TENANT_MEDIA_TOKEN_TTL_SECONDS, 120);
  assert.deepEqual(verifyTenantMediaToken(token, secret), { userId, assetId, organizationId, branchId });
  assert.equal(verifyTenantMediaToken(token, 'different-secret'), null);
  assert.equal(verifyTenantMediaToken('not-a-token', secret), null);
});

test('tenant media token signing rejects invalid or incomplete scope', () => {
  assert.throws(() => signTenantMediaToken({ userId, assetId, organizationId, branchId: 'bad', secret }), TypeError);
  assert.throws(() => signTenantMediaToken({ userId, assetId, organizationId, branchId }), TypeError);
});

test('media scope requires an active membership in the same organization and assigned branch', () => {
  const membership = { status: 'active', organizationId, branchIds: [branchId], accessAllBranches: false };
  assert.equal(activeMemberOfBranch(membership, organizationId, branchId), true);
  assert.equal(activeMemberOfBranch(membership, organizationId, id()), false);
  assert.equal(activeMemberOfBranch(membership, id(), branchId), false);
  assert.equal(activeMemberOfBranch({ ...membership, status: 'suspended' }, organizationId, branchId), false);
  assert.equal(activeMemberOfBranch({ ...membership, accessAllBranches: true }, organizationId, id()), true);
});

test('only designated staff roles can upload each media category', () => {
  for (const role of ['organization_owner', 'head_office_admin', 'branch_admin', 'admissions']) {
    assert.equal(canUploadMedia({ membership: { role, status: 'active' }, category: 'child_photo' }), true);
    assert.equal(canUploadMedia({ membership: { role, status: 'active' }, category: 'learning_pdf' }), true);
  }
  assert.equal(canUploadMedia({ membership: { role: 'teacher', status: 'active' }, category: 'child_photo' }), false);
  assert.equal(canUploadMedia({ membership: { role: 'parent', status: 'active' }, category: 'child_photo' }), false);
  assert.equal(canUploadMedia({ membership: { role: 'accountant', status: 'active' }, category: 'staff_photo' }), false);
});

test('parent photo access needs the exact linked-child consent decision', () => {
  const parent = { role: 'parent', status: 'active', guardianIds: [id()] };
  const asset = { category: 'child_photo', audience: 'parent_with_photo_consent', childId: id(), status: 'active' };
  assert.equal(canReadMedia({ membership: parent, asset, parentHasPhotoConsent: true }), true);
  assert.equal(canReadMedia({ membership: parent, asset, parentHasPhotoConsent: false }), false);
  assert.equal(canReadMedia({ membership: parent, asset: { ...asset, audience: 'staff_only' }, parentHasPhotoConsent: true }), false);
  assert.equal(canReadMedia({ membership: parent, asset: { ...asset, category: 'gallery_image' }, parentHasPhotoConsent: true }), false);
});

test('teachers may view child photos only for an assigned class', () => {
  const teacher = { role: 'teacher', status: 'active', classNames: ['ENG JR.'], userId };
  const asset = { category: 'child_photo', audience: 'staff_only', childId: id(), className: 'ENG JR.', status: 'active' };
  assert.equal(canReadMedia({ membership: teacher, asset }), true);
  assert.equal(canReadMedia({ membership: teacher, asset: { ...asset, className: 'ENG SR.' } }), false);
});
