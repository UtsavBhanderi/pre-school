'use strict';

const mongoose = require('mongoose');

const INVITABLE_ROLES = [
  'head_office_admin',
  'branch_admin',
  'admissions',
  'teacher',
  'accountant',
  'hr_manager',
  'transport_staff',
  'parent',
];

const OrganizationInvitationSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, immutable: true, index: true },
  branchIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Branch' }], default: [], immutable: true },
  role: { type: String, enum: INVITABLE_ROLES, required: true, immutable: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254, immutable: true },
  fullName: { type: String, required: true, trim: true, maxlength: 120, immutable: true },
  guardianIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Guardian' }], default: [], immutable: true },
  tokenHash: { type: String, required: true, unique: true, select: false, immutable: true },
  status: { type: String, enum: ['pending', 'accepted', 'revoked', 'expired'], default: 'pending', index: true },
  deliveryStatus: { type: String, enum: ['manual', 'sent', 'failed'], default: 'manual' },
  deliveryError: { type: String, trim: true, maxlength: 200, default: '' },
  sentAt: { type: Date, default: null },
  expiresAt: { type: Date, required: true, index: true, immutable: true },
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  acceptedAt: { type: Date, default: null },
  revokedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true, strict: 'throw' });

OrganizationInvitationSchema.index({ organizationId: 1, email: 1, status: 1, createdAt: -1 });
OrganizationInvitationSchema.index({ organizationId: 1, invitedBy: 1, createdAt: -1 });

module.exports = mongoose.model('OrganizationInvitation', OrganizationInvitationSchema);
module.exports.INVITABLE_ROLES = INVITABLE_ROLES;
