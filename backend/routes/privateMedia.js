'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Photo = require('../models/Photo');
const PDF = require('../models/Pdf');
const Video = require('../models/Video');
const OrganizationMembership = require('../models/OrganizationMembership');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const ChildGuardian = require('../models/ChildGuardian');
const TenantStaffProfile = require('../models/TenantStaffProfile');
const TenantMediaAsset = require('../models/TenantMediaAsset');
const { canAccessBranch } = require('../utils/tenantAuthorization');
const { activeMemberOfBranch, canReadMedia } = require('../utils/tenantMediaPolicy');
const { verifyTenantMediaToken } = require('../utils/tenantPrivateMedia');
const { verifyPrivateMediaToken, localMediaReferenceValues } = require('../utils/privateMedia');

const router = express.Router();
const uploadRoot = path.resolve(__dirname, '../uploads');
const MODEL_BY_TYPE = {
  students: { Model: Student, fields: ['studentPhoto', 'motherPhoto', 'fatherPhoto'] },
  teachers: { Model: Teacher, fields: ['selfPhoto', 'motherPhoto', 'fatherPhoto'] },
  gallery: { Model: Photo, fields: ['url'] },
  pdf: { Model: PDF, fields: ['filePath'] },
  video: { Model: Video, fields: ['filePath', 'url'] },
};
const REGEX_SPECIAL = new Set(['.', '*', '+', '?', '^', '$', '|', '(', ')', '{', '}', '[', ']', '\\']);

function escapeRegex(value) {
  return Array.from(value, (character) => REGEX_SPECIAL.has(character) ? '\\' + character : character).join('');
}

async function recordStillReferencesFile(type, filename) {
  const entry = MODEL_BY_TYPE[type];
  if (!entry) return false;

  // Match only the local storage reference for this directory and filename.
  // Suffix-only matching could mistake an unrelated external URL for a local
  // attachment if it happened to use the same final filename.
  const allowedReferences = localMediaReferenceValues(type, filename);
  if (!allowedReferences.length) return false;
  const filter = { $or: entry.fields.map((field) => ({ [field]: { $in: allowedReferences } })) };
  const record = await entry.Model.findOne(filter).select('_id').lean();
  return Boolean(record);
}


const tenantMediaRoot = path.resolve(uploadRoot, 'tenant-media');
const tenantStorageNamePattern = /^[a-f\d-]{36}\.(jpg|png|webp|gif|pdf|mp4|webm|mov)$/i;

