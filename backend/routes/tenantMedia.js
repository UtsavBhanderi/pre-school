'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const mongoose = require('mongoose');
const multer = require('multer');
const User = require('../models/User');
const Organization = require('../models/Organization');
const Branch = require('../models/Branch');
const OrganizationMembership = require('../models/OrganizationMembership');
const Student = require('../models/Student');
const ChildGuardian = require('../models/ChildGuardian');
const TenantStaffProfile = require('../models/TenantStaffProfile');
const TenantMediaAsset = require('../models/TenantMediaAsset');
const AuditEvent = require('../models/AuditEvent');
const { tenantContext, requireBranchContext } = require('../middleware/tenantContext');
const { canAccessBranch } = require('../utils/tenantAuthorization');
const { activeMemberOfBranch, canUploadMedia, canReadMedia } = require('../utils/tenantMediaPolicy');
const { CATEGORY_RULES, storageNameFor, safeDisplayName, matchesMediaSignature } = require('../utils/tenantMediaFiles');
const { signTenantMediaToken, verifyTenantMediaToken } = require('../utils/tenantPrivateMedia');
const { mediaPublicBaseUrl } = require('../utils/privateMedia');

const router = express.Router();
const uploadRoot = path.resolve(__dirname, '../uploads');
const tenantMediaRoot = path.resolve(uploadRoot, 'tenant-media');
const OBJECT_ID_PATTERN = /^[a-f\d]{24}$/i;
const storageNamePattern = /^[a-f\d-]{36}\.(jpg|png|webp|gif|pdf|mp4|webm|mov)$/i;

router.use(tenantContext);

function clean(value, maxLength = 500) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validId(value) {
  return typeof value === 'string' && OBJECT_ID_PATTERN.test(value);
}

function fileDirectory(organizationId, branchId) {
  return path.resolve(tenantMediaRoot, String(organizationId), String(branchId));
}

function createUploader(req, category) {
  const rules = CATEGORY_RULES[category];
  if (!rules) return null;

  const directory = fileDirectory(req.tenant.organization._id, req.tenant.branch._id);
  const storage = multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdir(directory, { recursive: true, mode: 0o750 }, (error) => callback(error, directory));
    },
    filename(_req, file, callback) {
      const name = storageNameFor(category, file.mimetype);
      if (!name) return callback(new Error('That file type is not allowed for this media category.'));
      callback(null, name);
    },
  });

  return multer({
    storage,
    limits: { fileSize: rules.maxBytes, files: 1, fields: 10, parts: 12 },
    fileFilter(_req, file, callback) {
      if (!Object.prototype.hasOwnProperty.call(rules.mimeExtensions, file.mimetype)) {
        return callback(new Error('Choose a supported file type for this media category.'));
      }
      return callback(null, true);
    },
  }).single('file');
}

async function hasParentPhotoConsent(membership, asset) {
  if (membership?.role !== 'parent' || !Array.isArray(membership.guardianIds) ||
      !membership.guardianIds.length || !asset.childId) return false;
  const relationship = await ChildGuardian.findOne({
    organizationId: asset.organizationId,
    branchId: asset.branchId,
    childId: asset.childId,
    guardianId: { $in: membership.guardianIds },
    'consent.photoUse': 'granted',
  }).select('_id').lean();
  return Boolean(relationship);
}

async function writeMediaAudit({ organizationId, branchId, actorUserId, action, assetId, summary, reason = '', req, session }) {
  const payload = {
    organizationId,
    branchId,
    actorUserId,
    action,
    resourceType: 'tenant_media_asset',
    resourceId: String(assetId || ''),
    outcome: 'success',
    reason: clean(reason, 500),
    summary: clean(summary, 500),
    changedFields: action === 'media.uploaded'
      ? ['category', 'childId', 'mimeType', 'sizeBytes']
      : ['status'],
    ipAddress: String(req.ip || '').slice(0, 64),
    userAgent: String(req.get('user-agent') || '').slice(0, 300),
  };
  await AuditEvent.create([payload], session ? { session } : {});
}

