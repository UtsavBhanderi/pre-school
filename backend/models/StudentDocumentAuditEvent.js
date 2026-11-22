'use strict';

const mongoose = require('mongoose');

const StudentDocumentAuditEventSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocument', required: true, immutable: true, index: true },
  actorUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true, index: true },
  action: { type: String, enum: ['uploaded', 'downloaded', 'archived'], required: true, immutable: true },
  documentType: { type: String, trim: true, maxlength: 40, default: '', immutable: true },
  ipAddress: { type: String, trim: true, maxlength: 64, default: '', immutable: true },
  userAgent: { type: String, trim: true, maxlength: 300, default: '', immutable: true },
}, { timestamps: { createdAt: true, updatedAt: false }, strict: 'throw' });

StudentDocumentAuditEventSchema.index({ studentId: 1, createdAt: -1 });
StudentDocumentAuditEventSchema.index({ documentId: 1, createdAt: -1 });

module.exports = mongoose.model('StudentDocumentAuditEvent', StudentDocumentAuditEventSchema);
