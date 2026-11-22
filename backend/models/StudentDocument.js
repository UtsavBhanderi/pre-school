'use strict';

const mongoose = require('mongoose');
const { DOCUMENT_TYPES, MAX_STUDENT_DOCUMENT_BYTES } = require('../utils/studentDocumentFiles');

const StudentDocumentSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, immutable: true, index: true },
  documentType: { type: String, enum: DOCUMENT_TYPES, required: true, immutable: true },
  title: { type: String, required: true, trim: true, maxlength: 100 },
  originalFileName: { type: String, required: true, trim: true, maxlength: 180, immutable: true },
  mimeType: { type: String, enum: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'], required: true, immutable: true },
  sizeBytes: { type: Number, required: true, min: 1, max: MAX_STUDENT_DOCUMENT_BYTES, immutable: true },
  storageName: { type: String, required: true, select: false, immutable: true },
  sha256: { type: String, required: true, select: false, immutable: true },
  notes: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['active', 'archived'], default: 'active', index: true },
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, immutable: true },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  archiveReason: { type: String, trim: true, maxlength: 250, default: '' },
}, { timestamps: true, strict: 'throw' });

StudentDocumentSchema.index({ studentId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('StudentDocument', StudentDocumentSchema);