async function withTransaction(work) {
  let session;
  try {
    session = await mongoose.startSession();
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    if (session) await session.endSession();
  }
}

function buildSignedUrl(req, userId, asset) {
  const secret = String(process.env.PRIVATE_MEDIA_SECRET || '');
  if (secret.length < 32) {
    const error = new Error('Private media delivery is not configured. Contact the system administrator.');
    error.code = 'PRIVATE_MEDIA_NOT_CONFIGURED';
    throw error;
  }
  const token = signTenantMediaToken({
    userId,
    assetId: asset._id,
    organizationId: asset.organizationId,
    branchId: asset.branchId,
    secret,
  });
  return mediaPublicBaseUrl(req) + '/api/media/file?token=' + encodeURIComponent(token);
}

function serializeAsset(req, asset) {
  return {
    id: String(asset._id),
    category: asset.category,
    childId: asset.childId ? String(asset.childId) : null,
    className: asset.className || '',
    staffUserId: asset.staffUserId ? String(asset.staffUserId) : null,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes,
    fileName: asset.originalFileName || 'School resource',
    audience: asset.audience,
    uploadedAt: asset.createdAt,
    url: buildSignedUrl(req, req.user._id, asset),
  };
}

async function visibleBranchIds(req) {
  const membership = req.tenant.membership;
  if (req.tenant.branch) return [req.tenant.branch._id];

  let candidates;
  if (membership.accessAllBranches) {
    candidates = await Branch.find({
      organizationId: req.tenant.organization._id,
      status: 'active',
    }).select('_id').lean();
    candidates = candidates.map((branch) => branch._id);
  } else {
    candidates = (membership.branchIds || []).map((item) => item?._id || item);
  }
  const active = candidates.length ? await Branch.find({
    _id: { $in: candidates },
    organizationId: req.tenant.organization._id,
    status: 'active',
  }).select('_id').lean() : [];
  return active.map((branch) => branch._id);
}

async function mediaCanBeRead(membership, asset) {
  const parentHasPhotoConsent = await hasParentPhotoConsent(membership, asset);
  return canReadMedia({ membership, asset, parentHasPhotoConsent });
}

async function validateUploadTarget(req, category) {
  const role = req.tenant.membership.role;
  if (!canUploadMedia({ membership: req.tenant.membership, category })) {
    return { valid: false, status: 403, message: 'Your role cannot upload this media type.' };
  }

  const result = {
    valid: true,
    child: null,
    staffUserId: null,
    className: '',
    audience: 'staff_only',
  };

  if (category === 'child_photo') {
    const childId = clean(req.query.childId || req.body?.childId, 32);
    if (!validId(childId)) return { valid: false, status: 400, message: 'Choose a valid child record before uploading a photo.' };
    const child = await Student.findOne({
      _id: childId,
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
    }).select('_id standard').lean();
    if (!child) return { valid: false, status: 404, message: 'The child was not found in this organization and branch.' };
    result.child = child;
    result.className = child.standard || '';

    const requestedFamilyView = String(req.query.parentVisible || req.body?.parentVisible || '') === 'true';
    if (requestedFamilyView) {
      const consentCount = await ChildGuardian.countDocuments({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        childId: child._id,
        'consent.photoUse': 'granted',
      });
      if (!consentCount) {
        return {
          valid: false,
          status: 409,
          message: 'Family viewing is disabled until a linked guardian has recorded photo-use consent.',
        };
      }
      result.audience = 'parent_with_photo_consent';
    }
  }

  if (category === 'staff_photo') {
    const targetUserId = clean(req.query.staffUserId || req.body?.staffUserId, 32);
    if (!validId(targetUserId)) return { valid: false, status: 400, message: 'Choose a valid staff account for this photograph.' };
    const targetMembership = await OrganizationMembership.findOne({
      organizationId: req.tenant.organization._id,
      userId: targetUserId,
      status: 'active',
      $or: [
        { accessAllBranches: true },
        { branchIds: req.tenant.branch._id },
      ],
    }).select('_id').lean();
    if (!targetMembership) {
      return { valid: false, status: 404, message: 'The staff account is not assigned to this branch.' };
    }
    const exists = await TenantStaffProfile.exists({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      userId: targetUserId,
      status: 'active',
    });
    if (!exists) return { valid: false, status: 404, message: 'An active staff profile is required before uploading its photo.' };
    result.staffUserId = targetUserId;
  }

  return result;
}

