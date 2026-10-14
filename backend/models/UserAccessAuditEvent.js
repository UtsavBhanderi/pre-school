'use strict';

const mongoose = require('mongoose');

const UserAccessAuditEventSchema = new mongoose.Schema({
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  targetUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, immutable: true },
  targetName: { type: String, trim: true, maxlength: 80, default: '', immutable: true },
  targetEmail: { type: String, trim: true, lowercase: true, maxlength: 254, default: '', immutable: true },
  action: { type: String, enum: ['user.created', 'user.access_updated'], required: true, immutable: true },
  previousRole: { type: String, trim: true, maxlength: 40, default: '', immutable: true },
  role: { type: String, trim: true, maxlength: 40, required: true, immutable: true },
  previousStatus: { type: String, enum: ['active', 'suspended'], default: 'active', immutable: true },
  status: { type: String, enum: ['active', 'suspended'], required: true, immutable: true },
  reason: { type: String, trim: true, maxlength: 500, default: '', immutable: true },
  changedFields: { type: [{ type: String, trim: true, maxlength: 40 }], default: [], immutable: true },
  ipAddress: { type: String, trim: true, maxlength: 64, default: '', immutable: true },
  userAgent: { type: String, trim: true, maxlength: 300, default: '', immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

UserAccessAuditEventSchema.index({ createdAt: -1 });
UserAccessAuditEventSchema.index({ targetUserId: 1, createdAt: -1 });

module.exports = mongoose.model('UserAccessAuditEvent', UserAccessAuditEventSchema);