async function serveTenantMedia(req, res, claims) {
  if (!claims || !claims.assetId) {
    return res.status(403).json({ message: 'This private resource link is invalid or has expired.' });
  }

  try {
    const [user, organization, branch, membership, asset] = await Promise.all([
      User.findById(claims.userId).select('_id role').lean(),
      Organization.findOne({ _id: claims.organizationId, status: 'active' }).select('_id').lean(),
      Branch.findOne({
        _id: claims.branchId,
        organizationId: claims.organizationId,
        status: 'active',
      }).select('_id').lean(),
      OrganizationMembership.findOne({
        organizationId: claims.organizationId,
        userId: claims.userId,
        status: 'active',
      }).lean(),
      TenantMediaAsset.findOne({
        _id: claims.assetId,
        organizationId: claims.organizationId,
        branchId: claims.branchId,
        status: 'active',
      }).select('+storageName').lean(),
    ]);

    if (!user || !organization || !branch || !membership) {
      return res.status(403).json({ message: 'Your active school access is required to view this private resource.' });
    }
    if (!activeMemberOfBranch(membership, claims.organizationId, claims.branchId) ||
        !canAccessBranch(membership, claims.branchId)) {
      return res.status(403).json({ message: 'This resource is outside your active branch access.' });
    }
    if (!asset || !tenantStorageNamePattern.test(String(asset.storageName || ''))) {
      return res.status(404).json({ message: 'This private media item is no longer available.' });
    }

    if (asset.childId) {
      const child = await Student.findOne({
        _id: asset.childId,
        organizationId: claims.organizationId,
        branchId: claims.branchId,
      }).select('_id').lean();
      if (!child) return res.status(404).json({ message: 'The linked child record is no longer available.' });
    }

    if (asset.category === 'staff_photo') {
      const profile = await TenantStaffProfile.findOne({
        organizationId: claims.organizationId,
        branchId: claims.branchId,
        userId: asset.staffUserId,
        status: 'active',
      }).select('_id').lean();
      if (!profile) return res.status(404).json({ message: 'The linked staff profile is no longer available.' });
    }

    let parentHasPhotoConsent = false;
    if (membership.role === 'parent' && asset.childId && membership.guardianIds?.length) {
      const link = await ChildGuardian.findOne({
        organizationId: claims.organizationId,
        branchId: claims.branchId,
        childId: asset.childId,
        guardianId: { $in: membership.guardianIds },
        'consent.photoUse': 'granted',
      }).select('_id').lean();
      parentHasPhotoConsent = Boolean(link);
    }

    if (!canReadMedia({ membership, asset, parentHasPhotoConsent })) {
      return res.status(403).json({ message: 'You are not allowed to view this private media item.' });
    }

    const mediaRoot = path.resolve(tenantMediaRoot, String(claims.organizationId), String(claims.branchId));
    const absolutePath = path.resolve(mediaRoot, asset.storageName);
    if (!absolutePath.startsWith(mediaRoot + path.sep)) {
      return res.status(400).json({ message: 'Invalid private media path.' });
    }

    const [realRoot, realFile] = await Promise.all([
      fs.promises.realpath(mediaRoot),
      fs.promises.realpath(absolutePath),
    ]);
    if (!realFile.startsWith(realRoot + path.sep)) {
      return res.status(400).json({ message: 'Invalid private media path.' });
    }
    const stat = await fs.promises.stat(realFile);
    if (!stat.isFile() || stat.size !== asset.sizeBytes) {
      return res.status(404).json({ message: 'The stored private media file is missing or changed.' });
    }

    res.set({
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'Referrer-Policy': 'no-referrer',
      'X-Content-Type-Options': 'nosniff',
      'Content-Type': asset.mimeType,
      'Content-Disposition': 'inline; filename="' + String(asset.originalFileName || 'school-resource').replace(/["\\\r\n]/g, '') + '"',
    });
    return res.sendFile(realFile, (error) => {
      if (error && !res.headersSent) {
        console.error('Tenant private media delivery failed:', error.code || error.name || 'send_file_error');
        res.status(error.statusCode || 404).json({ message: 'The private resource could not be delivered.' });
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ message: 'File not found.' });
    console.error('Tenant private media authorization failed:', error.message);
    return res.status(503).json({ message: 'Private resource access could not be verified.' });
  }
}

router.get('/file', async (req, res) => {
  res.set({
    'Cache-Control': 'private, no-store, max-age=0',
    Pragma: 'no-cache',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
  });

  const tenantClaims = verifyTenantMediaToken(req.query.token, process.env.PRIVATE_MEDIA_SECRET);
  if (tenantClaims) return serveTenantMedia(req, res, tenantClaims);

  const claims = verifyPrivateMediaToken(req.query.token, process.env.JWT_SECRET);
  if (!claims) return res.status(403).json({ message: 'This private resource link is invalid or has expired. Reload the school resource and try again.' });
  if (!mongoose.Types.ObjectId.isValid(claims.userId)) return res.status(403).json({ message: 'This private resource link is invalid.' });

  try {
    const user = await User.findById(claims.userId).select('_id role').lean();
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'You are not allowed to access this school resource.' });
    }

    // Legacy resources use this capability route until their records have full
    // organization scoping. A user connected to any tenant cannot use old links.
    const membership = await OrganizationMembership.exists({ userId: user._id });
    if (membership) return res.status(403).json({ message: 'This resource must be accessed through your organization workspace.' });

    // These links were issued for the legacy single-school application and
    // contain no tenant/branch/record authorization claims. Stop accepting them
    // as soon as SaaS organization data exists; otherwise an unlinked legacy
    // administrator could resolve a filename referenced by a tenant-owned row.
    const anyOrganizationExists = await Organization.exists({});
    if (anyOrganizationExists) {
      return res.status(403).json({
        code: 'LEGACY_MEDIA_DISABLED_FOR_SAAS',
        message: 'This older media link is not organization-scoped and cannot be used while SaaS school data exists. Reload the resource through an enabled workspace feature.',
      });
    }

    if (!(await recordStillReferencesFile(claims.type, claims.filename))) {
      return res.status(404).json({ message: 'This file is no longer attached to a school record.' });
    }

    const mediaRoot = path.resolve(uploadRoot, claims.type);
    const absolutePath = path.resolve(mediaRoot, claims.filename);
    if (!absolutePath.startsWith(mediaRoot + path.sep)) return res.status(400).json({ message: 'Invalid resource path.' });

    const [realRoot, realFile] = await Promise.all([
      fs.promises.realpath(mediaRoot),
      fs.promises.realpath(absolutePath),
    ]);
    if (!realFile.startsWith(realRoot + path.sep)) return res.status(400).json({ message: 'Invalid resource path.' });
    const stat = await fs.promises.stat(realFile);
    if (!stat.isFile()) return res.status(404).json({ message: 'File not found.' });

    res.setHeader('Content-Disposition', 'inline; filename="' + claims.filename.replace(/["\\\r\n]/g, '') + '"');
    return res.sendFile(realFile, (error) => {
      if (error && !res.headersSent) {
        console.error('Private media delivery failed:', error.code || error.name || 'send_file_error');
        res.status(error.statusCode || 404).json({ message: 'The resource could not be delivered.' });
      }
    });
  } catch (error) {
    if (error.code === 'ENOENT') return res.status(404).json({ message: 'File not found.' });
    console.error('Private media authorization failed:', error.message);
    return res.status(503).json({ message: 'Resource access could not be verified.' });
  }
});

module.exports = router;