router.get('/staff-targets', requireBranchContext, async (req, res) => {
  if (!['organization_owner', 'head_office_admin', 'branch_admin', 'hr_manager'].includes(req.tenant.membership.role)) {
    return res.status(403).json({ message: 'Your role cannot manage staff photos.' });
  }

  try {
    const profiles = await TenantStaffProfile.find({
      organizationId: req.tenant.organization._id,
      branchId: req.tenant.branch._id,
      status: 'active',
    })
      .select('userId displayName employeeCode firstName middleName lastName')
      .sort({ displayName: 1 })
      .lean();

    if (!profiles.length) return res.json({ total: 0, staff: [] });

    const userIds = [...new Set(profiles.map((profile) => String(profile.userId)))];
    const [memberships, users] = await Promise.all([
      OrganizationMembership.find({
        organizationId: req.tenant.organization._id,
        userId: { $in: userIds },
        status: 'active',
        $or: [
          { accessAllBranches: true },
          { branchIds: req.tenant.branch._id },
        ],
      }).select('userId role').lean(),
      User.find({ _id: { $in: userIds } }).select('username email').lean(),
    ]);

    const membershipByUser = new Map(memberships.map((membership) => [String(membership.userId), membership]));
    const userById = new Map(users.map((user) => [String(user._id), user]));
    const staff = profiles.filter((profile) =>
      membershipByUser.has(String(profile.userId)) && userById.has(String(profile.userId))
    ).map((profile) => {
      const user = userById.get(String(profile.userId));
      const membership = membershipByUser.get(String(profile.userId));
      const displayName = String(profile.displayName || [profile.firstName, profile.middleName, profile.lastName].filter(Boolean).join(' ').trim() || user.username || '').trim();
      return {
        userId: String(profile.userId),
        displayName,
        employeeCode: profile.employeeCode || '',
        email: user.email || '',
        role: membership.role,
      };
    });

    return res.json({ total: staff.length, staff });
  } catch (error) {
    console.error('Unable to list staff photo targets:', error.message);
    return res.status(503).json({ message: 'Staff photo targets could not be loaded.' });
  }
});

router.get('/', async (req, res) => {
  const membership = req.tenant.membership;
  if (membership.role === 'parent' &&
      (!Array.isArray(membership.guardianIds) || membership.guardianIds.length === 0)) {
    return res.status(403).json({ message: 'This parent account has no verified family links.' });
  }

  const category = clean(req.query.category, 40);
  const childId = clean(req.query.childId, 32);
  if (category && !TenantMediaAsset.schema.path('category').enumValues.includes(category)) {
    return res.status(400).json({ message: 'Choose a valid media category.' });
  }
  if (childId && !validId(childId)) return res.status(400).json({ message: 'Choose a valid child record.' });

  try {
    const branches = await visibleBranchIds(req);
    if (!branches.length) return res.json({ total: 0, assets: [] });

    const filter = {
      organizationId: req.tenant.organization._id,
      branchId: { $in: branches },
      status: 'active',
    };
    if (category) filter.category = category;
    if (childId) filter.childId = childId;

    if (membership.role === 'parent') {
      filter.category = 'child_photo';
      filter.audience = 'parent_with_photo_consent';
      const visibleLinks = await ChildGuardian.find({
        organizationId: req.tenant.organization._id,
        branchId: { $in: branches },
        guardianId: { $in: membership.guardianIds },
        'consent.photoUse': 'granted',
      }).select('childId').lean();
      const visibleChildIds = [...new Set(visibleLinks.map((link) => String(link.childId)))];
      if (!visibleChildIds.length) return res.json({ total: 0, assets: [] });
      filter.childId = { $in: visibleChildIds };
    } else if (membership.role === 'teacher') {
      const assigned = membership.classNames || [];
      if (!assigned.length) return res.json({ total: 0, assets: [] });
      filter.$or = [
        { category: { $in: ['gallery_image', 'learning_pdf', 'learning_video'] } },
        { category: 'child_photo', className: { $in: assigned } },
      ];
    }

    const assets = await TenantMediaAsset.find(filter)
      .select('-storageName')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    const readable = [];
    for (const asset of assets) {
      if (await mediaCanBeRead(membership, asset)) readable.push(asset);
    }
    const serialized = readable.map((asset) => {
      try { return serializeAsset(req, asset); } catch (error) { throw error; }
    });
    return res.json({ total: serialized.length, assets: serialized });
  } catch (error) {
    if (error.code === 'PRIVATE_MEDIA_NOT_CONFIGURED') {
      return res.status(503).json({ code: error.code, message: error.message });
    }
    console.error('Unable to list private media assets:', error.message);
    return res.status(503).json({ message: 'Private media could not be loaded.' });
  }
});

