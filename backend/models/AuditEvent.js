'use strict';

const mongoose = require('mongoose');

const AuditEventSchema = new mongoose.Schema({
  organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', required: true, index: true, immutable: true },
  branchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Branch', default: null, index: true, immutable: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true, immutable: true },
  action: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  resourceType: { type: String, required: true, trim: true, maxlength: 100, immutable: true },
  resourceId: { type: String, trim: true, maxlength: 100, default: '', immutable: true },
  outcome: { type: String, enum: ['success', 'denied', 'failure'], default: 'success', immutable: true },
  reason: { type: String, trim: true, maxlength: 500, default: '', immutable: true },
  summary: { type: String, trim: true, maxlength: 500, default: '', immutable: true },
  changedFields: { type: [{ type: String, trim: true, maxlength: 100 }], default: [], immutable: true },
  ipAddress: { type: String, trim: true, maxlength: 64, default: '', immutable: true },
  userAgent: { type: String, trim: true, maxlength: 300, default: '', immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

AuditEventSchema.index({ organizationId: 1, createdAt: -1 });
AuditEventSchema.index({ organizationId: 1, branchId: 1, createdAt: -1 });
AuditEventSchema.index({ organizationId: 1, actorUserId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditEvent', AuditEventSchema);
