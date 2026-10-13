'use strict';

const mongoose = require('mongoose');

const MEDIA_CATEGORIES = [
  'child_photo',
  'staff_photo',
  'gallery_image',
  'learning_pdf',
  'learning_video',
];

const TenantMediaAssetSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  category: { type: String, enum: MEDIA_CATEGORIES, required: true, immutable: true, index: true },
  childId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', default: null, immutable: true, index: true },
  className: { type: String, trim: true, maxlength: 80, default: '', immutable: true },
  staffUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, immutable: true, index: true },
  storageName: { type: String, required: true, trim: true, maxlength: 100, immutable: true, select: false },
  mimeType: { type: String, required: true, enum: [
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf', 'video/mp4', 'video/webm', 'video/quicktime',
  ], immutable: true },
  sizeBytes: { type: Number, required: true, min: 1, max: 104857600, immutable: true },
  originalFileName: { type: String, trim: true, maxlength: 180, default: '', immutable: true },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  audience: { type: String, enum: ['staff_only', 'parent_with_photo_consent'], default: 'staff_only', immutable: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archiveReason: { type: String, trim: true, maxlength: 500, default: '' },
}, { timestamps: true, strict: 'throw' });

TenantMediaAssetSchema.index({ organizationId: 1, branchId: 1, category: 1, status: 1, createdAt: -1 });
TenantMediaAssetSchema.index({ organizationId: 1, branchId: 1, childId: 1, category: 1, status: 1 });
TenantMediaAssetSchema.index({ organizationId: 1, branchId: 1, staffUserId: 1, category: 1, status: 1 });

module.exports = mongoose.model('TenantMediaAsset', TenantMediaAssetSchema);
module.exports.MEDIA_CATEGORIES = MEDIA_CATEGORIES;