router.post('/upload/:category', requireBranchContext, async (req, res) => {
  const category = clean(req.params.category, 40);
  const rules = CATEGORY_RULES[category];
  if (!rules) return res.status(400).json({ message: 'Choose a supported media category.' });
  if (!canUploadMedia({ membership: req.tenant.membership, category })) {
    return res.status(403).json({ message: 'Your role cannot upload this media type.' });
  }
  if (!String(process.env.PRIVATE_MEDIA_SECRET || '').trim() || String(process.env.PRIVATE_MEDIA_SECRET).length < 32) {
    return res.status(503).json({ message: 'Private media delivery is not configured. Contact the system administrator.' });
  }

  let uploadTarget;
  try {
    uploadTarget = await validateUploadTarget(req, category);
  } catch (error) {
    console.error('Unable to verify private media upload target:', error.message);
    return res.status(503).json({ message: 'The photo or resource owner could not be verified.' });
  }
  if (!uploadTarget.valid) return res.status(uploadTarget.status).json({ message: uploadTarget.message });

  const uploader = createUploader(req, category);
  uploader(req, res, async (uploadError) => {
    if (uploadError) {
      const tooLarge = uploadError.code === 'LIMIT_FILE_SIZE';
      return res.status(tooLarge ? 413 : 400).json({
        message: tooLarge
          ? 'This file is too large for the selected media type.'
          : uploadError.message || 'The file could not be uploaded.',
      });
    }
    if (!req.file) return res.status(400).json({ message: 'Choose a file to upload.' });

    let fileStillNeeded = false;
    try {
      const handle = await fs.promises.open(req.file.path, 'r');
      const header = Buffer.alloc(16);
      let bytesRead = 0;
      try { ({ bytesRead } = await handle.read(header, 0, header.length, 0)); }
      finally { await handle.close(); }
      if (!matchesMediaSignature(header.subarray(0, bytesRead), req.file.mimetype)) {
        await fs.promises.rm(req.file.path, { force: true });
        return res.status(400).json({ message: 'The file contents do not match the selected file type. Please choose a genuine image, PDF or video file.' });
      }

      const storageName = path.basename(req.file.filename);
      const asset = await withTransaction(async (session) => {
        const [created] = await TenantMediaAsset.create([{
          organizationId: req.tenant.organization._id,
          branchId: req.tenant.branch._id,
          category,
          childId: uploadTarget.child?._id || null,
          className: uploadTarget.className,
          staffUserId: uploadTarget.staffUserId || null,
          storageName,
          mimeType: req.file.mimetype,
          sizeBytes: req.file.size,
          originalFileName: safeDisplayName(req.file.originalname),
          audience: uploadTarget.audience,
          uploadedBy: req.user._id,
        }], { session });

        await writeMediaAudit({
          organizationId: req.tenant.organization._id,
          branchId: req.tenant.branch._id,
          actorUserId: req.user._id,
          action: 'media.uploaded',
          assetId: created._id,
          summary: 'Private ' + category.replaceAll('_', ' ') + ' uploaded.',
          req,
          session,
        });
        return created;
      });
      fileStillNeeded = true;
      const response = serializeAsset(req, asset.toObject ? asset.toObject() : asset);
      return res.status(201).json({ message: 'File uploaded privately.', asset: response });
    } catch (error) {
      if (error.code === 'PRIVATE_MEDIA_NOT_CONFIGURED') {
        return res.status(503).json({ message: error.message });
      }
      console.error('Private media upload failed:', error.message);
      return res.status(503).json({ message: 'The file could not be saved safely.' });
    } finally {
      if (!fileStillNeeded && req.file?.path) {
        await fs.promises.rm(req.file.path, { force: true }).catch(() => {});
      }
    }
  });
});

