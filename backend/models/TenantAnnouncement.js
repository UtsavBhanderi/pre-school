'use strict';

const mongoose = require('mongoose');

const TenantAnnouncementSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', required: true, immutable: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  message: { type: String, required: true, trim: true, minlength: 1, maxlength: 3000 },
  audience: { type: String, enum: ['all', 'staff', 'parents'], default: 'all', required: true },
  priority: { type: String, enum: ['normal', 'important', 'urgent'], default: 'normal', required: true },
  startsAt: { type: Date, default: Date.now, required: true },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ['active', 'archived'], default: 'active', required: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true, strict: 'throw' });

TenantAnnouncementSchema.index({ organizationId: 1, branchId: 1, status: 1, startsAt: 1, expiresAt: 1 });
TenantAnnouncementSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });

module.exports = mongoose.model('TenantAnnouncement', TenantAnnouncementSchema);