router.get('/:id/url', async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Choose a valid media item.' });
  try {
    const branches = await visibleBranchIds(req);
    const asset = await TenantMediaAsset.findOne({
      _id: req.params.id,
      organizationId: req.tenant.organization._id,
      branchId: { $in: branches },
      status: 'active',
    }).select('-storageName').lean();
    if (!asset) return res.status(404).json({ message: 'Private media item not found in your organization access scope.' });
    if (!(await mediaCanBeRead(req.tenant.membership, asset))) {
      return res.status(403).json({ message: 'You are not allowed to open this private media item.' });
    }
    return res.json({ url: buildSignedUrl(req, req.user._id, asset), expiresInSeconds: 120 });
  } catch (error) {
    if (error.code === 'PRIVATE_MEDIA_NOT_CONFIGURED') {
      return res.status(503).json({ code: error.code, message: error.message });
    }
    console.error('Unable to authorize private media link:', error.message);
    return res.status(503).json({ message: 'Media access could not be verified.' });
  }
});

router.patch('/:id/archive', requireBranchContext, async (req, res) => {
  if (!validId(req.params.id)) return res.status(400).json({ message: 'Choose a valid media item.' });
  if (!['organization_owner', 'head_office_admin', 'branch_admin'].includes(req.tenant.membership.role)) {
    return res.status(403).json({ message: 'Only an authorized administrator can archive media.' });
  }
  const reason = clean(req.body?.reason, 500);
  if (reason.length < 3) return res.status(400).json({ message: 'Enter a reason before archiving this file.' });

  try {
    await withTransaction(async (session) => {
      const asset = await TenantMediaAsset.findOne({
        _id: req.params.id,
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        status: 'active',
      }).session(session);
      if (!asset) {
        const missing = new Error('Active media item not found in the selected branch.');
        missing.code = 'MEDIA_NOT_FOUND';
        throw missing;
      }
      const archivedAt = new Date();
      const archivedAsset = await TenantMediaAsset.findOneAndUpdate(
        {
          _id: asset._id,
          organizationId: req.tenant.organization._id,
          branchId: req.tenant.branch._id,
          status: 'active',
        },
        {
          $set: {
            status: 'archived',
            archivedAt,
            archivedBy: req.user._id,
            archiveReason: reason,
          },
        },
        { new: true, runValidators: true, session },
      ).select('_id');

      if (!archivedAsset) {
        const concurrentArchive = new Error('This media item was already archived.');
        concurrentArchive.code = 'MEDIA_NOT_FOUND';
        throw concurrentArchive;
      }
      await writeMediaAudit({
        organizationId: req.tenant.organization._id,
        branchId: req.tenant.branch._id,
        actorUserId: req.user._id,
        action: 'media.archived',
        assetId: asset._id,
        summary: 'Private media archived.',
        reason,
        req,
        session,
      });
    });
    return res.json({ message: 'Media archived. Its signed links will no longer work.' });
  } catch (error) {
    if (error.code === 'MEDIA_NOT_FOUND') return res.status(404).json({ message: error.message });
    console.error('Unable to archive private media:', error.message);
    return res.status(503).json({ message: 'The media item could not be archived safely.' });
  }
});

module.exports = router;

